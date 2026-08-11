import { requireAdmin } from "../_shared/auth.ts";
import { fetchPublicHttps } from "../_shared/outboundHttp.ts";
import { readResponseTextLimited } from "../_shared/integrationReliability.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_URL_LENGTH = 2048;
const MAX_PAYLOAD_SIZE = 50_000; // ~50KB
const MAX_RESPONSE_SIZE = 50_000;
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH"]);
const BLOCKED_HEADERS = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return { "Content-Type": "application/json" };
  const entries = Object.entries(value).slice(0, 30);
  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim();
    const lowerName = name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(name)) continue;
    if (BLOCKED_HEADERS.has(lowerName) || lowerName.startsWith("sec-")) {
      continue;
    }
    if (typeof rawValue !== "string" || rawValue.length > 4_096) continue;
    headers[name] = rawValue;
  }
  if (
    !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function appendQueryParams(rawUrl: string, value: unknown): string {
  const url = new URL(rawUrl);
  if (!isPlainObject(value)) return url.toString();
  for (const [key, rawValue] of Object.entries(value).slice(0, 50)) {
    if (
      !key || key.length > 200 || typeof rawValue !== "string" ||
      rawValue.length > 4_096
    ) continue;
    url.searchParams.set(key, rawValue);
  }
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const caller = await requireAdmin(req);
    if (!caller.ok) return caller.response;

    // ── Input validation ──
    const bodyResult = await readLimitedJsonObject(
      req,
      MAX_PAYLOAD_SIZE,
      corsHeaders,
    );
    if (!bodyResult.ok) return bodyResult.response;
    const parsedBody = bodyResult.value;
    const { url, payload } = parsedBody;

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL é obrigatória." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (url.length > MAX_URL_LENGTH) {
      return new Response(JSON.stringify({ error: "URL too long." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const method = typeof parsedBody.method === "string"
      ? parsedBody.method.toUpperCase()
      : "POST";
    if (!ALLOWED_METHODS.has(method)) {
      return new Response(JSON.stringify({ error: "Método não permitido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let destinationUrl: string;
    try {
      destinationUrl = appendQueryParams(url, parsedBody.queryParams);
    } catch {
      return new Response(JSON.stringify({ error: "URL inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = normalizeHeaders(parsedBody.headers);
    const requestBody = method === "GET"
      ? undefined
      : JSON.stringify(payload || {});

    const res = await fetchPublicHttps(destinationUrl, {
      method,
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(10_000),
    }, { maxUrlLength: MAX_URL_LENGTH });

    const status = res.status;
    let bodyText = "";
    try {
      bodyText = await readResponseTextLimited(res, MAX_RESPONSE_SIZE);
    } catch {
      return new Response(
        JSON.stringify({ status, ok: false, error: "Response too large." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    let responseBody: unknown = bodyText;
    try {
      responseBody = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      // Text responses are returned as text so the editor can still show them.
    }

    return new Response(
      JSON.stringify({
        status,
        ok: status >= 200 && status < 300,
        body: responseBody,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ status: 0, ok: false, error: "Request failed." }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
