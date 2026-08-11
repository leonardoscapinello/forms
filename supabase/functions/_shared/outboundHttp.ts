import { readResponseJsonLimited } from "./integrationReliability.ts";

export type DnsRecordType = "A" | "AAAA";
export type DnsResolver = (
  hostname: string,
  recordType: DnsRecordType,
) => Promise<string[]>;

export class OutboundHttpError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "OutboundHttpError";
  }
}

export interface PublicHttpsValidationOptions {
  resolver?: DnsResolver;
  maxUrlLength?: number;
  dnsTimeoutMs?: number;
}

export interface PublicHttpsFetchOptions extends PublicHttpsValidationOptions {
  fetchImpl?: typeof fetch;
  maxRedirects?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const REDIRECT_SAFE_HEADERS = new Set([
  "accept",
  "content-type",
  "idempotency-key",
  "user-agent",
  "x-forms-event",
]);
const RESERVED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
];

function normalizedHostname(hostname: string): string {
  const lower = hostname.trim().toLowerCase();
  return lower.startsWith("[") && lower.endsWith("]")
    ? lower.slice(1, -1)
    : lower;
}

function parseIpv4(rawAddress: string): number[] | null {
  const parts = rawAddress.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((
    part,
  ) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return bytes.every((byte) =>
      Number.isInteger(byte) && byte >= 0 && byte <= 255
    )
    ? bytes
    : null;
}

function parseIpv6(rawAddress: string): number[] | null {
  let address = normalizedHostname(rawAddress);
  const zoneIndex = address.indexOf("%");
  if (zoneIndex >= 0) address = address.slice(0, zoneIndex);
  if (!address.includes(":")) return null;

  const ipv4Tail = address.slice(address.lastIndexOf(":") + 1);
  if (ipv4Tail.includes(".")) {
    const bytes = parseIpv4(ipv4Tail);
    if (!bytes) return null;
    const replacement = `${((bytes[0] << 8) | bytes[1]).toString(16)}:${
      ((bytes[2] << 8) | bytes[3]).toString(16)
    }`;
    address = `${address.slice(0, address.lastIndexOf(":"))}:${replacement}`;
  }

  const compressed = address.split("::");
  if (compressed.length > 2) return null;
  const left = compressed[0] ? compressed[0].split(":") : [];
  const right = compressed.length === 2 && compressed[1]
    ? compressed[1].split(":")
    : [];
  if (compressed.length === 1 && left.length !== 8) return null;

  const missing = 8 - left.length - right.length;
  if (missing < (compressed.length === 2 ? 1 : 0)) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (
    parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))
  ) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

/** Returns true for non-routable, private, documentation and transition ranges. */
export function isReservedIpAddress(rawAddress: string): boolean {
  const address = normalizedHostname(rawAddress);
  const ipv4 = parseIpv4(address);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224;
  }

  const ipv6 = parseIpv6(address);
  if (!ipv6) return false;

  const [first, second] = ipv6;
  // At present globally routable unicast IPv6 addresses live in 2000::/3.
  if ((first & 0xe000) !== 0x2000) return true;
  // IETF protocol assignments, documentation and 6to4 transition ranges.
  if (first === 0x2001 && second <= 0x01ff) return true;
  if (first === 0x2001 && second === 0x0db8) return true;
  if (first === 0x2002) return true;
  return false;
}

function isIpLiteral(hostname: string): boolean {
  return parseIpv4(normalizedHostname(hostname)) !== null ||
    parseIpv6(normalizedHostname(hostname)) !== null;
}

function isReservedHostname(hostname: string): boolean {
  const host = normalizedHostname(hostname).replace(/\.$/, "");
  if (!host || host === "localhost" || host === "metadata.google.internal") {
    return true;
  }
  if (!host.includes(".") && !isIpLiteral(host)) return true;
  return RESERVED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorCode: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new OutboundHttpError(errorCode)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function resolveDnsOverHttps(
  hostname: string,
  recordType: DnsRecordType,
): Promise<string[]> {
  const endpoint = new URL("https://cloudflare-dns.com/dns-query");
  endpoint.searchParams.set("name", hostname);
  endpoint.searchParams.set("type", recordType);
  const response = await fetch(endpoint, {
    headers: { Accept: "application/dns-json" },
    redirect: "error",
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new OutboundHttpError("dns_resolution_failed");
  const payload = await readResponseJsonLimited<{
    Status?: number;
    Answer?: { type?: number; data?: string }[];
  }>(response, 64_000);
  if (payload.Status !== 0 && payload.Status !== 3) {
    throw new OutboundHttpError("dns_resolution_failed");
  }
  const expectedType = recordType === "A" ? 1 : 28;
  return (payload.Answer || [])
    .filter((answer) =>
      answer.type === expectedType && typeof answer.data === "string"
    )
    .map((answer) => answer.data as string);
}

export const defaultDnsResolver: DnsResolver = async (hostname, recordType) => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: {
      resolveDns?: (query: string, type: DnsRecordType) => Promise<unknown>;
    };
  };
  if (typeof runtime.Deno?.resolveDns === "function") {
    try {
      const records = await runtime.Deno.resolveDns(hostname, recordType);
      if (Array.isArray(records)) {
        return records.filter((record): record is string =>
          typeof record === "string"
        );
      }
    } catch {
      // Some Edge Runtime builds do not expose resolveDns; use a fixed DoH
      // provider as a compatibility fallback.
    }
  }
  return resolveDnsOverHttps(hostname, recordType);
};

export async function validatePublicHttpsUrl(
  rawUrl: string,
  options: PublicHttpsValidationOptions = {},
): Promise<URL> {
  if (
    typeof rawUrl !== "string" || rawUrl.length === 0 ||
    rawUrl.length > (options.maxUrlLength ?? 4_096)
  ) {
    throw new OutboundHttpError("invalid_url");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OutboundHttpError("invalid_url");
  }
  if (url.protocol !== "https:") throw new OutboundHttpError("https_required");
  if (url.username || url.password) {
    throw new OutboundHttpError("url_credentials_not_allowed");
  }

  const hostname = normalizedHostname(url.hostname);
  if (isReservedHostname(hostname)) {
    throw new OutboundHttpError("reserved_hostname");
  }
  if (isIpLiteral(hostname)) {
    if (isReservedIpAddress(hostname)) {
      throw new OutboundHttpError("reserved_ip_address");
    }
    return url;
  }

  const resolver = options.resolver || defaultDnsResolver;
  const dnsTimeoutMs = Math.max(
    100,
    Math.min(options.dnsTimeoutMs ?? 4_000, 10_000),
  );
  const results = await Promise.allSettled([
    withTimeout(
      resolver(hostname, "A"),
      dnsTimeoutMs,
      "dns_resolution_timeout",
    ),
    withTimeout(
      resolver(hostname, "AAAA"),
      dnsTimeoutMs,
      "dns_resolution_timeout",
    ),
  ]);
  const addresses = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  if (addresses.length === 0) {
    throw new OutboundHttpError("dns_resolution_failed");
  }
  if (
    addresses.some((address) =>
      !isIpLiteral(address) || isReservedIpAddress(address)
    )
  ) {
    throw new OutboundHttpError("dns_resolved_to_reserved_address");
  }
  return url;
}

function headersForCrossOriginRedirect(
  headers: HeadersInit | undefined,
): Headers {
  const filtered = new Headers();
  new Headers(headers).forEach((value, name) => {
    if (REDIRECT_SAFE_HEADERS.has(name.toLowerCase())) {
      filtered.set(name, value);
    }
  });
  return filtered;
}

/**
 * Fetches a public HTTPS URL after resolving DNS and manually revalidating each
 * redirect target. Cross-origin redirects do not inherit arbitrary credentials.
 */
export async function fetchPublicHttps(
  rawUrl: string,
  init: RequestInit = {},
  options: PublicHttpsFetchOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl || fetch;
  const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 3, 5));
  let currentUrl = await validatePublicHttpsUrl(rawUrl, options);
  let currentInit: RequestInit = { ...init, redirect: "manual" };

  for (let redirectCount = 0;; redirectCount += 1) {
    const response = await fetchImpl(currentUrl.toString(), currentInit);
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirectCount >= maxRedirects) {
      await response.body?.cancel().catch(() => undefined);
      throw new OutboundHttpError("too_many_redirects");
    }

    const location = response.headers.get("location");
    if (!location) return response;
    const nextCandidate = new URL(location, currentUrl).toString();
    const nextUrl = await validatePublicHttpsUrl(nextCandidate, options);
    const nextHeaders = nextUrl.origin === currentUrl.origin
      ? new Headers(currentInit.headers)
      : headersForCrossOriginRedirect(currentInit.headers);

    const currentMethod = String(currentInit.method || "GET").toUpperCase();
    const changeToGet = response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        currentMethod === "POST");
    if (changeToGet) {
      nextHeaders.delete("content-type");
      nextHeaders.delete("content-length");
      currentInit = {
        ...currentInit,
        method: "GET",
        body: undefined,
        headers: nextHeaders,
        redirect: "manual",
      };
    } else {
      currentInit = {
        ...currentInit,
        headers: nextHeaders,
        redirect: "manual",
      };
    }

    await response.body?.cancel().catch(() => undefined);
    currentUrl = nextUrl;
  }
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,}$/;
const VIMEO_ID = /^\d+$/;

/** Restricts server-rendered iframes to the same providers allowed by the app. */
export function normalizeTrustedVideoEmbedUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return YOUTUBE_ID.test(id)
        ? `https://www.youtube-nocookie.com/embed/${id}`
        : "";
    }
    if (
      host === "youtube.com" || host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[0] === "embed"
        ? parts[1] || ""
        : url.searchParams.get("v") || "";
      return YOUTUBE_ID.test(id)
        ? `https://www.youtube-nocookie.com/embed/${id}`
        : "";
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1] || "";
      return VIMEO_ID.test(id) ? `https://player.vimeo.com/video/${id}` : "";
    }
  } catch {
    return "";
  }
  return "";
}
