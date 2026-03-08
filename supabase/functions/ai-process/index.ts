import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OBJECTIVE_PROMPTS: Record<string, string> = {
  summarize: 'You are an expert summarizer. Summarize the following form data concisely in the same language as the input. Be clear and actionable.',
  classify: 'You are a classification expert. Analyze the following form data and classify it into the most appropriate category. Respond with just the category name. Use the same language as the input.',
  generate: 'You are a creative writer. Generate personalized content based on the following form data. Match the tone and language of the input.',
  extract: 'You are a data extraction specialist. Extract the requested information from the following form data. Return only the extracted data in a clear format. Use the same language as the input.',
  custom: 'You are a helpful AI assistant. Follow the instructions carefully.',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const {
      objective = 'custom',
      prompt = '',
      systemPrompt = '',
      inputData = {},
      model,
      maxTokens = 500,
      temperature = 0.7,
      test = false,
    } = body;

    // Validate
    if (!prompt && !Object.keys(inputData).length && !test) {
      return new Response(
        JSON.stringify({ success: false, error: 'Prompt or input data is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build the system prompt
    const baseSystem = OBJECTIVE_PROMPTS[objective] || OBJECTIVE_PROMPTS.custom;
    const fullSystem = systemPrompt ? `${baseSystem}\n\n${systemPrompt}` : baseSystem;

    // Build user message
    let userMessage = '';
    if (Object.keys(inputData).length > 0) {
      userMessage += 'Form data:\n';
      for (const [key, value] of Object.entries(inputData)) {
        userMessage += `- ${key}: ${value}\n`;
      }
      userMessage += '\n';
    }
    if (prompt) {
      userMessage += prompt;
    }
    if (test && !userMessage) {
      userMessage = 'This is a test message. Please respond with "AI node is working correctly!" in the same language as the system prompt.';
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: fullSystem },
          { role: 'user', content: userMessage },
        ],
        max_tokens: Math.min(maxTokens, 4000),
        temperature: Math.max(0, Math.min(temperature, 2)),
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `AI gateway error (${response.status})` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || '';

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('ai-process error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
