import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
  'Vary': 'Accept-Encoding',
};

/**
 * Lightweight public form delivery endpoint.
 * Returns ONLY the fields needed for rendering the form —
 * strips admin-only metadata, reduces payload size by ~40%.
 *
 * GET /form-public-get?id=<uuid>
 * POST /form-public-get { id: "<uuid>" }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let formId: string | null = null;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      formId = url.searchParams.get('id');
    } else {
      const body = await req.json();
      formId = body?.id;
    }

    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing form ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // First try published/closed
    const { data, error } = await supabase
      .from('forms')
      .select('id, title, status, data')
      .eq('id', formId)
      .in('status', ['published', 'closed'])
      .single();

    if (error || !data) {
      // Check if form exists but is draft/archived — return notFoundRedirectUrl if configured
      const { data: draftData } = await supabase
        .from('forms')
        .select('data')
        .eq('id', formId)
        .single();

      if (draftData?.data) {
        const d = draftData.data as Record<string, unknown>;
        const redirectUrl = d.notFoundRedirectUrl as string | undefined;
        if (redirectUrl) {
          return new Response(JSON.stringify({ error: 'Form not available', redirectUrl }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ error: 'Form not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Strip admin-only fields from the data blob to minimize payload
    const d = data.data as Record<string, unknown>;
    
    // These keys are only used by the editor/admin and are NOT needed for rendering
    const ADMIN_ONLY_KEYS = new Set([
      'flowNodePositions',
      'responseCount',
      'completionRate',
      'createdAt',
      'updatedAt',
      'folderId',
    ]);

    const cleaned: Record<string, unknown> = {};
    for (const key in d) {
      if (ADMIN_ONLY_KEYS.has(key)) continue;
      cleaned[key] = d[key];
    }

    const result = {
      id: data.id,
      title: data.title,
      status: data.status,
      data: cleaned,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
