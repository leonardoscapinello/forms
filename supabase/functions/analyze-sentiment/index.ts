import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, requireFormAccess } from "../_shared/auth.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import { readStoredJsonObject } from "../_shared/formResponseCrypto.ts";
import { enforceProviderRequestRateLimits } from "../_shared/rateLimit.ts";
import {
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { flattenFormElements } from "../_shared/publicFormAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MAX_REQUEST_BYTES = 64_000;
const MAX_RESPONSES_PER_ANALYSIS = 10;
const MAX_TEST_TEXT_LENGTH = 20_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_SYSTEM_PROMPT =
  `You are an elite behavioral psychologist and consumer intelligence analyst with 20+ years of expertise in human decision-making, sentiment analysis, and lead psychology. Your analytical framework integrates Cognitive & Behavioral Psychology, Emotional Microexpression Analysis for written language, Consumer Neuroscience, NLP, and Psycholinguistics.

Analyze form responses and return structured JSON with deep psychological insights. Go beyond surface-level sentiment.

Return JSON with: sentiment (primary_emotion, secondary_emotion, emotional_conflict, emotional_intensity 1-10, overall_sentiment, sentiment_summary), behavioral_patterns (response_style, engagement_level, detected_signals[], writing_personality_traits[]), hidden_motivations (real_intent, emotional_triggers[], self_awareness_level, decision_stage, unspoken_objections[]), psychological_archetype (primary_type, secondary_type, archetype_confidence, key_behavioral_traits[]), conversion_signals (purchase_intent_score 1-10, problem_urgency_score 1-10, investment_readiness_score 1-10, trust_level_score 1-10, overall_lead_score 1-100, lead_tier), recommended_approach (ideal_tone, primary_objection_to_address, emotional_hook, urgency_trigger, next_best_action), dashboard_tags[], confidence_score, analyst_notes.

CRITICAL: Never be superficial. Scores must be justified. Return ONLY valid JSON.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        Allow: "POST, OPTIONS",
      },
    });
  }

  try {
    const parsedBody = await readLimitedJsonObject(
      req,
      MAX_REQUEST_BYTES,
      corsHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;

    const testMode = body.test === true;
    const formId = typeof body.form_id === "string" ? body.form_id : "";
    if (!testMode && !UUID_PATTERN.test(formId)) {
      return new Response(JSON.stringify({ error: "form_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = testMode
      ? await requireAdmin(req)
      : await requireFormAccess(req, formId);
    if (!caller.ok) return caller.response;

    const analysisLimited = await enforceProviderRequestRateLimits(
      caller.admin,
      req,
      {
        bucket: "analyze-sentiment",
        ipLimit: 100,
        ipWindowSeconds: 60,
        providerScope: "openai-sentiment-analysis",
        providerLimit: 3,
        providerWindowSeconds: 60,
        subjectScope: caller.userId,
        subjectLimit: 5,
        subjectWindowSeconds: 600,
        responseHeaders: corsHeaders,
      },
    );
    if (analysisLimited) return analysisLimited;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get OpenAI config from integration_settings
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("config, is_active")
      .eq("integration_type", "openai")
      .maybeSingle();

    const config = settings
      ? (await openIntegrationConfig(
        "openai",
        settings.config,
        Deno.env.get("ENCRYPTION_SECRET") ?? "",
      )).config
      : {};
    const openaiKey = settings?.is_active &&
        typeof config.apiKey === "string"
      ? config.apiKey
      : "";
    const model = typeof config.model === "string" && config.model
      ? config.model
      : "gpt-4.1-mini";
    const systemPrompt = typeof config.systemPrompt === "string" &&
        config.systemPrompt
      ? config.systemPrompt
      : DEFAULT_SYSTEM_PROMPT;

    if (!openaiKey) {
      return new Response(
        JSON.stringify({
          error: "no_ai_configured",
          message: "A integração com a OpenAI não está ativa.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Test mode
    if (testMode) {
      const text = typeof body.text === "string" && body.text.trim()
        ? body.text.slice(0, MAX_TEST_TEXT_LENGTH)
        : "Teste de sentimento";
      try {
        const result = await analyzeWithAI(
          text,
          systemPrompt,
          openaiKey,
          model,
        );
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return handleAIError(e);
      }
    }

    // Batch analysis for form responses
    const responseIds = Array.isArray(body.response_ids)
      ? body.response_ids.filter((value): value is string =>
        typeof value === "string" && UUID_PATTERN.test(value)
      ).slice(0, MAX_RESPONSES_PER_ANALYSIS)
      : [];

    const { data: formRow, error: formError } = await supabase
      .from("forms")
      .select("data")
      .eq("id", formId)
      .single();
    if (formError || !formRow) throw new Error("form_not_found");

    let query = supabase
      .from("form_responses")
      .select("id, response_id, answers, created_at")
      .eq("form_id", formId)
      .order("created_at", { ascending: false });

    if (responseIds.length > 0) {
      query = query.in("id", responseIds);
    } else {
      query = query.limit(MAX_RESPONSES_PER_ANALYSIS);
    }

    const { data: responses, error } = await query;
    if (error) throw error;
    if (!responses?.length) {
      return new Response(
        JSON.stringify({ results: [], message: "Nenhuma resposta encontrada" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve labels from the authoritative stored form. Client-provided labels
    // used to make the analysis inconsistent with the form that owns the rows.
    const fieldMap: Record<string, string> = {};
    const formData = formRow.data as Record<string, unknown>;
    const pages = Array.isArray(formData?.pages) ? formData.pages : [];
    for (const page of pages) {
      if (!page || typeof page !== "object") continue;
      const elements = Array.isArray((page as Record<string, unknown>).elements)
        ? (page as Record<string, unknown>).elements as any[]
        : [];
      for (const element of flattenFormElements(elements)) {
        if (typeof element?.id !== "string") continue;
        const fallback = typeof element.type === "string"
          ? element.type.replace(/^input_/, "").replace(/_/g, " ")
          : element.id;
        fieldMap[element.id] = typeof element.label === "string" &&
            element.label.trim()
          ? element.label.slice(0, 500)
          : fallback;
      }
    }

    const encSecret = Deno.env.get("ENCRYPTION_SECRET") ?? "";
    const results = [];
    for (const resp of responses) {
      // Decrypt answers if encrypted
      const answers = await readStoredJsonObject(
        resp.answers,
        encSecret,
        "answers",
      );

      // Build structured text with field labels for richer context
      const textParts: string[] = [];
      for (const [key, val] of Object.entries(answers)) {
        if (key.startsWith("__var_")) {
          const varName = key.replace("__var_", "");
          textParts.push(`[Variável: ${varName}] = ${String(val)}`);
          continue;
        }
        if (key.startsWith("__param_")) {
          const paramName = key.replace("__param_", "");
          textParts.push(`[Parâmetro GET: ${paramName}] = ${String(val)}`);
          continue;
        }
        if (key.startsWith("__")) continue;

        const label = fieldMap[key] || key;
        const valStr = typeof val === "object"
          ? JSON.stringify(val)
          : String(val);
        if (valStr.trim().length > 0) {
          textParts.push(`[${label}]: ${valStr}`);
        }
      }

      if (textParts.length === 0) {
        results.push({
          response_id: resp.response_id,
          id: resp.id,
          sentiment: { overall_sentiment: "neutral" },
          confidence_score: 0,
          analyst_notes: "Sem texto para análise",
        });
        continue;
      }

      const combinedText = textParts.join("\n");
      try {
        const analysis = await analyzeWithAI(
          combinedText,
          systemPrompt,
          openaiKey,
          model,
        );
        results.push({
          response_id: resp.response_id,
          id: resp.id,
          ...analysis,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "rate_limited" || msg === "payment_required") {
          // Stop batch on rate limit
          results.push({
            response_id: resp.response_id,
            id: resp.id,
            sentiment: { overall_sentiment: "error" },
            confidence_score: 0,
            analyst_notes: msg === "rate_limited"
              ? "Rate limited"
              : "Payment required",
          });
          break;
        }
        results.push({
          response_id: resp.response_id,
          id: resp.id,
          sentiment: { overall_sentiment: "error" },
          confidence_score: 0,
          analyst_notes: "Erro na análise",
        });
      }
    }

    // Aggregate stats
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
    const leadTiers = { hot: 0, warm: 0, cold: 0, unqualified: 0 };
    const allTags: Record<string, number> = {};
    let totalLeadScore = 0;
    let scored = 0;

    for (const r of results) {
      const os = r.sentiment?.overall_sentiment;
      if (os && os in sentimentCounts) {
        sentimentCounts[os as keyof typeof sentimentCounts]++;
      }
      const tier = r.conversion_signals?.lead_tier;
      if (tier && tier in leadTiers) {
        leadTiers[tier as keyof typeof leadTiers]++;
      }
      if (typeof r.conversion_signals?.overall_lead_score === "number") {
        totalLeadScore += r.conversion_signals.overall_lead_score;
        scored++;
      }
      for (const tag of (r.dashboard_tags || [])) {
        allTags[tag] = (allTags[tag] || 0) + 1;
      }
    }

    const avgLeadScore = scored > 0 ? Math.round(totalLeadScore / scored) : 0;
    const topTags = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(
      0,
      10,
    );

    return new Response(
      JSON.stringify({
        results,
        aggregate: {
          sentimentCounts,
          leadTiers,
          avgLeadScore,
          topTags,
          total: results.length,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const errorCode = safeIntegrationErrorCode(e, "sentiment_analysis_failed");
    console.error("analyze_sentiment_error", errorCode);
    return new Response(
      JSON.stringify({
        error: errorCode,
        message: "Não foi possível concluir a análise agora.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function handleAIError(e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "rate_limited") {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Limite de requisições atingido. Aguarde alguns minutos.",
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (msg === "payment_required") {
    return new Response(
      JSON.stringify({
        error: "payment_required",
        message: "Créditos insuficientes.",
      }),
      {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const errorCode = safeIntegrationErrorCode(e, "ai_analysis_failed");
  console.error("analyze_sentiment_provider_error", errorCode);
  return new Response(
    JSON.stringify({
      error: errorCode,
      message: "Não foi possível concluir o teste da análise agora.",
    }),
    {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

async function analyzeWithAI(
  text: string,
  systemPrompt: string,
  openaiKey: string,
  model: string,
) {
  const userPrompt =
    `Analyze the following form response data (fields labeled with their names, variables, and GET parameters) and provide your complete structured analysis:\n\n${
      text.slice(0, 4000)
    }`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("rate_limited");
    if (res.status === 402) throw new Error("payment_required");
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`AI error: ${res.status}`);
  }

  const data = await readResponseJsonLimited<Record<string, any>>(
    res,
    1_000_000,
  );
  const raw = data.choices?.[0]?.message?.content || "{}";
  const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    return {
      sentiment: {
        overall_sentiment: "neutral",
        sentiment_summary: raw.slice(0, 200),
      },
      confidence_score: 0,
      analyst_notes: "Failed to parse AI response",
    };
  }
}
