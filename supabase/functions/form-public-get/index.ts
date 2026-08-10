import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { createSignedState } from '../_shared/signedState.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  // Workflow data must always be fresh; stale caches can break routing and submit too early
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Vary': 'Accept-Encoding',
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const rateLimited = await enforceRateLimit(
      supabase, req, 'form-public-get', 60, 60, '', serviceKey, corsHeaders,
    );
    if (rateLimited) return rateLimited;

    let formId: string | null = null;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      formId = url.searchParams.get('id');
    } else {
      const body = await req.json();
      formId = body?.id;
    }

    if (!formId || !UUID_PATTERN.test(formId)) {
      return new Response(JSON.stringify({ error: 'Invalid form ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      'completionWebhookUrl',
    ]);

    const cleaned: Record<string, unknown> = {};
    for (const key in d) {
      if (ADMIN_ONLY_KEYS.has(key)) continue;
      cleaned[key] = d[key];
    }
    // Webhook destinations, headers and test payloads stay server-side. The
    // public runtime only needs node identity and response mappings; pixel-event
    // resolves the authoritative configuration from the database.
    if (Array.isArray(d.integrationNodes)) {
      cleaned.integrationNodes = d.integrationNodes.map((node: any) => ({
        id: node.id,
        platform: node.platform,
        responseMappings: node.responseMappings,
        fireOnce: node.fireOnce,
      }));
    }
    if (Array.isArray(d.whatsappNodes)) {
      cleaned.whatsappNodes = d.whatsappNodes.map((node: any) => ({ id: node.id, fireOnce: node.fireOnce }));
    }
    if (Array.isArray(d.emailNodes)) {
      cleaned.emailNodes = d.emailNodes.map((node: any) => ({ id: node.id, fireOnce: node.fireOnce }));
    }
    if (Array.isArray(d.aiNodes)) {
      cleaned.aiNodes = d.aiNodes.map((node: any) => ({
        id: node.id,
        outputVariableId: node.outputVariableId,
        executionMode: node.executionMode,
        fireOnce: node.fireOnce,
      }));
    }
    cleaned.submissionToken = await createSignedState({
      kind: 'form-submission',
      formId: data.id,
    }, 24 * 60 * 60);

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
