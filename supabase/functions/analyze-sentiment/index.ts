import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEFAULT_SYSTEM_PROMPT = `You are an elite behavioral psychologist and consumer intelligence analyst with 20+ years of expertise in human decision-making, sentiment analysis, and lead psychology. Your analytical framework integrates Cognitive & Behavioral Psychology, Emotional Microexpression Analysis for written language, Consumer Neuroscience, NLP, and Psycholinguistics.

Analyze form responses and return structured JSON with deep psychological insights. Go beyond surface-level sentiment.

Return JSON with: sentiment (primary_emotion, secondary_emotion, emotional_conflict, emotional_intensity 1-10, overall_sentiment, sentiment_summary), behavioral_patterns (response_style, engagement_level, detected_signals[], writing_personality_traits[]), hidden_motivations (real_intent, emotional_triggers[], self_awareness_level, decision_stage, unspoken_objections[]), psychological_archetype (primary_type, secondary_type, archetype_confidence, key_behavioral_traits[]), conversion_signals (purchase_intent_score 1-10, problem_urgency_score 1-10, investment_readiness_score 1-10, trust_level_score 1-10, overall_lead_score 1-100, lead_tier), recommended_approach (ideal_tone, primary_objection_to_address, emotional_hook, urgency_trigger, next_best_action), dashboard_tags[], confidence_score, analyst_notes.

CRITICAL: Never be superficial. Scores must be justified. Return ONLY valid JSON.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get OpenAI config from integration_settings
    const { data: settings } = await supabase
      .from('integration_settings')
      .select('config, is_active')
      .eq('integration_type', 'openai')
      .maybeSingle();

    const config = (settings?.config as any) || {};
    const openaiKey = config.apiKey;
    const model = config.model || 'gpt-4.1-mini';
    const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const provider = config.provider === 'openai' ? 'openai' : 'lovable';

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const canUseOpenAI = provider === 'openai' && !!openaiKey;
    const canUseLovable = !!LOVABLE_API_KEY;

    if (!canUseOpenAI && !canUseLovable) {
      return new Response(JSON.stringify({ error: 'no_ai_configured', message: 'Nenhum provedor de IA disponível. Ative Lovable AI ou configure OpenAI.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Test mode
    if (body.test) {
      const text = body.text || 'Teste de sentimento';
      try {
        const result = await analyzeWithFallback(text, systemPrompt, openaiKey, model, LOVABLE_API_KEY, canUseOpenAI, canUseLovable);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return handleAIError(e);
      }
    }

    // Batch analysis for form responses
    const { form_id, response_ids, form_context } = body;
    if (!form_id) throw new Error('form_id is required');

    let query = supabase
      .from('form_responses')
      .select('id, response_id, answers, created_at')
      .eq('form_id', form_id)
      .order('created_at', { ascending: false });

    if (response_ids?.length) {
      query = query.in('id', response_ids);
    } else {
      query = query.limit(50);
    }

    const { data: responses, error } = await query;
    if (error) throw error;
    if (!responses?.length) {
      return new Response(JSON.stringify({ results: [], message: 'Nenhuma resposta encontrada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build field label map and variable list from form context
    const fieldMap: Record<string, string> = {};
    const variableNames: string[] = [];
    if (form_context) {
      for (const f of form_context.fields || []) {
        fieldMap[f.id] = f.label;
      }
      for (const v of form_context.variables || []) {
        variableNames.push(v.name);
      }
    }

    const results = [];
    for (const resp of responses) {
      const answers = resp.answers || {};

      // Build structured text with field labels for richer context
      const textParts: string[] = [];
      for (const [key, val] of Object.entries(answers)) {
        if (key.startsWith('__var_')) {
          const varName = key.replace('__var_', '');
          textParts.push(`[Variável: ${varName}] = ${String(val)}`);
          continue;
        }
        if (key.startsWith('__param_')) {
          const paramName = key.replace('__param_', '');
          textParts.push(`[Parâmetro GET: ${paramName}] = ${String(val)}`);
          continue;
        }
        if (key.startsWith('__')) continue;

        const label = fieldMap[key] || key;
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (valStr.trim().length > 0) {
          textParts.push(`[${label}]: ${valStr}`);
        }
      }

      if (textParts.length === 0) {
        results.push({ response_id: resp.response_id, id: resp.id, sentiment: { overall_sentiment: 'neutral' }, confidence_score: 0, analyst_notes: 'Sem texto para análise' });
        continue;
      }

      const combinedText = textParts.join('\n');
      try {
        const analysis = await analyzeWithFallback(combinedText, systemPrompt, openaiKey, model, LOVABLE_API_KEY, canUseOpenAI, canUseLovable);
        results.push({ response_id: resp.response_id, id: resp.id, ...analysis });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'rate_limited' || msg === 'payment_required') {
          // Stop batch on rate limit
          results.push({ response_id: resp.response_id, id: resp.id, sentiment: { overall_sentiment: 'error' }, confidence_score: 0, analyst_notes: msg === 'rate_limited' ? 'Rate limited' : 'Payment required' });
          break;
        }
        results.push({ response_id: resp.response_id, id: resp.id, sentiment: { overall_sentiment: 'error' }, confidence_score: 0, analyst_notes: 'Erro na análise' });
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
      if (os && os in sentimentCounts) sentimentCounts[os as keyof typeof sentimentCounts]++;
      const tier = r.conversion_signals?.lead_tier;
      if (tier && tier in leadTiers) leadTiers[tier as keyof typeof leadTiers]++;
      if (typeof r.conversion_signals?.overall_lead_score === 'number') {
        totalLeadScore += r.conversion_signals.overall_lead_score;
        scored++;
      }
      for (const tag of (r.dashboard_tags || [])) {
        allTags[tag] = (allTags[tag] || 0) + 1;
      }
    }

    const avgLeadScore = scored > 0 ? Math.round(totalLeadScore / scored) : 0;
    const topTags = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return new Response(JSON.stringify({
      results,
      aggregate: { sentimentCounts, leadTiers, avgLeadScore, topTags, total: results.length },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('analyze-sentiment error:', e);
    return new Response(JSON.stringify({ error: 'internal', message: e instanceof Error ? e.message : 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function handleAIError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'rate_limited') {
    return new Response(JSON.stringify({ error: 'rate_limited', message: 'Limite de requisições atingido. Aguarde alguns minutos.' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (msg === 'payment_required') {
    return new Response(JSON.stringify({ error: 'payment_required', message: 'Créditos insuficientes.' }), {
      status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: 'ai_error', message: msg || 'Erro na IA' }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function analyzeWithFallback(
  text: string,
  systemPrompt: string,
  openaiKey: string | undefined,
  model: string,
  lovableKey: string | undefined,
  canUseOpenAI: boolean,
  canUseLovable: boolean,
) {
  let lastError: unknown = null;

  // 1) Try OpenAI first if explicitly selected and configured
  if (canUseOpenAI) {
    try {
      return await analyzeWithAI(text, systemPrompt, false, openaiKey, model, lovableKey);
    } catch (e) {
      lastError = e;
      // Fallback automatically to Lovable AI to avoid blocking the feature
      if (!canUseLovable) throw e;
      console.warn('OpenAI failed, falling back to Lovable AI:', e instanceof Error ? e.message : e);
    }
  }

  // 2) Lovable AI fallback/default path
  if (canUseLovable) {
    return await analyzeWithAI(text, systemPrompt, true, openaiKey, model, lovableKey);
  }

  throw (lastError || new Error('no_ai_configured'));
}

async function analyzeWithAI(
  text: string,
  systemPrompt: string,
  useLovable: boolean,
  openaiKey: string | undefined,
  model: string,
  lovableKey: string | undefined,
) {
  const userPrompt = `Analyze the following form response data (fields labeled with their names, variables, and GET parameters) and provide your complete structured analysis:\n\n${text.slice(0, 4000)}`;

  const url = useLovable
    ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  const key = useLovable ? lovableKey : openaiKey;
  const aiModel = useLovable ? 'google/gemini-3-flash-preview' : model;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('rate_limited');
    if (res.status === 402) throw new Error('payment_required');
    const txt = await res.text();
    console.error('AI error:', res.status, txt);
    throw new Error(`AI error: ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    return { sentiment: { overall_sentiment: 'neutral', sentiment_summary: raw.slice(0, 200) }, confidence_score: 0, analyst_notes: 'Failed to parse AI response' };
  }
}
