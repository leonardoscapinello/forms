import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySignedState } from '../_shared/signedState.ts';

function addResultParams(returnUrl: string, result: 'success' | 'error', reason?: string): string {
  const target = new URL(returnUrl);
  target.searchParams.set('google_oauth', result);
  if (reason) target.searchParams.set('reason', reason);
  return target.toString();
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const stateObj = stateParam ? await verifySignedState(stateParam) : null;
    const returnUrl = typeof stateObj?.returnUrl === 'string' ? stateObj.returnUrl : '';
    if (!returnUrl) return new Response('Invalid or expired OAuth state', { status: 400 });

    if (errorParam || !code) {
      return new Response(null, {
        status: 302,
        headers: { Location: addResultParams(returnUrl, 'error', errorParam || 'no_code') },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Google OAuth config
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("id, config")
      .eq("integration_type", "google_oauth")
      .maybeSingle();

    if (!settings) {
      return new Response(null, {
        status: 302,
        headers: { Location: addResultParams(returnUrl, 'error', 'not_configured') },
      });
    }

    const cfg = settings.config as any;
    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return new Response(null, {
        status: 302,
        headers: { Location: addResultParams(returnUrl, 'error', 'token_exchange_failed') },
      });
    }

    // Get user email from Google
    let email = "";
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoRes.json();
      email = userInfo.email || "";
    } catch { /* ignore */ }

    // Store tokens in integration_settings
    const updatedConfig = {
      ...cfg,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || cfg.refreshToken || "",
      tokenExpiry: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      connectedEmail: email,
      connectedAt: new Date().toISOString(),
    };

    await supabase
      .from("integration_settings")
      .update({ config: updatedConfig })
      .eq("id", settings.id);

    return new Response(null, {
      status: 302,
      headers: { Location: addResultParams(returnUrl, 'success') },
    });
  } catch (err: any) {
    console.error("google-oauth-callback error:", err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
});
