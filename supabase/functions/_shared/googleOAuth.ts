import {
  googleTokenExpiryIso,
  readResponseJsonLimited,
} from "./integrationReliability.ts";
import {
  isExactIntegrationConfigWriteAck,
  openIntegrationConfig,
  sealIntegrationConfig,
} from "./integrationSettingsCrypto.ts";

export const GOOGLE_API_TIMEOUT_MS = 12_000;

export type GoogleTokenContext = {
  accessToken: string;
  settingsId: string;
  settingsUpdatedAt: string;
  config: Record<string, unknown>;
  supabase: any;
  encryptionSecret: string;
};

export async function refreshGoogleAccessToken(
  token: GoogleTokenContext,
): Promise<string> {
  const clientId = typeof token.config.clientId === "string"
    ? token.config.clientId.trim()
    : "";
  const clientSecret = typeof token.config.clientSecret === "string"
    ? token.config.clientSecret.trim()
    : "";
  const refreshToken = typeof token.config.refreshToken === "string"
    ? token.config.refreshToken.trim()
    : "";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("google_oauth_refresh_unavailable");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
    redirect: "error",
  });
  const data = await readResponseJsonLimited<Record<string, unknown>>(
    response,
    100_000,
  ).catch((): Record<string, unknown> => ({}));
  if (
    !response.ok || typeof data.access_token !== "string" ||
    !data.access_token
  ) {
    throw new Error(`google_oauth_refresh_failed:${response.status}`);
  }

  const updatedConfig = {
    ...token.config,
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" && data.refresh_token
      ? data.refresh_token
      : refreshToken,
    tokenExpiry: googleTokenExpiryIso(data.expires_in),
  };
  const encryptedConfig = await sealIntegrationConfig(
    "google_oauth",
    updatedConfig,
    token.encryptionSecret,
  );
  const { data: updated, error, count } = await token.supabase
    .from("integration_settings")
    .update({ config: encryptedConfig }, { count: "exact" })
    .eq("id", token.settingsId)
    .eq("integration_type", "google_oauth")
    // Optimistic fencing prevents concurrent refreshes from restoring an old
    // refresh token over a newer provider response.
    .eq("updated_at", token.settingsUpdatedAt)
    .select("id, updated_at");
  if (
    error || !isExactIntegrationConfigWriteAck(updated, count, token.settingsId)
  ) {
    throw new Error("google_oauth_token_persist_failed");
  }
  const persistedUpdatedAt = updated?.[0]?.updated_at;
  if (typeof persistedUpdatedAt !== "string" || !persistedUpdatedAt) {
    throw new Error("google_oauth_token_persist_ack_missing");
  }

  Object.assign(token.config, updatedConfig);
  token.settingsUpdatedAt = persistedUpdatedAt;
  token.accessToken = data.access_token;
  return data.access_token;
}

export async function getGoogleAccessToken(
  supabase: any,
  options: { encryptionSecret?: string } = {},
): Promise<GoogleTokenContext> {
  const { data: rows, error } = await supabase
    .from("integration_settings")
    .select("id, config, updated_at")
    .eq("integration_type", "google_oauth")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(2);
  if (error) throw new Error("google_oauth_lookup_failed");
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("google_oauth_not_configured");
  }
  if (rows.length !== 1) {
    throw new Error("google_oauth_ambiguous_configuration");
  }
  const settings = rows[0];
  if (
    typeof settings.id !== "string" ||
    typeof settings.updated_at !== "string"
  ) throw new Error("google_oauth_configuration_invalid");

  const encryptionSecret = options.encryptionSecret ??
    (Deno.env.get("ENCRYPTION_SECRET") ?? "");
  const config = (await openIntegrationConfig(
    "google_oauth",
    settings.config,
    encryptionSecret,
  )).config;
  const accessToken = typeof config.accessToken === "string"
    ? config.accessToken.trim()
    : "";
  const refreshToken = typeof config.refreshToken === "string"
    ? config.refreshToken.trim()
    : "";
  if (!accessToken && !refreshToken) {
    throw new Error("google_oauth_not_authenticated");
  }

  const token: GoogleTokenContext = {
    accessToken,
    settingsId: settings.id,
    settingsUpdatedAt: settings.updated_at,
    config,
    supabase,
    encryptionSecret,
  };
  const expiresAt = typeof config.tokenExpiry === "string"
    ? new Date(config.tokenExpiry).getTime()
    : Number.NaN;
  if (
    !accessToken ||
    (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000)
  ) await refreshGoogleAccessToken(token);
  return token;
}

/** Executes one Google request and performs at most one authenticated retry. */
export async function googleApiFetch(
  token: GoogleTokenContext,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const request = () => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token.accessToken}`);
    return fetch(input, {
      ...init,
      headers,
      signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
      redirect: "error",
    });
  };
  let response = await request();
  if (response.status !== 401) return response;
  await response.body?.cancel().catch(() => undefined);
  await refreshGoogleAccessToken(token);
  response = await request();
  return response;
}
