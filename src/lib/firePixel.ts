/**
 * firePixel — disparo de pixel 100% server-side via Edge Function
 *
 * Nunca depende de client-side (fbq, gtag, ttq, lintrk).
 * Usa a URL correta do Supabase e tem retry automático com backoff exponencial.
 * Funciona mesmo com AdBlock, bloqueio de JS de terceiros, etc.
 */

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pixel-event`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface FirePixelOptions {
  platform: string;
  eventName: string;
  eventId: string;
  formId: string;
  responseId?: string;
  triggerType?: 'load_event' | 'flow_node';
  answers?: Record<string, any>;
  variables?: Record<string, any>;
  userData?: { email?: string; phone?: string };
  sourceUrl?: string;
  userAgent?: string;
  customParams?: Record<string, any>;
  // webhook-specific
  webhookUrl?: string;
  webhookMethod?: string;
  webhookPayload?: Record<string, any>;
  queryParams?: Record<string, string>;
}

async function callEdgeFunction(body: FirePixelOptions, attempt: number): Promise<boolean> {
  try {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(body),
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
 * Tenta client-side (para deduplicação nos ad managers) e garante server-side.
 * Client-side é best-effort — não bloqueia se ausente/bloqueado.
 */
export function firePixelDual(opts: Omit<FirePixelOptions, 'triggerType'> & { triggerType?: FirePixelOptions['triggerType'] }): void {
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

  // 2. Server-side com retry — SEMPRE, independente do client
  firePixel({ ...opts, firedClient } as FirePixelOptions);
}
