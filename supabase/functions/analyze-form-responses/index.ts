import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireFormAccess } from "../_shared/auth.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import { readStoredJsonObject } from "../_shared/formResponseCrypto.ts";
import { enforceProviderRequestRateLimits } from "../_shared/rateLimit.ts";
import {
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MAX_REQUEST_BYTES = 32_000;

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
    const form_id = parsedBody.value.form_id;
    if (typeof form_id !== "string" || !form_id) {
      return new Response(JSON.stringify({ error: "form_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = await requireFormAccess(req, form_id);
    if (!caller.ok) return caller.response;

    const analysisLimited = await enforceProviderRequestRateLimits(
      caller.admin,
      req,
      {
        bucket: "analyze-form-responses",
        ipLimit: 300,
        ipWindowSeconds: 60,
        providerScope: "openai-aggregate-analysis",
        providerLimit: 30,
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

    // Check if user has custom OpenAI config with systemPrompt
    const { data: aiSettings } = await supabase
      .from("integration_settings")
      .select("config, is_active")
      .eq("integration_type", "openai")
      .maybeSingle();

    const aiConfig = aiSettings
      ? (await openIntegrationConfig(
        "openai",
        aiSettings.config,
        Deno.env.get("ENCRYPTION_SECRET") ?? "",
      )).config
      : {};
    const customSystemPrompt = typeof aiConfig.systemPrompt === "string"
      ? aiConfig.systemPrompt
      : "";
    const apiKey = aiSettings?.is_active && typeof aiConfig.apiKey === "string"
      ? aiConfig.apiKey
      : "";
    if (!apiKey) {
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

    // Fetch last 100 responses for this form
    const { data: responses, error } = await supabase
      .from("form_responses")
      .select("answers, total_time_ms, pages_visited, metadata, created_at")
      .eq("form_id", form_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!responses || responses.length === 0) {
      return new Response(
        JSON.stringify({
          error: "no_responses",
          message: "Nenhuma resposta encontrada para análise.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Extract text answers for analysis
    const textAnswers: string[] = [];
    const completionTimes: number[] = [];
    const responseLengths: number[] = [];

    const encSecret = Deno.env.get("ENCRYPTION_SECRET") ?? "";

    for (const resp of responses) {
      if (resp.total_time_ms) completionTimes.push(resp.total_time_ms);
      const answers = await readStoredJsonObject(
        resp.answers,
        encSecret,
        "answers",
      );
      let totalChars = 0;
      for (const val of Object.values(answers)) {
        if (typeof val === "string" && val.trim().length > 10) {
          textAnswers.push(val.trim());
          totalChars += val.length;
        }
      }
      if (totalChars > 0) responseLengths.push(totalChars);
    }

    const sampleAnswers = textAnswers.slice(0, 40).join(" | ");
    const avgTime = completionTimes.length > 0
      ? Math.round(
        completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length /
          1000,
      )
      : null;
    const avgChars = responseLengths.length > 0
      ? Math.round(
        responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length,
      )
      : null;

    const baseContext = `FORM RESPONSE DATA:
- Total responses analyzed: ${responses.length}
- Average completion time: ${avgTime ? `${avgTime} seconds` : "N/A"}
- Average response length: ${avgChars ? `${avgChars} characters` : "N/A"}
- Sample text responses: ${sampleAnswers || "(no text responses available)"}`;

    const systemPrompt = customSystemPrompt ||
      `You are an elite behavioral psychologist and consumer intelligence analyst. Analyze form response data and return structured insights.`;

    const prompt = `${baseContext}

Provide a comprehensive aggregate analysis as JSON with:
1. sentiment_overall: 'positive' | 'neutral' | 'negative' | 'mixed'
2. sentiment_score: -1.0 to 1.0
3. sentiment_summary: paragraph about overall sentiment with business implications
4. behavioral_patterns: { response_style, engagement_level, detected_signals[], writing_personality_distribution: { analytical%, expressive%, driver%, amiable% } }
5. engagement_quality: descriptive string with justification
6. key_themes: array of up to 5 main themes
7. response_quality_score: 0 to 100
8. conversion_signals: { avg_purchase_intent, avg_problem_urgency, avg_investment_readiness, avg_trust_level, overall_avg_lead_score, lead_tier_distribution: { hot%, warm%, cold%, unqualified% } }
9. cmo_insights: array of 5-6 high-value strategic insights for CMO
10. recommendations: array of 4-5 actionable recommendations
11. completion_analysis: analysis of completion times and UX friction
12. lead_quality_indicators: array of 2-3 lead quality signals
13. drop_off_hypothesis: hypothesis about form abandonment
14. dashboard_tags: array of 5-8 machine-readable labels for filtering
15. recommended_approach: { ideal_tone, primary_objection, emotional_hook, urgency_trigger }

Return ONLY valid JSON.`;

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiConfig.model || "gpt-4.1-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      },
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: "rate_limited",
            message:
              "Limite de requisições atingido. Tente novamente em alguns minutos.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "payment_required",
            message: "Créditos insuficientes para análise AI.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`OpenAI API error: ${aiResponse.status}`);
    }

    const aiData = await readResponseJsonLimited<Record<string, any>>(
      aiResponse,
      1_000_000,
    );
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";

    const jsonStr = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let analysis: Record<string, unknown> = {};
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      analysis = { raw: rawContent };
    }

    return new Response(
      JSON.stringify({
        success: true,
        responses_analyzed: responses.length,
        text_responses_analyzed: textAnswers.length,
        avg_completion_time_s: avgTime,
        avg_response_chars: avgChars,
        analysis,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const errorCode = safeIntegrationErrorCode(
      e,
      "aggregate_analysis_failed",
    );
    console.error("analyze_form_responses_error", errorCode);
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
