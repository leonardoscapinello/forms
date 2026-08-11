import { requireAdmin } from "../_shared/auth.ts";
import { createSignedState } from "../_shared/signedState.ts";
import {
  normalizeOAuthReturnUrl,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    if (!supabaseUrl) throw new Error("oauth_configuration_missing");
    const supabase = caller.admin;

    // Get Google OAuth config from integration_settings
    const { data: settings, error } = await supabase
      .from("integration_settings")
      .select("config")
      .eq("integration_type", "google_oauth")
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw new Error("google_oauth_lookup_failed");
    }
    if (!settings) {
      return new Response(
        JSON.stringify({ error: "Google OAuth não configurado ou inativo." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const cfg = (await openIntegrationConfig(
      "google_oauth",
      settings.config,
      Deno.env.get("ENCRYPTION_SECRET") ?? "",
    )).config;
    if (
      typeof cfg?.clientId !== "string" || !cfg.clientId.trim() ||
      typeof cfg?.clientSecret !== "string" || !cfg.clientSecret.trim()
    ) {
      return new Response(
        JSON.stringify({ error: "Client ID ou Secret não configurados." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const parsedBody = await readLimitedJsonObject(req, 10_000, corsHeaders);
    if (!parsedBody.ok) return parsedBody.response;
    const { returnUrl: requestedReturnUrl } = parsedBody.value;
    const returnUrl = normalizeOAuthReturnUrl(requestedReturnUrl, [
      req.headers.get("origin") || "",
      Deno.env.get("PUBLIC_APP_URL") || "",
    ]);
    if (!returnUrl) {
      return new Response(
        JSON.stringify({ error: "URL de retorno inválida." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

    const scopes = [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
      "openid",
      "email",
    ].join(" ");

    // Signed, expiring state prevents OAuth callback forgery and open redirects.
    const state = await createSignedState({
      returnUrl,
      returnOrigin: new URL(returnUrl).origin,
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", cfg.clientId.trim());
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString(), redirectUri }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const errorCode = safeIntegrationErrorCode(
      err,
      "google_oauth_start_failed",
    );
    console.error("google_oauth_start_error", errorCode);
    return new Response(
      JSON.stringify({ error: errorCode }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
