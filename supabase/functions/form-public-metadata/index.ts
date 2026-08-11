import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateAndRateLimitPublicFormAccess } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
  'Vary': 'Accept-Encoding',
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INPUT_TYPES = new Set([
  'input_text', 'input_email', 'input_phone', 'input_address', 'input_checkbox', 'input_select',
  'input_radio', 'input_rating', 'input_nps', 'input_number', 'input_textarea', 'input_date',
  'input_height', 'input_weight', 'input_document', 'input_company', 'input_yes_no',
  'input_multi_select', 'input_quiz_icon', 'input_quiz_image',
]);
const FALLBACK_LABELS: Record<string, string> = {
  input_text: 'Sua resposta',
  input_email: 'E-mail',
  input_phone: 'Telefone',
  input_address: 'Endereço',
  input_select: 'Selecione uma opção',
  input_radio: 'Escolha uma opção',
  input_multi_select: 'Selecione as opções',
  input_rating: 'Sua avaliação',
  input_nps: 'Sua nota',
  input_date: 'Data',
  input_number: 'Número',
  input_textarea: 'Conte um pouco mais',
};

function text(value: unknown, maximum = 220): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicSeo(value: unknown) {
  const source = object(value);
  const allowed = [
    'title', 'description', 'keywords', 'ogImage', 'ogType', 'canonicalUrl', 'robots',
    'twitterCard', 'structuredData', 'favicon', 'themeColor',
  ];
  const result: Record<string, string> = {};
  for (const key of allowed) {
    if (typeof source[key] !== 'string') continue;
    const limit = key === 'structuredData' ? 20_000 : key === 'description' ? 500 : 2_000;
    const value = String(source[key]).trim().slice(0, limit);
    if (value) result[key] = value;
  }
  return result;
}

function firstUsefulPage(data: Record<string, unknown>): Record<string, unknown> {
  const welcome = object(data.welcomePage);
  if (data.showWelcomeScreen === true && Array.isArray(welcome.elements) && welcome.elements.length) return welcome;
  const pages = Array.isArray(data.pages) ? data.pages : [];
  return object(pages.find((entry) => Array.isArray(object(entry).elements) && (object(entry).elements as unknown[]).length) || pages[0]);
}

function buildPreview(data: Record<string, unknown>) {
  const style = object(data.style);
  const page = firstUsefulPage(data);
  const elements = Array.isArray(page.elements) ? page.elements.map(object) : [];
  const fields = elements
    .filter((element) => INPUT_TYPES.has(String(element.type || '')))
    .map((element) => text(element.label || element.placeholder, 80) || FALLBACK_LABELS[String(element.type)] || 'Sua resposta')
    .filter(Boolean)
    .slice(0, 4);

  // A form can start with visual content and no input on its first page. The
  // mock remains useful (and never empty) without exposing workflow internals.
  if (!fields.length) fields.push('Sua resposta');
  const button = elements.find((element) => element.type === 'button');
  const heading = elements.find((element) => element.type === 'heading');

  return {
    pageTitle: text(heading?.content || page.title || data.welcomeTitle || data.title, 100),
    fields,
    buttonLabel: text(button?.content || data.welcomeButtonText, 40) || 'Continuar',
    primaryColor: text(style.buttonBgColor || style.primaryColor, 50),
    backgroundColor: text(style.backgroundColor, 50),
    textColor: text(style.textColor, 50),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!['GET', 'HEAD'].includes(req.method)) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'GET, HEAD, OPTIONS' },
    });
  }

  try {
    const formId = new URL(req.url).searchParams.get('id') || '';
    if (!UUID_PATTERN.test(formId)) {
      return new Response(JSON.stringify({ error: 'Invalid form ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Server configuration unavailable');
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const access = await validateAndRateLimitPublicFormAccess(
      supabase,
      req,
      formId,
      {
        bucket: 'form-public-metadata:ip-form',
        limit: 5_000,
        windowSeconds: 60,
        serviceRoleKey: serviceKey,
        responseHeaders: corsHeaders,
      },
    );
    if (access.response) return access.response;

    const [{ data: row, error }, { data: brandRow }] = await Promise.all([
      supabase
        .from('forms')
        .select('id, title, status, data, updated_at')
        .eq('id', formId)
        .in('status', ['published', 'closed'])
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'brand')
        .maybeSingle(),
    ]);
    if (error) throw error;
    if (!row) {
      return new Response(JSON.stringify({ error: 'Form not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formData = object(row.data);
    const brand = object(brandRow?.value);
    const payload = {
      id: row.id,
      title: text(row.title || formData.title, 160),
      description: text(formData.description || formData.welcomeDescription, 500),
      status: row.status,
      updatedAt: row.updated_at,
      brand: {
        productName: text(brand.productName, 80),
        ownerName: text(brand.ownerName, 120),
        description: text(brand.description, 320),
        logoUrl: text(brand.logoUrl, 2_048),
        faviconUrl: text(brand.faviconUrl, 2_048),
      },
      seo: publicSeo(formData.seo),
      preview: buildPreview({ ...formData, title: row.title || formData.title }),
    };

    return new Response(req.method === 'HEAD' ? null : JSON.stringify(payload), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('form-public-metadata failed', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: 'Metadata temporarily unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '10' },
    });
  }
});
