import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySignedState } from "../_shared/signedState.ts";
import {
  googleTokenExpiryIso,
  normalizeOAuthReturnUrl,
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import {
  isExactIntegrationConfigWriteAck,
  openIntegrationConfig,
  sealIntegrationConfig,
} from "../_shared/integrationSettingsCrypto.ts";

function addResultParams(
  returnUrl: string,
  result: "success" | "error",
  reason?: string,
): string {
  const target = new URL(returnUrl);
  target.searchParams.set("google_oauth", result);
  if (reason) target.searchParams.set("reason", reason);
  return target.toString();
}

Deno.serve(async (req) => {
  let safeReturnUrl = "";
  try {
    if (req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const stateObj = stateParam ? await verifySignedState(stateParam) : null;
    const returnOrigin = typeof stateObj?.returnOrigin === "string"
      ? stateObj.returnOrigin
      : "";
    safeReturnUrl =
      normalizeOAuthReturnUrl(stateObj?.returnUrl, [returnOrigin]) || "";
    if (!safeReturnUrl) {
      return new Response("Invalid or expired OAuth state", { status: 400 });
    }

    if (errorParam || !code || code.length > 4_096) {
      const reason = errorParam && /^[a-z_]{1,80}$/i.test(errorParam)
        ? errorParam
        : "no_code";
      return new Response(null, {
        status: 302,
        headers: { Location: addResultParams(safeReturnUrl, "error", reason) },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("oauth_configuration_missing");
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Google OAuth config
    const { data: settings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("id, config")
      .eq("integration_type", "google_oauth")
      .eq("is_active", true)
      .maybeSingle();

    if (settingsError) throw new Error("google_oauth_lookup_failed");
    if (!settings) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: addResultParams(safeReturnUrl, "error", "not_configured"),
        },
      });
    }

    const configEncryptionSecret = Deno.env.get("ENCRYPTION_SECRET") ?? "";
    const cfg = (await openIntegrationConfig(
      "google_oauth",
      settings.config,
      configEncryptionSecret,
    )).config;
    const clientId = typeof cfg.clientId === "string"
      ? cfg.clientId.trim()
      : "";
    const clientSecret = typeof cfg.clientSecret === "string"
      ? cfg.clientSecret.trim()
      : "";
    if (!clientId || !clientSecret) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: addResultParams(safeReturnUrl, "error", "not_configured"),
        },
      });
    }
    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });

    const tokenData = await readResponseJsonLimited<Record<string, unknown>>(
      tokenRes,
      100_000,
    )
      .catch((): Record<string, unknown> => ({}));

    if (
      !tokenRes.ok || typeof tokenData.access_token !== "string" ||
      !tokenData.access_token
    ) {
      console.error("google_oauth_token_exchange_failed", tokenRes.status);
      return new Response(null, {
        status: 302,
        headers: {
          Location: addResultParams(
            safeReturnUrl,
            "error",
            "token_exchange_failed",
          ),
        },
      });
    }

    const tokenInfoUrl = new URL("https://oauth2.googleapis.com/tokeninfo");
    tokenInfoUrl.searchParams.set("access_token", tokenData.access_token);
    let tokenInfo: Record<string, unknown> = {};
    try {
      const tokenInfoRes = await fetch(tokenInfoUrl, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      tokenInfo = tokenInfoRes.ok
        ? await readResponseJsonLimited<Record<string, unknown>>(
          tokenInfoRes,
          100_000,
        )
        : {};
      if (!tokenInfoRes.ok) {
        await tokenInfoRes.body?.cancel().catch(() => undefined);
      }
    } catch {
      tokenInfo = {};
    }
    const grantedScopes = new Set(
      String(tokenInfo.scope || "").split(/\s+/).filter(Boolean),
    );
    if (
      String(tokenInfo.aud || "") !== clientId ||
      !grantedScopes.has("https://www.googleapis.com/auth/spreadsheets") ||
      !grantedScopes.has("https://www.googleapis.com/auth/drive.file")
    ) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: addResultParams(
            safeReturnUrl,
            "error",
            "required_scopes_missing",
          ),
        },
      });
    }

    // Get user email from Google
    let email = "";
    try {
      const userInfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
          signal: AbortSignal.timeout(8_000),
          redirect: "error",
        },
      );
      if (userInfoRes.ok) {
        const userInfo = await readResponseJsonLimited<Record<string, unknown>>(
          userInfoRes,
          100_000,
        );
        email = typeof userInfo.email === "string"
          ? userInfo.email.slice(0, 320)
          : "";
      } else {
        await userInfoRes.body?.cancel().catch(() => undefined);
      }
    } catch { /* ignore */ }

    // Store tokens in integration_settings
    const refreshToken =
      typeof tokenData.refresh_token === "string" && tokenData.refresh_token
        ? tokenData.refresh_token
        : (typeof cfg.refreshToken === "string" ? cfg.refreshToken : "");
    if (!refreshToken) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: addResultParams(
            safeReturnUrl,
            "error",
            "refresh_token_missing",
          ),
        },
      });
    }
    const updatedConfig = {
      ...cfg,
      accessToken: tokenData.access_token,
      refreshToken,
      tokenExpiry: googleTokenExpiryIso(tokenData.expires_in),
      connectedEmail: email ||
        (typeof cfg.connectedEmail === "string" ? cfg.connectedEmail : ""),
      connectedAt: new Date().toISOString(),
    };
    const encryptedConfig = await sealIntegrationConfig(
      "google_oauth",
      updatedConfig,
      configEncryptionSecret,
    );

    const { data: updated, error: updateError, count } = await supabase
      .from("integration_settings")
      .update({ config: encryptedConfig }, { count: "exact" })
      .eq("id", settings.id)
      .eq("integration_type", "google_oauth")
      .select("id");
    if (
      updateError ||
      !isExactIntegrationConfigWriteAck(updated, count, settings.id)
    ) {
      throw new Error("google_oauth_token_persist_failed");
    }

    return new Response(null, {
      status: 302,
      headers: { Location: addResultParams(safeReturnUrl, "success") },
    });
  } catch (err: unknown) {
    const errorCode = safeIntegrationErrorCode(
      err,
      "google_oauth_callback_failed",
    );
    console.error("google_oauth_callback_error", errorCode);
    if (safeReturnUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: addResultParams(safeReturnUrl, "error", errorCode),
        },
      });
    }
    return new Response("OAuth callback failed", { status: 500 });
  }
});
