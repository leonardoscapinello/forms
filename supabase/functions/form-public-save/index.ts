import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── AES-256-GCM encryption helpers ──
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
    ['encrypt', 'decrypt'],
  );
}

async function encryptValue(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  // Prefix with "enc:" so we know it's encrypted
  return 'enc:' + btoa(String.fromCharCode(...combined));
}

type SaveBody = {
  kind: 'response' | 'session';
  action: 'insert' | 'upsert' | 'update';
  payload: Record<string, unknown>;
  onConflict?: string;
  match?: Record<string, unknown>;
};

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Refresh Google access token */
async function refreshGoogleToken(supabase: any, settingsId: string, cfg: any): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) return '';
  await supabase.from('integration_settings').update({
    config: { ...cfg, accessToken: data.access_token, tokenExpiry: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() },
  }).eq('id', settingsId);
  return data.access_token;
}

/** Get a valid Google access token */
async function getGoogleToken(supabase: any): Promise<string | null> {
  const { data: settings } = await supabase.from('integration_settings').select('id, config').eq('integration_type', 'google_oauth').eq('is_active', true).maybeSingle();
  if (!settings) return null;
  const cfg = settings.config as any;
  if (!cfg.accessToken) return null;
  if (cfg.tokenExpiry && new Date(cfg.tokenExpiry) < new Date()) {
    if (!cfg.refreshToken) return null;
    return (await refreshGoogleToken(supabase, settings.id, cfg)) || null;
  }
  return cfg.accessToken;
}

/** Resolve cell value */
function resolveCellValue(answers: any, fieldId: string): string {
  const val = answers?.[fieldId];
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') {
    if (val.full_number) return val.full_number;
    const parts = Object.values(val).filter((v) => v && typeof v === 'string');
    return parts.length > 0 ? parts.join(', ') : JSON.stringify(val);
  }
  return String(val);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/** Append a single response row to Google Sheets (uses PLAINTEXT answers before encryption) */
async function appendToSheet(supabase: any, formId: string, payload: Record<string, unknown>) {
  try {
    const { data: formRow } = await supabase.from('forms').select('data').eq('id', formId).single();
    if (!formRow) return;
    const formData = formRow.data as any;
    const sheetId = formData?.googleSheetId;
    if (!sheetId) return;

    const token = await getGoogleToken(supabase);
    if (!token) return;

    const inputElements: { id: string; label: string }[] = [];
    for (const page of formData?.pages || []) {
      for (const el of page.elements || []) {
        if (el.type?.startsWith('input_')) {
          inputElements.push({ id: el.id, label: el.label || el.placeholder || el.type.replace('input_', '').replace(/_/g, ' ') });
        }
      }
    }

    const formVariables: { name: string }[] = (formData?.variables || []).map((v: any) => ({ name: v.name }));

    const countRes = await fetch(`${SHEETS_API}/${sheetId}/values/Respostas!A:A`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const countData = await countRes.json();
    const rowNum = (countData.values?.length || 1);

    const metadata = payload.metadata as any;
    const answers = payload.answers as any;
    const isComplete = metadata?.status === 'complete' || !!metadata?.submitted_at;
    const responseHash = metadata?.response_hash || (payload.response_id as string || '').slice(0, 8).toUpperCase();

    const row = [
      rowNum,
      responseHash,
      isComplete ? 'Completa' : 'Parcial',
      formatDate(metadata?.landed_at || new Date().toISOString()),
      metadata?.submitted_at ? formatDate(metadata.submitted_at) : '',
      formatDuration(payload.total_time_ms as number | null),
      ...inputElements.map(f => resolveCellValue(answers, f.id)),
      ...formVariables.map(v => {
        const val = answers?.[`__var_${v.name}`];
        return val !== undefined && val !== null ? String(val) : '';
      }),
    ];

    await fetch(`${SHEETS_API}/${sheetId}/values/Respostas!A${rowNum + 1}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    });
  } catch (err) {
    console.error('Auto-append to Google Sheets failed:', err);
  }
}

Deno.serve(async (req) => {
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
    const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Encrypt sensitive fields for form_responses ──
    // Google Sheets gets plaintext (before encryption), DB gets ciphertext
    const originalPayload = { ...body.payload };

    if (body.kind === 'response' && encryptionSecret) {
      // Encrypt answers (JSONB → encrypted string)
      if (body.payload.answers !== undefined && body.payload.answers !== null) {
        const plainAnswers = JSON.stringify(body.payload.answers);
        body.payload.answers = await encryptValue(plainAnswers, encryptionSecret);
      }
      // Encrypt metadata (JSONB → encrypted string)
      if (body.payload.metadata !== undefined && body.payload.metadata !== null) {
        const plainMeta = JSON.stringify(body.payload.metadata);
        body.payload.metadata = await encryptValue(plainMeta, encryptionSecret);
      }
    }

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

    // Auto-append to Google Sheets on complete response (uses PLAINTEXT data)
    if (body.kind === 'response' && originalPayload.form_id) {
      const metadata = originalPayload.metadata as any;
      const isComplete = metadata?.status === 'complete' || !!metadata?.submitted_at;
      if (isComplete) {
        appendToSheet(admin, originalPayload.form_id as string, originalPayload).catch(() => {});
      }
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
