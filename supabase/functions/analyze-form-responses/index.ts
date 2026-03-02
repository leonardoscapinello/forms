import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── AES-256-GCM decryption for encrypted form data ──
async function _deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('twobrain-salt-v1'), iterations: 100_000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function tryDecryptField(value: any, secret: string): Promise<any> {
  if (!value || typeof value !== 'string' || !value.startsWith('enc:') || !secret) return value;
  try {
    const key = await _deriveKey(secret);
    const combined = Uint8Array.from(atob(value.slice(4)), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
    const text = new TextDecoder().decode(decrypted);
    try { return JSON.parse(text); } catch { return text; }
  } catch { return value; }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { form_id } = await req.json();
    if (!form_id) throw new Error('form_id is required');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if user has custom OpenAI config with systemPrompt
    const { data: aiSettings } = await supabase
      .from('integration_settings')
      .select('config')
      .eq('integration_type', 'openai')
      .maybeSingle();

    const aiConfig = (aiSettings?.config as any) || {};
    const customSystemPrompt = aiConfig.systemPrompt || '';

    // Fetch last 100 responses for this form
    const { data: responses, error } = await supabase
      .from('form_responses')
      .select('answers, total_time_ms, pages_visited, metadata, created_at')
      .eq('form_id', form_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!responses || responses.length === 0) {
      return new Response(JSON.stringify({ error: 'no_responses', message: 'Nenhuma resposta encontrada para análise.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract text answers for analysis
    const textAnswers: string[] = [];
    const completionTimes: number[] = [];
    const responseLengths: number[] = [];

    const encSecret = Deno.env.get('ENCRYPTION_SECRET') ?? '';

    for (const resp of responses) {
      if (resp.total_time_ms) completionTimes.push(resp.total_time_ms);
      const answers = await tryDecryptField(resp.answers, encSecret) || {};
      let totalChars = 0;
      for (const val of Object.values(answers)) {
        if (typeof val === 'string' && val.trim().length > 10) {
          textAnswers.push(val.trim());
          totalChars += val.length;
        }
      }
      if (totalChars > 0) responseLengths.push(totalChars);
    }

    const sampleAnswers = textAnswers.slice(0, 40).join(' | ');
    const avgTime = completionTimes.length > 0
      ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length / 1000)
      : null;
    const avgChars = responseLengths.length > 0
      ? Math.round(responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length)
      : null;

    const baseContext = `FORM RESPONSE DATA:
- Total responses analyzed: ${responses.length}
- Average completion time: ${avgTime ? `${avgTime} seconds` : 'N/A'}
- Average response length: ${avgChars ? `${avgChars} characters` : 'N/A'}
- Sample text responses: ${sampleAnswers || '(no text responses available)'}`;

    const systemPrompt = customSystemPrompt || `You are an elite behavioral psychologist and consumer intelligence analyst. Analyze form response data and return structured insights.`;

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

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'rate_limited', message: 'Limite de requisições atingido. Tente novamente em alguns minutos.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'payment_required', message: 'Créditos insuficientes para análise AI.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '{}';

    const jsonStr = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let analysis: Record<string, unknown> = {};
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      analysis = { raw: rawContent };
    }

    return new Response(JSON.stringify({
      success: true,
      responses_analyzed: responses.length,
      text_responses_analyzed: textAnswers.length,
      avg_completion_time_s: avgTime,
      avg_response_chars: avgChars,
      analysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('analyze-form-responses error:', e);
    return new Response(JSON.stringify({ error: 'internal', message: e instanceof Error ? e.message : 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
