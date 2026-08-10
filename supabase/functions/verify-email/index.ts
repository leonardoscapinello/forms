import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashEmail(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase().trim()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ valid: false, reason: "invalid_syntax", is_safe_to_send: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = await hashEmail(normalizedEmail);
    const limited = await enforceRateLimit(
      supabase, req, 'verify-email', 20, 60, emailHash, supabaseKey, corsHeaders,
    );
    if (limited) return limited;

    // Check cache first
    const { data: cached } = await supabase
      .from("email_validations")
      .select("*")
      .eq("email", emailHash)
      .maybeSingle();

    if (cached) {
      // Return cached result if less than 7 days old
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return new Response(
          JSON.stringify({
            valid: true,
            is_safe_to_send: cached.is_safe_to_send,
            status: cached.status,
            overall_score: cached.overall_score,
            is_disposable: cached.is_disposable,
            is_role_account: cached.is_role_account,
            cached: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Reoon API key from integration_settings
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("config, is_active")
      .eq("integration_type", "reoon_email")
      .maybeSingle();

    if (!settings || !settings.is_active) {
      return new Response(
        JSON.stringify({ valid: true, reason: "reoon_not_configured", is_safe_to_send: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfg = settings.config as any;
    const apiKey = cfg?.apiKey;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ valid: true, reason: "no_api_key", is_safe_to_send: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mode = cfg?.mode || "power";

    // Call Reoon API
    const reoonUrl = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(apiKey)}&mode=${mode}`;
    const reoonRes = await fetch(reoonUrl);
    const reoonData = await reoonRes.json();

    // Store in cache
    const record = {
      email: emailHash,
      status: reoonData.status || "unknown",
      overall_score: reoonData.overall_score ?? 0,
      is_safe_to_send: reoonData.is_safe_to_send ?? false,
      is_deliverable: reoonData.is_deliverable ?? false,
      is_disabled: reoonData.is_disabled ?? false,
      is_disposable: reoonData.is_disposable ?? false,
      is_free_email: reoonData.is_free_email ?? false,
      is_role_account: reoonData.is_role_account ?? false,
      is_catch_all: reoonData.is_catch_all ?? false,
      is_spamtrap: reoonData.is_spamtrap ?? false,
      is_valid_syntax: reoonData.is_valid_syntax ?? true,
      can_connect_smtp: reoonData.can_connect_smtp ?? false,
      has_inbox_full: reoonData.has_inbox_full ?? false,
      mx_accepts_mail: reoonData.mx_accepts_mail ?? false,
      mx_records: reoonData.mx_records ?? [],
      domain: reoonData.domain ?? null,
      username: null,
      verification_mode: mode,
      raw_response: null,
      updated_at: new Date().toISOString(),
    };

    // Cache retention: validation metadata is disposable and must not grow forever.
    await supabase.from('email_validations').delete().lt(
      'updated_at',
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    );

    if (cached) {
      await supabase.from("email_validations").update(record).eq("id", cached.id);
    } else {
      await supabase.from("email_validations").insert(record);
    }

    return new Response(
      JSON.stringify({
        valid: true,
        is_safe_to_send: reoonData.is_safe_to_send ?? false,
        status: reoonData.status,
        overall_score: reoonData.overall_score,
        is_disposable: reoonData.is_disposable,
        is_role_account: reoonData.is_role_account,
        cached: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verify-email error:", error);
    return new Response(
      JSON.stringify({ error: "Email validation failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
