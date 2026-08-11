import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAdmin } from '../_shared/auth.ts';
import {
  promoteCreatedUserToAdmin,
  rollbackCreatedAuthUser,
} from '../_shared/adminUserCreation.ts';
import { readLimitedJsonObject } from '../_shared/limitedJsonBody.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    });
  }

  try {
    const caller = await requireAdmin(req);
    if (!caller.ok) return caller.response;
    const adminClient = caller.admin;

    const parsedBody = await readLimitedJsonObject(req, 4 * 1024, corsHeaders);
    if (!parsedBody.ok) return parsedBody.response;
    const { email, password, displayName, role } = parsedBody.value;

    // ── Input validation ──
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (password.length < 12 || password.length > 128) {
      return new Response(JSON.stringify({ error: 'Password must be between 12 and 128 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 100)) {
      return new Response(JSON.stringify({ error: 'Display name must be under 100 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role !== undefined && role !== 'admin' && role !== 'user') {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create the user with service role (bypasses signup restrictions)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName || '' },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const createdUserId = newUser.user?.id;
    if (!createdUserId) {
      return new Response(JSON.stringify({ error: 'User creation was not acknowledged' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role === 'admin') {
      // The signup trigger creates one `user` role. Treat the second operation
      // as committed only after exact row-count and returned-row ACK.
      const promotion = await promoteCreatedUserToAdmin(adminClient, createdUserId);
      if (!promotion.ok) {
        const rolledBack = await rollbackCreatedAuthUser(adminClient, createdUserId);
        console.error('admin-create-user role promotion failed', {
          reason: promotion.reason,
          rollback: rolledBack ? 'confirmed' : 'unconfirmed',
        });
        return new Response(JSON.stringify({
          error: rolledBack
            ? 'User creation was rolled back because the requested role was not confirmed'
            : 'User role was not confirmed; manual review is required',
        }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, user: { id: createdUserId, email } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
