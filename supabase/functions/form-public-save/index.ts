import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type SaveBody = {
  kind: 'response' | 'session';
  action: 'insert' | 'upsert' | 'update';
  payload: Record<string, unknown>;
  onConflict?: string;
  match?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SaveBody;
    if (!body?.kind || !body?.action || !body?.payload) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey);

    const table = body.kind === 'session' ? 'form_sessions' : 'form_responses';
    let query: any = admin.from(table);

    if (body.action === 'insert') {
      query = query.insert(body.payload);
    } else if (body.action === 'upsert') {
      query = query.upsert(body.payload, body.onConflict ? { onConflict: body.onConflict } : undefined);
    } else if (body.action === 'update') {
      query = query.update(body.payload);
      if (!body.match || Object.keys(body.match).length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'missing_match_for_update' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      for (const [key, value] of Object.entries(body.match)) {
        query = query.eq(key, value as any);
      }
    }

    const { error } = await query;

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
