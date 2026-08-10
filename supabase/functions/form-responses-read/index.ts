import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── AES-256-GCM decryption ──
const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('twobrain-salt-v1'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ['decrypt'],
  );
}

async function decryptValue(cipherB64: string, secret: string): Promise<string> {
  // Strip "enc:" prefix
  const raw = cipherB64.startsWith('enc:') ? cipherB64.slice(4) : cipherB64;
  const key = await deriveKey(secret);
  const combined = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

/** Try to decrypt a field; if it's not encrypted (legacy data), return as-is */
async function tryDecrypt(value: any, secret: string): Promise<any> {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith('enc:')) return value; // Not encrypted (legacy)
  try {
    const decrypted = await decryptValue(value, secret);
    // Try to parse as JSON (answers/metadata are stringified JSON)
    try { return JSON.parse(decrypted); } catch { return decrypted; }
  } catch {
    return value; // Decryption failed — return raw
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth check: only authenticated users ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET') ?? '';

    // Verify caller identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { form_id, form_ids, limit = 500, since, fields } = body;

    if (!form_id && (!form_ids || form_ids.length === 0)) {
      return new Response(JSON.stringify({ error: 'form_id or form_ids is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestedFormIds = [...new Set(
      (form_id ? [form_id] : form_ids)
        .filter((id: unknown): id is string => typeof id === 'string'),
    )];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (requestedFormIds.length === 0
      || requestedFormIds.length > 100
      || requestedFormIds.some((id) => !uuidPattern.test(id))) {
      return new Response(JSON.stringify({ error: 'Invalid form IDs' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const callerId = claimsData.claims.sub;
    const { data: adminRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      const { data: ownedForms } = await admin
        .from('forms')
        .select('id')
        .eq('user_id', callerId)
        .in('id', requestedFormIds);

      if ((ownedForms?.length ?? 0) !== requestedFormIds.length) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const allowedFields = new Set([
      'id', 'form_id', 'response_id', 'answers', 'metadata',
      'total_time_ms', 'pages_visited', 'created_at',
    ]);
    const requestedFields = typeof fields === 'string'
      ? fields.split(',').map((field: string) => field.trim()).filter(Boolean)
      : [];
    const selectFields = requestedFields.length > 0 && requestedFields.every((field: string) => allowedFields.has(field))
      ? requestedFields.join(',')
      : 'id, response_id, answers, metadata, total_time_ms, pages_visited, created_at';
    let query = admin
      .from('form_responses')
      .select(selectFields);

    query = requestedFormIds.length === 1
      ? query.eq('form_id', requestedFormIds[0])
      : query.in('form_id', requestedFormIds);

    if (since) {
      query = query.gte('created_at', since);
    }

    const { data: rows, error } = await query
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || 500, 1000)));

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt answers and metadata if encryption is active
    if (encryptionSecret && rows) {
      await Promise.all(rows.map(async (row: any) => {
        row.answers = await tryDecrypt(row.answers, encryptionSecret);
        row.metadata = await tryDecrypt(row.metadata, encryptionSecret);
      }));
    }

    return new Response(JSON.stringify({ data: rows }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
