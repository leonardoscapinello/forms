import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
    const model = config.model || 'gpt-4o-mini';

    // If no OpenAI key, fall back to Lovable AI
    const useLovable = !openaiKey;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!openaiKey && !LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'no_ai_configured', message: 'Nenhuma API de IA configurada. Configure a OpenAI nas integrações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Test mode
    if (body.test) {
      const text = body.text || 'Teste de sentimento';
      const result = await analyzeSentiment(text, useLovable, openaiKey, model, LOVABLE_API_KEY);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch analysis for form responses
    const { form_id, response_ids } = body;
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

    // Extract text answers from each response
    const results = [];
    for (const resp of responses) {
      const answers = resp.answers || {};
      const textParts: string[] = [];
      for (const [key, val] of Object.entries(answers)) {
        if (key.startsWith('__')) continue;
        if (typeof val === 'string' && val.trim().length > 5) textParts.push(val.trim());
      }

      if (textParts.length === 0) {
        results.push({ response_id: resp.response_id, id: resp.id, sentiment: 'neutral', emotions: [], score: 0, summary: 'Sem texto para análise' });
        continue;
      }

      const combinedText = textParts.join(' | ');
      try {
        const analysis = await analyzeSentiment(combinedText, useLovable, openaiKey, model, LOVABLE_API_KEY);
        results.push({ response_id: resp.response_id, id: resp.id, ...analysis });
      } catch (e) {
        results.push({ response_id: resp.response_id, id: resp.id, sentiment: 'error', emotions: [], score: 0, summary: 'Erro na análise' });
      }
    }

    // Aggregate stats
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
    const emotionCounts: Record<string, number> = {};
    let totalScore = 0;
    let scored = 0;

    for (const r of results) {
      if (r.sentiment in sentimentCounts) sentimentCounts[r.sentiment as keyof typeof sentimentCounts]++;
      if (typeof r.score === 'number') { totalScore += r.score; scored++; }
      for (const e of (r.emotions || [])) { emotionCounts[e] = (emotionCounts[e] || 0) + 1; }
    }

    const avgScore = scored > 0 ? Math.round((totalScore / scored) * 100) / 100 : 0;
    const topEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return new Response(JSON.stringify({
      results,
      aggregate: { sentimentCounts, avgScore, topEmotions, total: results.length },
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

async function analyzeSentiment(
  text: string,
  useLovable: boolean,
  openaiKey: string | undefined,
  model: string,
  lovableKey: string | undefined,
) {
  const prompt = `Analise o texto abaixo e retorne um JSON com:
- sentiment: "positive" | "negative" | "neutral" | "mixed"
- score: número de -1.0 a 1.0
- emotions: array de emoções detectadas (ex: "alegria", "frustração", "curiosidade", "ansiedade", "confiança", "surpresa", "raiva", "tristeza", "entusiasmo", "indiferença")
- summary: frase curta descrevendo o tom geral

Texto: "${text.slice(0, 2000)}"

Retorne SOMENTE JSON válido.`;

  const url = useLovable
    ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  const key = useLovable ? lovableKey : openaiKey;
  const aiModel = useLovable ? 'google/gemini-2.5-flash-lite' : model;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: 'You are a sentiment and emotion analysis expert. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('rate_limited');
    if (res.status === 402) throw new Error('payment_required');
    throw new Error(`AI error: ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    return { sentiment: 'neutral', score: 0, emotions: [], summary: raw.slice(0, 200) };
  }
}
