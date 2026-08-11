import { getAuthorizedCaller } from "../_shared/auth.ts";
import { fetchPublicHttps } from "../_shared/outboundHttp.ts";
import {
  extractOpenAiChatAck,
  extractResendEmailId,
  googleTokenExpiryIso,
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import {
  findVerifiedResendSenderDomain,
  ga4ValidationOutcome,
  googleOauthCredentialsChanged,
  hasReoonCredentialError,
  isResendDomainListResponse,
  isResendManagedTestSender,
  summarizePixelValidation,
} from "./validation.ts";
import {
  INTEGRATION_SECRET_FIELDS,
  IntegrationConfigCryptoError,
  type IntegrationType,
  isExactIntegrationConfigWriteAck,
  isIntegrationType,
  MASKED_INTEGRATION_SECRET,
  maskIntegrationConfig,
  openIntegrationConfig,
  openIntegrationConfigRows,
  sealIntegrationConfig,
} from "../_shared/integrationSettingsCrypto.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const MASKED_SECRET = MASKED_INTEGRATION_SECRET;
const MAX_BODY_SIZE = 100_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META_GRAPH_API_VERSION = "v25.0";

const SECRET_FIELDS = INTEGRATION_SECRET_FIELDS as Record<
  string,
  readonly string[]
>;

const CONFIG_FIELDS: Record<string, readonly string[]> = {
  openai: [
    "apiKey",
    "model",
    "systemPrompt",
    "conversationId",
    "webSearch",
    "fileSearch",
  ],
  resend: ["apiKey", "defaultFrom"],
  evolution_api: ["apiUrl", "apiKey", "instanceName"],
  google_oauth: [
    "clientId",
    "clientSecret",
    "accessToken",
    "refreshToken",
    "tokenExpiry",
    "connectedEmail",
    "connectedAt",
  ],
  reoon_email: ["apiKey", "mode"],
  minio_s3: [
    "endpoint",
    "port",
    "accessKey",
    "secretKey",
    "bucket",
    "useSSL",
    "region",
  ],
  pixels: [
    "metaPixelId",
    "metaCapiToken",
    "metaEnabled",
    "ga4MeasurementId",
    "ga4ApiSecret",
    "ga4Enabled",
    "tiktokPixelId",
    "tiktokAccessToken",
    "tiktokEnabled",
    "linkedinPartnerId",
    "linkedinAccessToken",
    "linkedinConversionId",
    "linkedinEnabled",
    "webhookDefaultUrl",
    "webhookEnabled",
  ],
};

type IntegrationRow = {
  id: string;
  integration_type: string;
  label: string;
  is_active: boolean;
  config: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

function encryptionSecret(): string {
  const secret = Deno.env.get("ENCRYPTION_SECRET") ?? "";
  if (!secret) {
    throw new IntegrationConfigCryptoError(
      "integration_encryption_unavailable",
    );
  }
  return secret;
}

async function openStoredRow(
  row: IntegrationRow,
  secret: string,
): Promise<{ row: IntegrationRow; needsMigration: boolean }> {
  if (!isIntegrationType(row.integration_type)) {
    throw new IntegrationConfigCryptoError("invalid_integration_type");
  }
  const opened = await openIntegrationConfig(
    row.integration_type,
    row.config,
    secret,
  );
  return {
    row: { ...row, config: opened.config },
    needsMigration: opened.needsMigration,
  };
}

async function persistEncryptedConfig(
  admin: any,
  row: IntegrationRow,
  plaintextConfig: Record<string, unknown>,
  secret: string,
): Promise<void> {
  if (!isIntegrationType(row.integration_type) || !row.updated_at) {
    throw new Error("integration_migration_row_invalid");
  }
  const encrypted = await sealIntegrationConfig(
    row.integration_type,
    plaintextConfig,
    secret,
  );
  const { data, error, count } = await admin
    .from("integration_settings")
    .update({ config: encrypted }, { count: "exact" })
    .eq("id", row.id)
    .eq("integration_type", row.integration_type)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (error || !isExactIntegrationConfigWriteAck(data, count, row.id)) {
    throw new Error("integration_migration_ack_failed");
  }
}

async function loadAllStoredRows(
  admin: any,
  integrationType: IntegrationType,
): Promise<IntegrationRow[]> {
  const rows: IntegrationRow[] = [];
  const pageSize = 250;
  let cursor = "";
  while (true) {
    let query = admin
      .from("integration_settings")
      .select(
        "id, integration_type, label, is_active, config, created_at, updated_at",
      )
      .eq("integration_type", integrationType)
      .order("id", { ascending: true })
      .limit(pageSize);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw new Error("integration_list_failed");
    const page = (data || []) as IntegrationRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    const nextCursor = page[page.length - 1]?.id || "";
    if (!nextCursor || nextCursor === cursor) {
      throw new Error("integration_list_pagination_failed");
    }
    cursor = nextCursor;
  }
  return rows.sort((left, right) => {
    const byCreatedAt = String(left.created_at || "").localeCompare(
      String(right.created_at || ""),
    );
    return byCreatedAt || left.id.localeCompare(right.id);
  });
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickAllowedConfig(
  integrationType: string,
  value: unknown,
): Record<string, unknown> {
  if (!isPlainObject(value)) return {};
  const config: Record<string, unknown> = {};
  for (const key of CONFIG_FIELDS[integrationType] || []) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      config[key] = value[key];
    }
  }
  return config;
}

function sanitizeRow(row: IntegrationRow): IntegrationRow {
  const config = pickAllowedConfig(row.integration_type, row.config);
  if (!isIntegrationType(row.integration_type)) {
    throw new IntegrationConfigCryptoError("invalid_integration_type");
  }
  return {
    ...row,
    config: maskIntegrationConfig(row.integration_type, config),
  };
}

function catalogRow(row: IntegrationRow): IntegrationRow {
  const config = pickAllowedConfig(row.integration_type, row.config);
  const catalogConfig: Record<string, unknown> = {};
  if (row.integration_type === "resend") {
    catalogConfig.defaultFrom = cleanString(config.defaultFrom, 320);
  } else if (row.integration_type === "evolution_api") {
    catalogConfig.instanceName = cleanString(config.instanceName, 160);
  } else if (row.integration_type === "google_oauth") {
    catalogConfig.connected = typeof config.accessToken === "string" &&
      config.accessToken.length > 0;
  }
  return { ...row, config: catalogConfig };
}

function mergeSecretFields(
  integrationType: string,
  currentConfig: Record<string, unknown>,
  incomingConfig: Record<string, unknown>,
  clearSecretFields: unknown,
): Record<string, unknown> {
  const current = pickAllowedConfig(integrationType, currentConfig);
  const incoming = pickAllowedConfig(integrationType, incomingConfig);
  const next = { ...current, ...incoming };
  const clear = new Set(
    Array.isArray(clearSecretFields)
      ? clearSecretFields.filter((key): key is string =>
        typeof key === "string"
      )
      : [],
  );

  for (const key of SECRET_FIELDS[integrationType] || []) {
    if (clear.has(key)) {
      delete next[key];
      continue;
    }
    const incomingSecret = incoming[key];
    if (
      typeof incomingSecret !== "string" || incomingSecret === "" ||
      incomingSecret === MASKED_SECRET
    ) {
      if (current[key] === undefined) delete next[key];
      else next[key] = current[key];
    }
  }
  return next;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

class IntegrationValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "IntegrationValidationError";
  }
}

type ValidationResult = { status: string; message?: string };

function requireConfigString(
  config: Record<string, unknown>,
  key: string,
  error: string,
  maxLength = 4_096,
): string {
  const value = cleanString(config[key], maxLength);
  if (!value) throw new IntegrationValidationError(error);
  return value;
}

function evolutionBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationValidationError("evolution_invalid_api_url");
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.search ||
    url.hash
  ) {
    throw new IntegrationValidationError("evolution_invalid_api_url");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

async function validateEvolutionConfig(
  config: Record<string, unknown>,
): Promise<string[]> {
  const apiUrl = evolutionBaseUrl(
    requireConfigString(config, "apiUrl", "evolution_api_url_required", 2_048),
  );
  const apiKey = requireConfigString(
    config,
    "apiKey",
    "evolution_api_key_required",
  );
  let target: URL;
  try {
    target = new URL(`${apiUrl}/instance/fetchInstances`);
  } catch {
    throw new IntegrationValidationError("evolution_invalid_api_url");
  }
  let response: Response;
  try {
    response = await fetchPublicHttps(target.toString(), {
      headers: { accept: "application/json", apikey: apiKey },
      signal: AbortSignal.timeout(10_000),
    }, { maxRedirects: 0 });
  } catch {
    throw new IntegrationValidationError("evolution_connection_failed");
  }
  if (response.status === 401 || response.status === 403) {
    throw new IntegrationValidationError("evolution_credentials_invalid");
  }
  if (!response.ok) {
    throw new IntegrationValidationError("evolution_connection_failed");
  }
  let payload: any;
  try {
    payload = await parseLimitedJson(response);
  } catch {
    throw new IntegrationValidationError("evolution_connection_failed");
  }
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : [];
  const names: string[] = candidates
    .map((item: any) =>
      item?.instance?.instanceName || item?.instanceName || item?.name
    )
    .filter((name: unknown): name is string =>
      typeof name === "string" && name.length > 0
    )
    .map((name: string) => name.slice(0, 160));
  return [...new Set<string>(names)].slice(0, 200);
}

async function getEvolutionConnectionState(
  config: Record<string, unknown>,
): Promise<string> {
  const apiUrl = evolutionBaseUrl(
    requireConfigString(config, "apiUrl", "evolution_api_url_required", 2_048),
  );
  const apiKey = requireConfigString(
    config,
    "apiKey",
    "evolution_api_key_required",
  );
  const instanceName = requireConfigString(
    config,
    "instanceName",
    "evolution_instance_required",
    160,
  );
  let target: URL;
  try {
    target = new URL(
      `${apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
  } catch {
    throw new IntegrationValidationError("evolution_invalid_api_url");
  }

  let response: Response;
  try {
    response = await fetchPublicHttps(target.toString(), {
      headers: { accept: "application/json", apikey: apiKey },
      signal: AbortSignal.timeout(10_000),
    }, { maxRedirects: 0 });
  } catch {
    throw new IntegrationValidationError("evolution_connection_failed");
  }
  if (response.status === 401 || response.status === 403) {
    throw new IntegrationValidationError("evolution_credentials_invalid");
  }
  if (!response.ok) {
    throw new IntegrationValidationError("evolution_connection_failed");
  }

  let payload: any;
  try {
    payload = await parseLimitedJson(response);
  } catch {
    throw new IntegrationValidationError("evolution_connection_failed");
  }
  return cleanString(payload?.instance?.state ?? payload?.state, 80)
    .toLowerCase() || "unknown";
}

async function validateOpenAi(
  config: Record<string, unknown>,
): Promise<ValidationResult> {
  const apiKey = requireConfigString(
    config,
    "apiKey",
    "openai_api_key_required",
  );
  const model = requireConfigString(
    config,
    "model",
    "openai_model_required",
    160,
  );
  let response: Response;
  try {
    response = await fetchPublicHttps("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    }, { maxRedirects: 0 });
  } catch {
    throw new IntegrationValidationError("openai_connection_failed");
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError("openai_credentials_invalid");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError("openai_connection_failed");
  }
  let payload: any;
  try {
    payload = await parseLimitedJson(response);
  } catch {
    throw new IntegrationValidationError("openai_connection_failed");
  }
  const models = Array.isArray(payload?.data) ? payload.data : [];
  if (!models.some((candidate: any) => candidate?.id === model)) {
    throw new IntegrationValidationError("openai_model_unavailable");
  }
  let completionResponse: Response;
  try {
    completionResponse = await fetchPublicHttps(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply only with OK." }],
          max_completion_tokens: 8,
        }),
        signal: AbortSignal.timeout(20_000),
      },
      { maxRedirects: 0 },
    );
  } catch {
    throw new IntegrationValidationError("openai_connection_failed");
  }
  if (!completionResponse.ok) {
    await completionResponse.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError(
      completionResponse.status === 401 || completionResponse.status === 403
        ? "openai_credentials_invalid"
        : "openai_model_incompatible",
    );
  }
  const completionPayload = await parseLimitedJson(completionResponse).catch(
    () => null,
  );
  if (!extractOpenAiChatAck(completionPayload)) {
    throw new IntegrationValidationError("openai_model_incompatible");
  }
  return { status: "validated" };
}

async function validateResend(
  config: Record<string, unknown>,
): Promise<ValidationResult> {
  const apiKey = requireConfigString(
    config,
    "apiKey",
    "resend_api_key_required",
  );
  const defaultFrom = requireConfigString(
    config,
    "defaultFrom",
    "resend_default_from_required",
    320,
  );
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(defaultFrom)) {
    throw new IntegrationValidationError("resend_default_from_invalid");
  }
  let response: Response;
  try {
    response = await fetchPublicHttps(
      // Resend returns all domains when `limit` is omitted. That avoids a false
      // negative for accounts whose sender is not on the first page.
      "https://api.resend.com/domains",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      },
      { maxRedirects: 0 },
    );
  } catch {
    throw new IntegrationValidationError("resend_connection_failed");
  }
  if (response.status === 401) {
    await response.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError("resend_credentials_invalid");
  }
  if (!response.ok && response.status !== 403) {
    await response.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError("resend_connection_failed");
  }

  const domainCatalogRestricted = response.status === 403;
  let verifiedDomain: string | null = null;
  if (domainCatalogRestricted) {
    await response.body?.cancel().catch(() => undefined);
  } else {
    const payload = await parseLimitedJson(response).catch(() => null);
    if (!isResendDomainListResponse(payload)) {
      throw new IntegrationValidationError("resend_connection_failed");
    }
    verifiedDomain = findVerifiedResendSenderDomain(defaultFrom, payload);
    if (!verifiedDomain && !isResendManagedTestSender(defaultFrom)) {
      throw new IntegrationValidationError("resend_sender_domain_unverified");
    }
  }

  // A sending-only API key cannot list domains. A provider-owned test delivery
  // is a safe, deterministic proof that both the key and sender are accepted.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${apiKey}:${defaultFrom.toLowerCase()}`),
  );
  const validationKey = [...new Uint8Array(digest)].slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let sendResponse: Response;
  try {
    sendResponse = await fetchPublicHttps(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `forms-integration-validation-${validationKey}`,
        },
        body: JSON.stringify({
          from: defaultFrom,
          to: ["delivered+forms-settings@resend.dev"],
          subject: "Validação segura da integração Forms",
          text:
            "Mensagem técnica enviada ao endereço de teste oficial do Resend para validar a configuração.",
        }),
        signal: AbortSignal.timeout(10_000),
      },
      { maxRedirects: 0 },
    );
  } catch {
    throw new IntegrationValidationError("resend_connection_failed");
  }
  if (sendResponse.status === 401) {
    await sendResponse.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError("resend_credentials_invalid");
  }
  if (sendResponse.status === 403 || sendResponse.status === 422) {
    await sendResponse.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError("resend_sender_domain_unverified");
  }
  if (!sendResponse.ok) {
    await sendResponse.body?.cancel().catch(() => undefined);
    throw new IntegrationValidationError("resend_connection_failed");
  }
  const sendPayload = await parseLimitedJson(sendResponse).catch(() => null);
  if (!extractResendEmailId(sendPayload)) {
    throw new IntegrationValidationError("resend_connection_failed");
  }

  if (isResendManagedTestSender(defaultFrom)) {
    return {
      status: "validated_restricted",
      message:
        "Chave e remetente de teste validados. Use um domínio próprio verificado antes da produção.",
    };
  }
  if (domainCatalogRestricted) {
    return {
      status: "validated_restricted",
      message:
        "Chave e remetente validados por envio seguro; a API key não permite consultar o catálogo de domínios.",
    };
  }
  if (!verifiedDomain) {
    throw new IntegrationValidationError("resend_sender_domain_unverified");
  }
  return { status: "validated" };
}

async function validateReoon(
  config: Record<string, unknown>,
): Promise<ValidationResult> {
  const apiKey = requireConfigString(
    config,
    "apiKey",
    "reoon_api_key_required",
  );
  const target = new URL("https://emailverifier.reoon.com/api/v1/verify");
  target.searchParams.set("email", "integration-check@example.com");
  target.searchParams.set("key", apiKey);
  // Credential validation is intentionally always quick. The selected mode is
  // used for real e-mail checks, but a settings save must not consume a power
  // verification merely to prove that the API key works.
  target.searchParams.set("mode", "quick");
  let response: Response;
  try {
    response = await fetchPublicHttps(target.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }, { maxRedirects: 0 });
  } catch {
    throw new IntegrationValidationError("reoon_connection_failed");
  }
  if (response.status === 401 || response.status === 403) {
    throw new IntegrationValidationError("reoon_credentials_invalid");
  }
  if (!response.ok) {
    throw new IntegrationValidationError("reoon_connection_failed");
  }
  let payload: any;
  try {
    payload = await parseLimitedJson(response);
  } catch {
    throw new IntegrationValidationError("reoon_connection_failed");
  }
  if (hasReoonCredentialError(payload)) {
    throw new IntegrationValidationError("reoon_credentials_invalid");
  }
  return { status: "validated" };
}

async function validateGoogleOauth(
  config: Record<string, unknown>,
): Promise<ValidationResult> {
  const clientId = requireConfigString(
    config,
    "clientId",
    "google_client_id_required",
    512,
  );
  const clientSecret = requireConfigString(
    config,
    "clientSecret",
    "google_client_secret_required",
    1_024,
  );
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    throw new IntegrationValidationError("google_client_id_invalid");
  }
  config.clientId = clientId;
  config.clientSecret = clientSecret;

  let accessToken = cleanString(config.accessToken, 4_096);
  const refreshToken = cleanString(config.refreshToken, 4_096);
  if (accessToken) config.accessToken = accessToken;
  if (refreshToken) config.refreshToken = refreshToken;
  if (!accessToken && !refreshToken) {
    return {
      status: "oauth_pending",
      message: "Credenciais salvas; conclua o OAuth para validar a conexão.",
    };
  }

  const tokenInfo = async (token: string): Promise<boolean> => {
    const url = new URL("https://oauth2.googleapis.com/tokeninfo");
    url.searchParams.set("access_token", token);
    let response: Response;
    try {
      response = await fetchPublicHttps(url.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      }, { maxRedirects: 0 });
    } catch {
      throw new IntegrationValidationError("google_oauth_connection_failed");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    const payload = await parseLimitedJson(response).catch(() => null);
    if (!payload || String(payload.aud || "") !== clientId) return false;
    const scopes = new Set(
      String(payload.scope || "").split(/\s+/).filter(Boolean),
    );
    return scopes.has("https://www.googleapis.com/auth/spreadsheets") &&
      scopes.has("https://www.googleapis.com/auth/drive.file");
  };

  if (accessToken && await tokenInfo(accessToken)) {
    return { status: "validated" };
  }
  if (!refreshToken) {
    throw new IntegrationValidationError("google_oauth_reconnect_required");
  }

  let refreshResponse: Response;
  try {
    refreshResponse = await fetchPublicHttps(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(10_000),
      },
      { maxRedirects: 0 },
    );
  } catch {
    throw new IntegrationValidationError("google_oauth_connection_failed");
  }
  const refreshPayload = await parseLimitedJson(refreshResponse).catch(() =>
    null
  );
  if (
    !refreshResponse.ok || !refreshPayload ||
    typeof refreshPayload.access_token !== "string"
  ) {
    throw new IntegrationValidationError("google_oauth_reconnect_required");
  }
  accessToken = refreshPayload.access_token;
  if (!await tokenInfo(accessToken)) {
    throw new IntegrationValidationError("google_oauth_scope_invalid");
  }
  config.accessToken = accessToken;
  config.tokenExpiry = googleTokenExpiryIso(refreshPayload.expires_in);
  if (
    typeof refreshPayload.refresh_token === "string" &&
    refreshPayload.refresh_token
  ) {
    config.refreshToken = refreshPayload.refresh_token;
  }
  return { status: "validated_refreshed" };
}

async function validateMinio(
  req: Request,
  config: Record<string, unknown>,
): Promise<ValidationResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !anonKey) {
    throw new IntegrationValidationError("minio_validation_unavailable");
  }
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/minio-test`, {
      method: "POST",
      headers: {
        Authorization: req.headers.get("Authorization") || "",
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ config }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new IntegrationValidationError("minio_connection_failed");
  }
  const payload = await parseLimitedJson(response).catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    throw new IntegrationValidationError("minio_connection_failed");
  }
  return { status: "validated" };
}

async function validatePixels(
  config: Record<string, unknown>,
): Promise<ValidationResult> {
  // Validate every required value before starting outbound work. That keeps a
  // later local validation error from leaving an already-started request
  // detached from the Promise.all below.
  const meta = config.metaEnabled === true
    ? {
      pixelId: requireConfigString(
        config,
        "metaPixelId",
        "meta_pixel_id_required",
        128,
      ),
      token: requireConfigString(
        config,
        "metaCapiToken",
        "meta_capi_token_required",
      ),
    }
    : null;
  const ga4 = config.ga4Enabled === true
    ? {
      measurementId: requireConfigString(
        config,
        "ga4MeasurementId",
        "ga4_measurement_id_required",
        64,
      ),
      apiSecret: requireConfigString(
        config,
        "ga4ApiSecret",
        "ga4_api_secret_required",
      ),
    }
    : null;
  const tiktokValidatedByConfiguration = config.tiktokEnabled === true;
  if (tiktokValidatedByConfiguration) {
    requireConfigString(
      config,
      "tiktokPixelId",
      "tiktok_pixel_id_required",
      128,
    );
    requireConfigString(
      config,
      "tiktokAccessToken",
      "tiktok_access_token_required",
    );
  }
  const linkedin = config.linkedinEnabled === true
    ? {
      partnerId: requireConfigString(
        config,
        "linkedinPartnerId",
        "linkedin_partner_id_required",
        128,
      ),
      conversionId: requireConfigString(
        config,
        "linkedinConversionId",
        "linkedin_conversion_id_required",
        128,
      ),
      token: requireConfigString(
        config,
        "linkedinAccessToken",
        "linkedin_access_token_required",
      ),
    }
    : null;
  const webhookUrl = config.webhookEnabled === true
    ? requireConfigString(
      config,
      "webhookDefaultUrl",
      "webhook_url_required",
      2_048,
    )
    : null;
  const validationTasks: Promise<void>[] = [];

  if (meta) {
    validationTasks.push((async () => {
      let response: Response;
      try {
        response = await fetchPublicHttps(
          `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${
            encodeURIComponent(meta.pixelId)
          }?fields=id`,
          {
            headers: {
              Authorization: `Bearer ${meta.token}`,
              accept: "application/json",
            },
            signal: AbortSignal.timeout(8_000),
          },
          { maxRedirects: 0 },
        );
      } catch {
        throw new IntegrationValidationError("meta_connection_failed");
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        throw new IntegrationValidationError("meta_credentials_invalid");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new IntegrationValidationError("meta_connection_failed");
      }
      const payload = await parseLimitedJson(response).catch(() => null);
      if (!payload || String(payload.id || "") !== meta.pixelId) {
        throw new IntegrationValidationError("meta_credentials_invalid");
      }
    })());
  }

  if (ga4) {
    validationTasks.push((async () => {
      const target = new URL(
        "https://www.google-analytics.com/debug/mp/collect",
      );
      target.searchParams.set("measurement_id", ga4.measurementId);
      target.searchParams.set("api_secret", ga4.apiSecret);
      let response: Response;
      try {
        response = await fetchPublicHttps(target.toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            client_id: "forms.integration.validation",
            validation_behavior: "ENFORCE_RECOMMENDATIONS",
            events: [{ name: "forms_configuration_test" }],
          }),
          signal: AbortSignal.timeout(8_000),
        }, { maxRedirects: 0 });
      } catch {
        throw new IntegrationValidationError("ga4_connection_failed");
      }
      if (!response.ok) {
        // The validation endpoint explicitly does not authenticate api_secret;
        // a transport rejection therefore cannot honestly be called a bad key.
        throw new IntegrationValidationError("ga4_connection_failed");
      }
      let payload: any;
      try {
        payload = await parseLimitedJson(response);
      } catch {
        throw new IntegrationValidationError("ga4_connection_failed");
      }
      const outcome = ga4ValidationOutcome(payload);
      if (outcome === "malformed_response") {
        throw new IntegrationValidationError("ga4_connection_failed");
      }
      if (outcome === "invalid_payload") {
        throw new IntegrationValidationError("ga4_payload_invalid");
      }
    })());
  }

  if (linkedin) {
    validationTasks.push((async () => {
      let response: Response;
      try {
        response = await fetchPublicHttps(
          `https://api.linkedin.com/rest/conversions/${
            encodeURIComponent(linkedin.conversionId)
          }`,
          {
            headers: {
              Authorization: `Bearer ${linkedin.token}`,
              "LinkedIn-Version": "202607",
              "X-Restli-Protocol-Version": "2.0.0",
              accept: "application/json",
            },
            signal: AbortSignal.timeout(8_000),
          },
          { maxRedirects: 0 },
        );
      } catch {
        throw new IntegrationValidationError("linkedin_connection_failed");
      }
      if (
        response.status >= 400 && response.status < 500 &&
        response.status !== 429
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new IntegrationValidationError("linkedin_credentials_invalid");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new IntegrationValidationError("linkedin_connection_failed");
      }
      const payload = await parseLimitedJson(response).catch(() => null);
      if (!payload || String(payload.id || "") !== linkedin.conversionId) {
        throw new IntegrationValidationError("linkedin_credentials_invalid");
      }
    })());
  }

  if (webhookUrl) {
    validationTasks.push((async () => {
      let response: Response;
      try {
        response = await fetchPublicHttps(webhookUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(8_000),
        }, { maxRedirects: 2 });
      } catch {
        throw new IntegrationValidationError("webhook_connection_failed");
      }
      await response.body?.cancel().catch(() => undefined);
      if (response.status < 200 || response.status >= 400) {
        throw new IntegrationValidationError("webhook_connection_failed");
      }
    })());
  }

  await Promise.all(validationTasks);
  return summarizePixelValidation({
    ga4ValidatedByDebugEndpoint: ga4 !== null,
    tiktokValidatedByConfiguration,
  });
}

async function validateBeforeSave(
  req: Request,
  integrationType: string,
  config: Record<string, unknown>,
): Promise<ValidationResult> {
  switch (integrationType) {
    case "openai":
      return validateOpenAi(config);
    case "resend":
      return validateResend(config);
    case "evolution_api": {
      const state = await getEvolutionConnectionState(config);
      if (state !== "open") {
        throw new IntegrationValidationError(
          "evolution_instance_not_connected",
        );
      }
      return { status: "validated" };
    }
    case "google_oauth":
      return validateGoogleOauth(config);
    case "reoon_email":
      return validateReoon(config);
    case "minio_s3":
      return validateMinio(req, config);
    case "pixels":
      return validatePixels(config);
    default:
      throw new IntegrationValidationError("invalid_integration_type");
  }
}

async function loadStoredConfig(
  admin: any,
  id: unknown,
  integrationType: IntegrationType,
  secret: string,
): Promise<Record<string, unknown>> {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return {};
  const { data, error } = await admin
    .from("integration_settings")
    .select("config")
    .eq("id", id)
    .eq("integration_type", integrationType)
    .maybeSingle();
  if (error) throw new Error("integration_lookup_failed");
  if (!data) throw new Error("integration_not_found");
  const opened = await openIntegrationConfig(
    integrationType,
    data.config,
    secret,
  );
  return pickAllowedConfig(integrationType, opened.config);
}

async function resolveEvolutionCredentials(
  admin: any,
  body: Record<string, unknown>,
  secret: string,
) {
  const stored = await loadStoredConfig(
    admin,
    body.id,
    "evolution_api",
    secret,
  );
  const incomingApiKey = cleanString(body.apiKey, 4_096);
  const apiKey = incomingApiKey && incomingApiKey !== MASKED_SECRET
    ? incomingApiKey
    : cleanString(stored.apiKey, 4_096);
  const apiUrl = cleanString(body.apiUrl, 2_048) ||
    cleanString(stored.apiUrl, 2_048);
  if (!apiUrl) {
    throw new IntegrationValidationError("evolution_api_url_required");
  }
  if (!apiKey) {
    throw new IntegrationValidationError("evolution_api_key_required");
  }
  return { apiUrl: evolutionBaseUrl(apiUrl), apiKey };
}

async function parseLimitedJson(response: Response): Promise<any> {
  return readResponseJsonLimited(response, 1_000_000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { success: false, error: "method_not_allowed" });
  }

  const caller = await getAuthorizedCaller(req);
  if (!caller.ok) return caller.response;

  try {
    const parsedBody = await readLimitedJsonObject(
      req,
      MAX_BODY_SIZE,
      corsHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const action = typeof body?.action === "string" ? body.action : "";
    const integrationType = typeof body?.integrationType === "string"
      ? body.integrationType
      : "";
    if (!isIntegrationType(integrationType)) {
      return json(400, { success: false, error: "invalid_integration_type" });
    }

    const admin = caller.admin;
    const configEncryptionSecret = encryptionSecret();

    if (action === "catalog") {
      if (
        !["resend", "evolution_api", "google_oauth"].includes(integrationType)
      ) {
        return json(400, { success: false, error: "invalid_catalog_type" });
      }
      let storedRows: IntegrationRow[];
      try {
        storedRows = await loadAllStoredRows(admin, integrationType);
      } catch {
        return json(500, {
          success: false,
          error: "integration_catalog_failed",
        });
      }
      try {
        const opened = await openIntegrationConfigRows(
          storedRows,
          configEncryptionSecret,
          false,
        );
        return json(200, {
          success: true,
          rows: opened.rows.map((row) => catalogRow(row)),
        });
      } catch (error) {
        console.error(
          "integration_catalog_open_error",
          safeIntegrationErrorCode(error, "integration_catalog_failed"),
        );
        return json(500, {
          success: false,
          error: "integration_catalog_failed",
        });
      }
    }

    if (!caller.isAdmin) {
      return json(403, { success: false, error: "forbidden" });
    }

    if (action === "backfill-encryption") {
      const requestedLimit = Number(body.limit);
      const limit = Number.isInteger(requestedLimit)
        ? Math.max(1, Math.min(requestedLimit, 50))
        : 25;
      const cursor = typeof body.cursor === "string" ? body.cursor : "";
      if (cursor && !UUID_PATTERN.test(cursor)) {
        return json(400, { success: false, error: "invalid_cursor" });
      }

      let query = admin
        .from("integration_settings")
        .select(
          "id, integration_type, label, is_active, config, created_at, updated_at",
        )
        .eq("integration_type", integrationType)
        .order("id", { ascending: true })
        .limit(limit + 1);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) {
        return json(500, {
          success: false,
          error: "integration_backfill_failed",
        });
      }
      const selected = ((data || []) as IntegrationRow[]).slice(0, limit);
      try {
        const opened = await openIntegrationConfigRows(
          selected,
          configEncryptionSecret,
          true,
          (row, config) =>
            persistEncryptedConfig(
              admin,
              row as IntegrationRow,
              config,
              configEncryptionSecret,
            ),
        );
        const hasMore = (data?.length || 0) > limit;
        return json(200, {
          success: true,
          scanned: selected.length,
          migrated: opened.migrated,
          nextCursor: hasMore && selected.length
            ? selected[selected.length - 1].id
            : null,
          hasMore,
        });
      } catch (error) {
        console.error(
          "integration_backfill_error",
          safeIntegrationErrorCode(error, "integration_backfill_failed"),
        );
        return json(500, {
          success: false,
          error: "integration_backfill_failed",
        });
      }
    }

    if (action === "list") {
      let storedRows: IntegrationRow[];
      try {
        storedRows = await loadAllStoredRows(admin, integrationType);
      } catch {
        return json(500, { success: false, error: "integration_list_failed" });
      }
      // Opening Settings is also the safe zero-touch rollout path: every
      // legacy row of this type is re-encrypted with CAS + exact ACK before
      // any masked configuration is returned to the browser.
      try {
        const opened = await openIntegrationConfigRows(
          storedRows,
          configEncryptionSecret,
          true,
          (row, config) =>
            persistEncryptedConfig(
              admin,
              row as IntegrationRow,
              config,
              configEncryptionSecret,
            ),
        );
        return json(200, {
          success: true,
          rows: opened.rows.map((row) => sanitizeRow(row)),
          migrated: opened.migrated,
        });
      } catch (error) {
        console.error(
          "integration_list_open_error",
          safeIntegrationErrorCode(error, "integration_list_failed"),
        );
        return json(500, {
          success: false,
          error: "integration_list_failed",
        });
      }
    }

    if (action === "openai-models" && integrationType === "openai") {
      const id = typeof body.id === "string" && UUID_PATTERN.test(body.id)
        ? body.id
        : null;
      let apiKey =
        typeof body.apiKey === "string" && body.apiKey !== MASKED_SECRET
          ? body.apiKey.trim()
          : "";
      if (!apiKey && id) {
        const { data, error } = await admin
          .from("integration_settings")
          .select("config")
          .eq("id", id)
          .eq("integration_type", integrationType)
          .maybeSingle();
        if (error) {
          return json(500, {
            success: false,
            error: "integration_lookup_failed",
          });
        }
        const stored = data
          ? (await openIntegrationConfig(
            "openai",
            data.config,
            configEncryptionSecret,
          )).config
          : {};
        apiKey = typeof stored.apiKey === "string" ? stored.apiKey : "";
      }
      if (!apiKey) {
        return json(400, { success: false, error: "openai_api_key_required" });
      }
      const response = await fetchPublicHttps(
        "https://api.openai.com/v1/models",
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8_000),
        },
        { maxRedirects: 0 },
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return json(502, { success: false, error: "openai_models_failed" });
      }
      const payload = await parseLimitedJson(response);
      const models = Array.isArray(payload?.data)
        ? payload.data
          .filter((model: any) => typeof model?.id === "string")
          .map((model: any) => ({
            id: model.id,
            owned_by: String(model.owned_by || ""),
          }))
        : [];
      return json(200, { success: true, models });
    }

    if (
      action === "evolution-instances" && integrationType === "evolution_api"
    ) {
      const credentials = await resolveEvolutionCredentials(
        admin,
        body,
        configEncryptionSecret,
      );
      const instances = await validateEvolutionConfig(credentials);
      return json(200, { success: true, instances });
    }

    if (action === "evolution-test" && integrationType === "evolution_api") {
      const credentials = await resolveEvolutionCredentials(
        admin,
        body,
        configEncryptionSecret,
      );
      const instanceName = cleanString(body.instanceName, 160);
      if (!instanceName) {
        return json(400, {
          success: false,
          error: "evolution_instance_required",
        });
      }
      const state = await getEvolutionConnectionState({
        ...credentials,
        instanceName,
      });
      return json(200, { success: true, connected: state === "open", state });
    }

    if (action === "upsert") {
      const id = typeof body.id === "string" && UUID_PATTERN.test(body.id)
        ? body.id
        : null;
      if (!isPlainObject(body.config)) {
        return json(400, { success: false, error: "invalid_config" });
      }
      if (JSON.stringify(body.config).length > 50_000) {
        return json(413, { success: false, error: "config_too_large" });
      }

      let current: IntegrationRow | null = null;
      let currentConfig: Record<string, unknown> = {};
      if (id) {
        const { data, error } = await admin
          .from("integration_settings")
          .select(
            "id, integration_type, label, is_active, config, created_at, updated_at",
          )
          .eq("id", id)
          .eq("integration_type", integrationType)
          .maybeSingle();
        if (error) {
          return json(500, {
            success: false,
            error: "integration_lookup_failed",
          });
        }
        if (!data) {
          return json(404, { success: false, error: "integration_not_found" });
        }
        const opened = await openStoredRow(
          data as IntegrationRow,
          configEncryptionSecret,
        );
        current = opened.row;
        currentConfig = opened.row.config || {};
      }

      let config = mergeSecretFields(
        integrationType,
        currentConfig,
        body.config,
        body.clearSecretFields,
      );
      if (
        integrationType === "google_oauth" && current &&
        googleOauthCredentialsChanged(
          currentConfig,
          body.config,
          body.clearSecretFields,
          MASKED_SECRET,
        )
      ) {
        config = { ...config };
        for (
          const tokenField of [
            "accessToken",
            "refreshToken",
            "tokenExpiry",
            "connectedEmail",
            "connectedAt",
          ]
        ) {
          delete config[tokenField];
        }
      }
      const validation = body.isActive === true
        ? await validateBeforeSave(req, integrationType, config)
        : {
          status: "disabled",
          message: "Integração salva desativada; a conexão não foi testada.",
        };
      const encryptedConfig = await sealIntegrationConfig(
        integrationType,
        config,
        configEncryptionSecret,
      );
      const payload = {
        integration_type: integrationType,
        label: typeof body.label === "string"
          ? body.label.slice(0, 120)
          : current?.label || integrationType,
        is_active: body.isActive === true,
        config: encryptedConfig,
      };

      const query = id
        ? admin.from("integration_settings").update(payload, { count: "exact" })
          .eq("id", id).eq(
            "integration_type",
            integrationType,
          )
        : admin.from("integration_settings").insert(payload, {
          count: "exact",
        });
      const { data, error, count } = await query
        .select(
          "id, integration_type, label, is_active, config, created_at, updated_at",
        )
        .single();
      if (error || !data || count !== 1 || (id !== null && data.id !== id)) {
        return json(500, { success: false, error: "integration_save_failed" });
      }
      return json(200, {
        success: true,
        // The database row contains the ciphertext envelope. Only the
        // already-opened in-memory config may be masked for the browser.
        row: sanitizeRow({ ...(data as IntegrationRow), config }),
        validation,
      });
    }

    if (action === "delete") {
      const id = typeof body.id === "string" && UUID_PATTERN.test(body.id)
        ? body.id
        : "";
      if (!id) {
        return json(400, { success: false, error: "invalid_integration_id" });
      }
      const { data: deleted, error } = await admin
        .from("integration_settings")
        .delete()
        .eq("id", id)
        .eq("integration_type", integrationType)
        .select("id")
        .maybeSingle();
      if (error) {
        return json(500, {
          success: false,
          error: "integration_delete_failed",
        });
      }
      if (!deleted) {
        return json(404, { success: false, error: "integration_not_found" });
      }
      return json(200, { success: true });
    }

    return json(400, { success: false, error: "invalid_action" });
  } catch (error) {
    if (error instanceof IntegrationValidationError) {
      console.error("integration_settings_validation_error", error.code);
      return json(422, { success: false, error: error.code });
    }
    console.error(
      "integration_settings_error",
      safeIntegrationErrorCode(error, "internal_error"),
    );
    return json(500, { success: false, error: "internal_error" });
  }
});
