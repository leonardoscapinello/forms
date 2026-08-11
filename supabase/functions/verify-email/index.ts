import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceProviderRequestRateLimits } from "../_shared/rateLimit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import {
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { isReoonVerificationResult } from "../integration-settings/validation.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import {
  flattenFormElements,
  getPublicFormContext,
} from "../_shared/publicFormAuth.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MAX_REQUEST_BYTES = 4_096;

async function hashEmail(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.toLowerCase().trim()),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

serve(async (req) => {
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
    const parsedBody = await readLimitedJsonObject(
      req,
      MAX_REQUEST_BYTES,
      corsHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const requestBody = parsedBody.value;
    const { email, force, elementId } = requestBody;
    if (!email || typeof email !== "string" || email.length > 254) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (force === true) {
      const caller = await requireAdmin(req);
      if (!caller.ok) return caller.response;
    } else {
      const context = await getPublicFormContext(
        req,
        requestBody.formId,
        requestBody.submissionToken,
        requestBody.responseId,
      );
      if (!context.ok) return context.response;
      const emailElements = (context.formData.pages || []).flatMap((
        page: any,
      ) => flattenFormElements(page?.elements || []));
      if (context.formData.welcomePage?.elements) {
        emailElements.push(
          ...flattenFormElements(context.formData.welcomePage.elements),
        );
      }
      if (context.formData.thankYouPage?.elements) {
        emailElements.push(
          ...flattenFormElements(context.formData.thankYouPage.elements),
        );
      }
      const persistedElement = emailElements.find((candidate: any) =>
        candidate?.id === elementId && candidate?.type === "input_email" &&
        candidate?.smartValidation === true
      );
      if (!persistedElement) {
        return new Response(
          JSON.stringify({ error: "email_field_not_allowed" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          valid: false,
          reason: "invalid_syntax",
          is_safe_to_send: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = await hashEmail(normalizedEmail);
    const limited = await enforceProviderRequestRateLimits(
      supabase,
      req,
      {
        bucket: "verify-email",
        ipLimit: force === true ? 300 : 20,
        ipWindowSeconds: 60,
        providerScope: "reoon-email",
        providerLimit: 300,
        providerWindowSeconds: 60,
        subjectScope: emailHash,
        subjectLimit: force === true ? 20 : 5,
        subjectWindowSeconds: 60,
        serviceRoleKey: supabaseKey,
        responseHeaders: corsHeaders,
      },
    );
    if (limited) return limited;

    // Check cache first
    const { data: cached, error: cacheLookupError } = await supabase
      .from("email_validations")
      .select("*")
      .eq("email", emailHash)
      .maybeSingle();
    const cacheAvailable = !cacheLookupError;
    if (cacheLookupError) console.error("verify_email_cache_lookup_failed");

    if (cached && force !== true) {
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
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Get Reoon API key from integration_settings
    const { data: settings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("config, is_active")
      .eq("integration_type", "reoon_email")
      .maybeSingle();

    if (settingsError) {
      return new Response(
        JSON.stringify({ error: "email_validation_configuration_unavailable" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!settings || !settings.is_active) {
      return new Response(
        JSON.stringify({
          valid: false,
          reason: "reoon_not_configured",
          is_safe_to_send: false,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const cfg = (await openIntegrationConfig(
      "reoon_email",
      settings.config,
      Deno.env.get("ENCRYPTION_SECRET") ?? "",
    )).config;
    const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : "";
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          valid: false,
          reason: "no_api_key",
          is_safe_to_send: false,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const mode = cfg?.mode === "quick" ? "quick" : "power";

    // Call Reoon API
    const reoonUrl = new URL("https://emailverifier.reoon.com/api/v1/verify");
    reoonUrl.searchParams.set("email", normalizedEmail);
    reoonUrl.searchParams.set("key", apiKey);
    reoonUrl.searchParams.set("mode", mode);
    const reoonRes = await fetch(reoonUrl, {
      signal: AbortSignal.timeout(mode === "quick" ? 8_000 : 65_000),
      redirect: "error",
      headers: { accept: "application/json" },
    });
    const reoonData = await readResponseJsonLimited<Record<string, unknown>>(
      reoonRes,
      500_000,
    )
      .catch((): Record<string, unknown> => ({}));
    if (!reoonRes.ok || !isReoonVerificationResult(reoonData, mode)) {
      return new Response(
        JSON.stringify({
          error: "Email validation provider rejected the request.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const providerStatus = typeof reoonData?.status === "string"
      ? reoonData.status.toLowerCase()
      : "unknown";
    const isSafeToSend = typeof reoonData?.is_safe_to_send === "boolean"
      ? reoonData.is_safe_to_send
      : mode === "quick" && providerStatus === "valid";

    // Store in cache
    const record = {
      email: emailHash,
      status: providerStatus,
      overall_score: reoonData.overall_score ?? 0,
      is_safe_to_send: isSafeToSend,
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
    const { error: cleanupError } = await supabase.from("email_validations")
      .delete().lt(
        "updated_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      );
    if (cleanupError) console.error("verify_email_cache_cleanup_failed");

    let cachePersisted = false;
    if (cached) {
      const { error: updateError } = await supabase.from("email_validations")
        .update(record).eq("id", cached.id);
      cachePersisted = !updateError;
      if (updateError) console.error("verify_email_cache_update_failed");
    } else {
      const { error: insertError } = await supabase.from("email_validations")
        .insert(record);
      cachePersisted = !insertError;
      if (insertError) console.error("verify_email_cache_insert_failed");
    }

    return new Response(
      JSON.stringify({
        valid: true,
        is_safe_to_send: isSafeToSend,
        status: providerStatus,
        overall_score: reoonData.overall_score,
        is_disposable: reoonData.is_disposable,
        is_role_account: reoonData.is_role_account,
        cached: false,
        cache_persisted: cacheAvailable && cachePersisted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error(
      "verify_email_error",
      safeIntegrationErrorCode(error, "email_validation_failed"),
    );
    return new Response(
      JSON.stringify({ error: "Email validation failed. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
