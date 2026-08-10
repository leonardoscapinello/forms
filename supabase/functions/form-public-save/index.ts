import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { verifySignedState } from '../_shared/signedState.ts';
import { flattenFormElements } from '../_shared/publicFormAuth.ts';

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
  token: string;
  kind: 'response' | 'session' | 'event';
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

function isAllowedWebhookUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host === '[::1]') return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return false;
    const match172 = host.match(/^172\.(\d{1,3})\./);
    return !(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31);
  } catch {
    return false;
  }
}

async function fireCompletionWebhook(form: any, payload: Record<string, unknown>): Promise<void> {
  const url = form?.data?.completionWebhookUrl;
  if (typeof url !== 'string' || !url) return;
  if (!isAllowedWebhookUrl(url)) {
    console.error('completion_webhook_url_not_allowed');
    return;
  }
  const answers = payload.answers as Record<string, unknown> || {};
  const metadata = payload.metadata as Record<string, unknown> || {};
  const variables = Object.fromEntries(
    Object.entries(answers)
      .filter(([key]) => key.startsWith('__var_'))
      .map(([key, value]) => [key.slice('__var_'.length), value]),
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        type: 'form_completed',
        form_id: form.id,
        form_title: form.title,
        response_id: payload.response_id,
        submitted_at: metadata.submitted_at || new Date().toISOString(),
      },
      answers,
      variables,
      metadata,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) console.error('completion_webhook_failed', response.status);
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
      for (const el of flattenFormElements(page.elements || [])) {
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

const VALID_KINDS = ['response', 'session', 'event'] as const;
const VALID_ACTIONS = ['insert', 'upsert', 'update'] as const;
const MAX_BODY_SIZE = 500_000; // 500KB

function isValidKind(v: unknown): v is SaveBody['kind'] {
  return typeof v === 'string' && (VALID_KINDS as readonly string[]).includes(v);
}
function isValidAction(v: unknown): v is SaveBody['action'] {
  return typeof v === 'string' && (VALID_ACTIONS as readonly string[]).includes(v);
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pick(payload: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(allowed.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]));
}

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_SIZE) {
      return new Response(JSON.stringify({ success: false, error: 'payload_too_large' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = JSON.parse(rawBody) as SaveBody;
    if (typeof body?.token !== 'string') return errorResponse(401, 'invalid_or_expired_token');
    if (!isValidKind(body?.kind) || !isValidAction(body?.action) || !isPlainObject(body?.payload)) {
      return errorResponse(400, 'invalid_payload');
    }

    const tokenData = await verifySignedState(body.token);
    const formId = typeof tokenData?.formId === 'string' ? tokenData.formId : '';
    if (tokenData?.kind !== 'form-submission' || !UUID_PATTERN.test(formId)) {
      return errorResponse(401, 'invalid_or_expired_token');
    }
    if (body.payload.form_id !== undefined && body.payload.form_id !== formId) {
      return errorResponse(403, 'form_mismatch');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
    if (!encryptionSecret) return errorResponse(503, 'encryption_unavailable');
    const admin = createClient(supabaseUrl, serviceKey);
    const rateLimited = await enforceRateLimit(
      admin, req, 'form-public-save', 180, 60, formId, serviceKey, corsHeaders,
    );
    if (rateLimited) return rateLimited;

    const { data: formRow } = await admin
      .from('forms')
      .select('id, title, data')
      .eq('id', formId)
      .eq('status', 'published')
      .maybeSingle();
    if (!formRow) return errorResponse(404, 'form_not_available');

    let safePayload: Record<string, unknown>;
    if (body.kind === 'response') {
      if (body.action !== 'upsert') return errorResponse(400, 'invalid_action');
      safePayload = pick(body.payload, [
        'response_id', 'session_id', 'answers', 'metadata', 'total_time_ms', 'pages_visited',
      ]);
      safePayload.form_id = formId;
      if (typeof safePayload.response_id !== 'string' || !UUID_PATTERN.test(safePayload.response_id)) {
        return errorResponse(400, 'invalid_response_id');
      }
      if (safePayload.session_id !== null && safePayload.session_id !== undefined
        && (typeof safePayload.session_id !== 'string' || !UUID_PATTERN.test(safePayload.session_id))) {
        return errorResponse(400, 'invalid_session_id');
      }
      if (!isPlainObject(safePayload.answers) || !isPlainObject(safePayload.metadata)) {
        return errorResponse(400, 'invalid_response_data');
      }
    } else if (body.kind === 'session') {
      if (body.action !== 'insert' && body.action !== 'update') return errorResponse(400, 'invalid_action');
      safePayload = pick(body.payload, [
        'id', 'response_id', 'status', 'completed_at', 'last_seen_at', 'current_page_index',
        'pages_visited', 'total_pages', 'source_url', 'referrer', 'user_agent', 'query_params',
      ]);
      safePayload.form_id = formId;
      const sessionId = body.action === 'insert' ? safePayload.id : body.match?.id;
      if (typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) return errorResponse(400, 'invalid_session_id');
      if (body.action === 'insert'
        && (typeof safePayload.response_id !== 'string' || !UUID_PATTERN.test(safePayload.response_id))) {
        return errorResponse(400, 'invalid_response_id');
      }
      if (safePayload.status !== undefined && !['active', 'completed', 'dropped'].includes(String(safePayload.status))) {
        return errorResponse(400, 'invalid_session_status');
      }
    } else {
      if (body.action !== 'insert') return errorResponse(400, 'invalid_action');
      safePayload = pick(body.payload, [
        'session_id', 'response_id', 'page_id', 'page_index', 'page_title', 'event_type',
        'time_on_page_ms', 'hesitation_ms', 'interaction_count', 'answer_char_count',
      ]);
      safePayload.form_id = formId;
      if (typeof safePayload.response_id !== 'string' || !UUID_PATTERN.test(safePayload.response_id)) {
        return errorResponse(400, 'invalid_response_id');
      }
      if (safePayload.session_id !== null && safePayload.session_id !== undefined
        && (typeof safePayload.session_id !== 'string' || !UUID_PATTERN.test(safePayload.session_id))) {
        return errorResponse(400, 'invalid_session_id');
      }
      if (!['form_start', 'page_view', 'form_complete', 'form_drop'].includes(String(safePayload.event_type))) {
        return errorResponse(400, 'invalid_event_type');
      }
    }

    // ── Encrypt sensitive fields for form_responses ──
    // Google Sheets gets plaintext (before encryption), DB gets ciphertext
    const originalPayload = { ...safePayload };

    if (body.kind === 'response' && encryptionSecret) {
      // Encrypt answers (JSONB → encrypted string)
      if (safePayload.answers !== undefined && safePayload.answers !== null) {
        const plainAnswers = JSON.stringify(safePayload.answers);
        safePayload.answers = await encryptValue(plainAnswers, encryptionSecret);
      }
      // Encrypt metadata (JSONB → encrypted string)
      if (safePayload.metadata !== undefined && safePayload.metadata !== null) {
        const plainMeta = JSON.stringify(safePayload.metadata);
        safePayload.metadata = await encryptValue(plainMeta, encryptionSecret);
      }
    }

    const table = body.kind === 'session' ? 'form_sessions' : body.kind === 'event' ? 'form_page_events' : 'form_responses';
    let query: any = admin.from(table);

    if (body.action === 'insert') {
      query = query.insert(safePayload);
    } else if (body.action === 'upsert') {
      query = query.upsert(safePayload, { onConflict: 'form_id,response_id' });
    } else if (body.action === 'update') {
      query = query.update(safePayload).eq('id', body.match!.id).eq('form_id', formId);
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
        try {
          await fireCompletionWebhook(formRow, originalPayload);
        } catch (error) {
          console.error('completion_webhook_error', error instanceof Error ? error.message : 'unknown');
        }
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
