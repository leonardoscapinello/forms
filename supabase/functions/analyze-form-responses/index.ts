import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Extract text answers for sentiment analysis
    const textAnswers: string[] = [];
    const completionTimes: number[] = [];
    const responseLengths: number[] = [];

    for (const resp of responses) {
      if (resp.total_time_ms) completionTimes.push(resp.total_time_ms);
      const answers = resp.answers || {};
      let totalChars = 0;
      for (const val of Object.values(answers)) {
        if (typeof val === 'string' && val.trim().length > 10) {
          textAnswers.push(val.trim());
          totalChars += val.length;
        }
      }
      if (totalChars > 0) responseLengths.push(totalChars);
    }

    // Prepare summary for AI
    const sampleAnswers = textAnswers.slice(0, 40).join(' | ');
    const avgTime = completionTimes.length > 0
      ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length / 1000)
      : null;
    const avgChars = responseLengths.length > 0
      ? Math.round(responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length)
      : null;

    const prompt = `Você é um especialista em analytics de marketing e UX research com visão de CMO (Chief Marketing Officer). Analise os dados de respostas de um formulário corporativo de alto impacto e forneça insights estratégicos profundos.

DADOS:
- Total de respostas: ${responses.length}
- Tempo médio de conclusão: ${avgTime ? `${avgTime} segundos` : 'N/A'}
- Comprimento médio das respostas: ${avgChars ? `${avgChars} caracteres` : 'N/A'}
- Respostas em texto (amostra): ${sampleAnswers || '(nenhuma resposta em texto disponível)'}

Analise e retorne um JSON com:
1. sentiment_overall: 'positive' | 'neutral' | 'negative' | 'mixed'
2. sentiment_score: número de -1.0 a 1.0
3. sentiment_summary: parágrafo sobre sentimento geral com implicações de negócio
4. writing_style: análise do estilo de escrita (formal/informal, objetividade, engajamento)
5. engagement_quality: string descritiva com justificativa (ex: 'Alto engajamento — respostas longas indicam interesse genuíno')
6. key_themes: array de até 5 temas principais encontrados
7. response_quality_score: número de 0 a 100
8. cmo_insights: array de 5-6 insights estratégicos de alto valor para CMO sobre captação de leads, qualidade da audiência, intenção de compra, objeções e oportunidades
9. recommendations: array de 4-5 recomendações acionáveis para melhorar conversão e qualidade das respostas
10. completion_analysis: análise sobre tempo de conclusão, indicadores de fricção e otimizações de UX
11. lead_quality_indicators: array de 2-3 sinais que indicam qualidade do lead baseado nas respostas
12. drop_off_hypothesis: hipótese sobre por que usuários abandonam o formulário

Retorne SOMENTE o JSON válido, sem markdown ou texto adicional.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are an expert marketing analytics AI specializing in lead generation, conversion optimization, and CMO-level strategic insights. Always respond with valid JSON only, no markdown.' },
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

    // Clean markdown fences if present
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
