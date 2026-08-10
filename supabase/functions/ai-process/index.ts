import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { requireAdmin } from '../_shared/auth.ts';
import { flattenFormElements, getPublicFormContext, interpolateFormText, isServiceRequest } from '../_shared/publicFormAuth.ts';

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 64_000) {
      return new Response(
        JSON.stringify({ success: false, error: 'Request body is too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const test = body.test === true;
    if (test) {
      const caller = await requireAdmin(req);
      if (!caller.ok) return caller.response;
    }

    let objective = typeof body.objective === 'string' && body.objective in OBJECTIVE_PROMPTS
      ? body.objective
      : 'custom';
    let prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 20_000) : '';
    let systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 20_000) : '';
    let inputData = body.inputData && typeof body.inputData === 'object' && !Array.isArray(body.inputData)
      ? body.inputData as Record<string, unknown>
      : {};
    let requestedModel = typeof body.model === 'string' ? body.model.slice(0, 100) : '';
    let maxTokens = typeof body.maxTokens === 'number' ? body.maxTokens : 500;
    let temperature = typeof body.temperature === 'number' ? body.temperature : 0.7;

    if (!test && !isServiceRequest(req)) {
      const context = await getPublicFormContext(req, body.formId, body.submissionToken);
      if (!context.ok) return context.response;
      const node = (context.formData.aiNodes || []).find((item: any) => item.id === body.nodeId);
      if (!node) {
        return new Response(JSON.stringify({ success: false, error: 'ai_node_not_allowed' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
      const variables = context.formData.variables || [];
      const elements = (context.formData.pages || []).flatMap((page: any) => flattenFormElements(page.elements || []));
      objective = node.objective in OBJECTIVE_PROMPTS ? node.objective : 'custom';
      prompt = interpolateFormText(node.prompt, answers, variables).slice(0, 20_000);
      systemPrompt = String(node.systemPrompt || '').slice(0, 20_000);
      inputData = {};
      for (const sourceId of node.inputSources || []) {
        if (answers[sourceId] === undefined || answers[sourceId] === null) continue;
        const element = elements.find((item: any) => item.id === sourceId);
        const label = element?.label || element?.placeholder || sourceId;
        inputData[label] = typeof answers[sourceId] === 'object'
          ? JSON.stringify(answers[sourceId])
          : String(answers[sourceId]);
      }
      requestedModel = typeof node.model === 'string' ? node.model.slice(0, 100) : '';
      maxTokens = typeof node.maxTokens === 'number' ? node.maxTokens : 500;
      temperature = typeof node.temperature === 'number' ? node.temperature : 0.7;
    }

    const limited = await enforceRateLimit(
      admin, req, 'ai-process', 10, 60, String(body.formId || ''), serviceRoleKey, corsHeaders,
    );
    if (limited) return limited;

    // Validate
    if (!prompt && !Object.keys(inputData).length && !test) {
      return new Response(
        JSON.stringify({ success: false, error: 'Prompt or input data is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: settings } = await admin
      .from('integration_settings')
      .select('config, is_active')
      .eq('integration_type', 'openai')
      .maybeSingle();

    const config = (settings?.config as Record<string, unknown> | null) || {};
    const openaiKey = settings?.is_active && typeof config.apiKey === 'string' ? config.apiKey : '';
    const lovableKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
    const useOpenAI = config.provider === 'openai' && !!openaiKey;
    const apiKey = useOpenAI ? openaiKey : lovableKey;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'No AI provider is configured' }),
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

    const response = await fetch(
      useOpenAI
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://ai.gateway.lovable.dev/v1/chat/completions',
      {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: requestedModel
          || (useOpenAI && typeof config.model === 'string' ? config.model : '')
          || (useOpenAI ? 'gpt-4.1-mini' : 'google/gemini-3-flash-preview'),
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
