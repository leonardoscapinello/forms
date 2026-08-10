import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-setup-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const setupEnabled = Deno.env.get('SETUP_ENABLED') === 'true';
    const expectedSetupToken = Deno.env.get('SETUP_TOKEN');

    if (payload?.action === 'status') {
      if (!setupEnabled || !expectedSetupToken) {
        return new Response(JSON.stringify({ setupRequired: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const statusClient = createClient(supabaseUrl, serviceRoleKey);
      const { count, error: countError } = await statusClient
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      return new Response(JSON.stringify({ setupRequired: count === 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!setupEnabled) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suppliedSetupToken = req.headers.get('x-setup-token');
    if (!expectedSetupToken || suppliedSetupToken !== expectedSetupToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if any users exist — only allow setup if no users
    const { count } = await adminClient.from('profiles').select('*', { count: 'exact', head: true });
    if (count && count > 0) {
      return new Response(JSON.stringify({ error: 'Setup already completed. Users exist.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, password, displayName } = payload;
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'Email and password required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (password.length < 12 || password.length > 128) {
      return new Response(JSON.stringify({ error: 'Password must be between 12 and 128 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 100)) {
      return new Response(JSON.stringify({ error: 'Invalid display name' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: displayName || 'Admin' },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, userId: newUser.user?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('setup-admin failed', error);
    return new Response(JSON.stringify({ error: 'Setup failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
