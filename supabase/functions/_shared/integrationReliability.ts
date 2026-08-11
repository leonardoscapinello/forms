const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

export class UpstreamProtocolError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "UpstreamProtocolError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Reads a response body without allowing a chunked upstream to exhaust memory. */
export async function readResponseTextLimited(
  response: Response,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<string> {
  const limit = Math.max(1, Math.floor(maxBytes));
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw new UpstreamProtocolError("upstream_response_too_large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > limit) {
        await reader.cancel().catch(() => undefined);
        throw new UpstreamProtocolError("upstream_response_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export async function readResponseJsonLimited<T = unknown>(
  response: Response,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<T> {
  const text = await readResponseTextLimited(response, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamProtocolError("upstream_invalid_json");
  }
}

export function extractResendEmailId(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.id !== "string") return null;
  const id = payload.id.trim();
  return id && id.length <= 256 ? id : null;
}

export type EvolutionMessageAck = { messageId: string; status?: string };

/** Evolution v2 normally acknowledges a queued message in `key.id`. */
export function extractEvolutionMessageAck(
  payload: unknown,
): EvolutionMessageAck | null {
  if (!isRecord(payload)) return null;
  const key = isRecord(payload.key) ? payload.key : null;
  const candidate = key?.id ?? payload.messageId ?? payload.id;
  if (
    typeof candidate !== "string" || !candidate.trim() || candidate.length > 512
  ) return null;
  const status =
    typeof payload.status === "string" && payload.status.length <= 80
      ? payload.status
      : undefined;
  if (status && /^(?:error|failed|rejected)$/i.test(status.trim())) return null;
  return { messageId: candidate.trim(), ...(status ? { status } : {}) };
}

export type OpenAiChatAck = { completionId: string; result: string };

export function extractOpenAiChatAck(payload: unknown): OpenAiChatAck | null {
  if (
    !isRecord(payload) || typeof payload.id !== "string" || !payload.id.trim()
  ) return null;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : null;
  const message = first && isRecord(first.message) ? first.message : null;
  if (
    !message || typeof message.content !== "string" || !message.content.trim()
  ) return null;
  return {
    completionId: payload.id.trim().slice(0, 256),
    result: message.content,
  };
}

export function isGoogleSheetsMutationAck(
  payload: unknown,
  expectedRows: number,
): boolean {
  if (!isRecord(payload)) return false;
  const response = isRecord(payload.updates) ? payload.updates : payload;
  return positiveInteger(response.updatedRows) === expectedRows &&
    typeof response.updatedRange === "string" &&
    response.updatedRange.length > 0;
}

export function isGoogleSheetsClearAck(payload: unknown): boolean {
  return isRecord(payload) &&
    typeof payload.clearedRange === "string" &&
    payload.clearedRange.length > 0;
}

export function isMetaConversionsAck(payload: unknown): boolean {
  return isRecord(payload) &&
    positiveInteger(payload.events_received) !== null &&
    Number(payload.events_received) > 0;
}

export function isTikTokEventsAck(payload: unknown): boolean {
  return isRecord(payload) &&
    Number(payload.code) === 0 &&
    typeof payload.request_id === "string" &&
    payload.request_id.trim().length > 0;
}

/** Bounds untrusted OAuth `expires_in` values before constructing a Date. */
export function googleTokenExpiryIso(
  expiresIn: unknown,
  now = Date.now(),
): string {
  const parsed = Number(expiresIn);
  const seconds = Number.isFinite(parsed) && parsed > 0 && parsed <= 86_400
    ? Math.floor(parsed)
    : 3_600;
  return new Date(now + seconds * 1_000).toISOString();
}

function isSensitiveAnalyticsKey(rawKey: string): boolean {
  const key = rawKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return /(?:^|_)(?:email|e_mail|phone|telefone|celular|whatsapp|cpf|cnpj|ssn|passport|passaporte|birthdate|nascimento|dob|address|endereco|user_agent|ip)(?:_|$)/
    .test(key) ||
    /^(?:name|nome|full_name|nome_completo|first_name|last_name|sobrenome)$/
      .test(key);
}

/** Removes obvious PII and non-primitive values from analytics custom data. */
export function normalizeAnalyticsParams(
  value: unknown,
  prefix = "",
): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const params: Record<string, string | number | boolean> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 25)) {
    if (isSensitiveAnalyticsKey(rawKey)) continue;
    const key = `${prefix}${rawKey}`.replace(/[^A-Za-z0-9_]/g, "_").slice(
      0,
      40,
    );
    if (!key) continue;
    if (typeof rawValue === "string") params[key] = rawValue.slice(0, 1_000);
    else if (typeof rawValue === "boolean") params[key] = rawValue;
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      params[key] = rawValue;
    }
  }
  return params;
}

/**
 * Keeps internal/network details out of public Edge responses and persisted
 * analytics. Known stable error codes remain useful for operations.
 */
export function safeIntegrationErrorCode(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof UpstreamProtocolError) return error.code;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "upstream_timeout";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "upstream_timeout";
  }
  const code = error instanceof Error ? error.message : String(error || "");
  return /^[a-z][a-z0-9_:-]{0,159}$/.test(code) ? code : fallback;
}

function safeWebOrigin(rawOrigin: string): string | null {
  try {
    const url = new URL(rawOrigin);
    const localHttp = url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (
      url.username || url.password || (url.protocol !== "https:" && !localHttp)
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Restricts OAuth completion redirects to the app origin that initiated it. */
export function normalizeOAuthReturnUrl(
  rawUrl: unknown,
  allowedOrigins: readonly string[],
): string | null {
  if (typeof rawUrl !== "string" || !rawUrl || rawUrl.length > 2_048) {
    return null;
  }
  try {
    const url = new URL(rawUrl);
    const origin = safeWebOrigin(url.origin);
    const allowed = new Set(
      allowedOrigins.map(safeWebOrigin).filter((item): item is string =>
        Boolean(item)
      ),
    );
    if (!origin || !allowed.has(origin) || url.username || url.password) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
