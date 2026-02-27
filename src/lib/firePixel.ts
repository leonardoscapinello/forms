/**
 * firePixel — disparo de pixel 100% server-side via Edge Function
 *
 * Nunca depende de client-side (fbq, gtag, ttq, lintrk).
 * Usa a URL correta do Supabase e tem retry automático com backoff exponencial.
 * Funciona mesmo com AdBlock, bloqueio de JS de terceiros, etc.
 */

import type { PixelEventRecord } from '@/lib/webhookPayload';

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pixel-event`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Pixels only fire on the published domain — never on preview/localhost/test */
const PUBLISHED_HOSTS = ['nodecraft-forms.lovable.app'];
function isProductionEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return PUBLISHED_HOSTS.includes(window.location.hostname);
}

interface FirePixelOptions {
  platform: string;
  eventName: string;
  eventId: string;
  formId: string;
  responseId?: string;
  triggerType?: 'load_event' | 'flow_node';
  answers?: Record<string, any>;
  variables?: Record<string, any>;
  userData?: { email?: string; phone?: string; name?: string };
  sourceUrl?: string;
  userAgent?: string;
  customParams?: Record<string, any>;
  // webhook-specific
  webhookUrl?: string;
  webhookMethod?: string;
  webhookPayload?: Record<string, any>;
  queryParams?: Record<string, string>;
  // Meta CAPI enrichment
  fbc?: string;
  fbp?: string;
  clientIpAddress?: string;
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function enrichMetaParams(opts: FirePixelOptions): FirePixelOptions {
  if (opts.platform !== 'meta_pixel') return opts;
  return {
    ...opts,
    fbc: opts.fbc || getCookie('_fbc'),
    fbp: opts.fbp || getCookie('_fbp'),
    sourceUrl: opts.sourceUrl || (typeof window !== 'undefined' ? window.location.href : ''),
    userAgent: opts.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
  };
}

async function callEdgeFunction(body: FirePixelOptions, attempt: number): Promise<boolean> {
  const enriched = enrichMetaParams(body);
  try {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(enriched),
    });
    return res.ok;
  } catch {
    // Network error — will retry
    return false;
  }
}

/**
 * Dispara um pixel via server-side com retry automático.
 * Máximo 3 tentativas: 0ms → 800ms → 2400ms
 */
export async function firePixel(opts: FirePixelOptions): Promise<void> {
  if (opts.platform !== 'webhook' && !isProductionEnvironment()) return; // skip pixels in non-production
  const MAX_ATTEMPTS = 3;
  const BACKOFF_BASE = 800; // ms

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, BACKOFF_BASE * attempt));
    }
    const ok = await callEdgeFunction(opts, attempt);
    if (ok) return;
  }
  // Falha silenciosa após 3 tentativas — nunca quebra a UX do usuário
}

/**
 * Dispara webhook e retorna o body da resposta JSON (para mapeamento de variáveis).
 * Faz até 3 tentativas. Em caso de falha, retorna null.
 */
export async function fireWebhookWithResponse(opts: FirePixelOptions): Promise<Record<string, any> | null> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_BASE = 800;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, BACKOFF_BASE * attempt));
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify(opts),
      });
      if (res.ok) {
        const json = await res.json();
        // Edge function returns { success, results, webhookResponseBody }
        return json?.webhookResponseBody ?? null;
      }
    } catch { /* retry */ }
  }
  return null;
}

/**
 * Tenta client-side (para deduplicação nos ad managers) e garante server-side.
 * Client-side é best-effort — não bloqueia se ausente/bloqueado.
 */
export function firePixelDual(opts: Omit<FirePixelOptions, 'triggerType'> & { triggerType?: FirePixelOptions['triggerType']; onFired?: (record: PixelEventRecord) => void }): void {
  if (!isProductionEnvironment()) {
    // Still record the event even in non-production for webhook tracking
    opts.onFired?.({
      platform: opts.platform,
      event_name: opts.eventName,
      event_id: opts.eventId,
      trigger_type: opts.triggerType || 'flow_node',
      fired_client: false,
      fired_server: false,
      fired_at: new Date().toISOString(),
      custom_params: opts.customParams,
    });
    return;
  }
  // 1. Client-side (best-effort, pode ser bloqueado por AdBlock)
  let firedClient = false;
  if (typeof window !== 'undefined') {
    try {
      const { platform, eventName, eventId, customParams } = opts;
      if (platform === 'meta_pixel' && (window as any).fbq) {
        (window as any).fbq('track', eventName, customParams || {}, { eventID: eventId });
        firedClient = true;
      }
      if (platform === 'google_analytics' && (window as any).gtag) {
        (window as any).gtag('event', eventName.toLowerCase().replace(/[^a-z0-9_]/g, '_'), {
          event_dedup_id: eventId, ...(customParams || {})
        });
        firedClient = true;
      }
      if (platform === 'tiktok_pixel' && (window as any).ttq) {
        (window as any).ttq.track(eventName, customParams || {}, { event_id: eventId });
        firedClient = true;
      }
      if (platform === 'linkedin_pixel' && (window as any).lintrk) {
        (window as any).lintrk('track', { conversion_id: eventId });
        firedClient = true;
      }
    } catch (_) {}
  }

  // Record the event for webhook tracking
  opts.onFired?.({
    platform: opts.platform,
    event_name: opts.eventName,
    event_id: opts.eventId,
    trigger_type: opts.triggerType || 'flow_node',
    fired_client: firedClient,
    fired_server: true, // will be fired below
    fired_at: new Date().toISOString(),
    custom_params: opts.customParams,
  });

  // 2. Server-side com retry — SEMPRE, independente do client
  firePixel({ ...opts, firedClient } as FirePixelOptions);
}
