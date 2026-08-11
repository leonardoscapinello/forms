/**
 * firePixel — disparo de pixel 100% server-side via Edge Function
 *
 * Nunca depende de client-side (fbq, gtag, ttq, lintrk).
 * Usa a URL correta do Supabase e tem retry automático com backoff exponencial.
 * Funciona mesmo com AdBlock, bloqueio de JS de terceiros, etc.
 */

import type { PixelEventRecord } from '@/lib/webhookPayload';
import { executeWorkflowSideEffect } from '@/lib/workflowSideEffect';

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pixel-event`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Pixels never fire on localhost. Production can optionally be restricted to
 * a comma-separated host allowlist through VITE_PIXEL_ALLOWED_HOSTS. */
const PUBLISHED_HOSTS = String(import.meta.env.VITE_PIXEL_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
function isProductionEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || window.location.protocol !== 'https:') return false;
  return PUBLISHED_HOSTS.length === 0 || PUBLISHED_HOSTS.includes(host);
}

interface FirePixelOptions {
  submissionToken?: string;
  nodeId?: string;
  entryId?: string;
  platform: string;
  eventName: string;
  eventId: string;
  formId: string;
  responseId?: string;
  workflowSourceNodeId?: string;
  workflowProof?: string;
  triggerType?: 'load_event' | 'flow_node';
  answers?: Record<string, any>;
  variables?: Record<string, any>;
  userData?: { email?: string; phone?: string; name?: string };
  sourceUrl?: string;
  userAgent?: string;
  customParams?: Record<string, any>;
  /** Whether client-side pixel was already fired (for dedup in server logs) */
  firedClient?: boolean;
  // webhook-specific
  webhookUrl?: string;
  webhookMethod?: string;
  webhookPayload?: Record<string, any>;
  webhookHeaders?: { id: string; key: string; value: string }[];
  webhookQueryParams?: { id: string; key: string; value: string }[];
  webhookBodyParams?: { id: string; key: string; value: string }[];
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

async function callEdgeFunction(body: FirePixelOptions, signal: AbortSignal): Promise<Record<string, any>> {
  const enriched = enrichMetaParams(body);
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(enriched),
    signal,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success !== true || payload?.processing === true) {
    throw new Error(payload?.processing ? 'delivery_still_processing' : 'delivery_not_acknowledged');
  }
  return payload;
}

/**
 * Dispara um pixel via server-side com retry automático.
 * Máximo 3 tentativas: 0ms → 800ms → 2400ms
 */
export async function firePixel(opts: FirePixelOptions): Promise<void> {
  if (opts.platform !== 'webhook' && !isProductionEnvironment()) return; // skip pixels in non-production
  await executeWorkflowSideEffect({
    label: opts.platform === 'webhook' ? 'o webhook' : 'o evento de analytics',
    nodeId: opts.nodeId,
    baseDelayMs: 800,
    operation: (signal) => callEdgeFunction(opts, signal),
  });
}

/**
 * Dispara webhook e retorna o body da resposta JSON (para mapeamento de variáveis).
 * Faz até 3 tentativas. Só resolve depois do ACK real do destino.
 */
export async function fireWebhookWithResponse(opts: FirePixelOptions): Promise<Record<string, any> | null> {
  const payload = await fireWebhookWithWorkflowProof(opts);
  return payload.webhookResponseBody ?? null;
}

export async function fireWebhookWithWorkflowProof(
  opts: FirePixelOptions,
): Promise<{ webhookResponseBody: Record<string, any> | null; workflowProof?: string }> {
  const payload = await executeWorkflowSideEffect({
    label: 'o webhook',
    nodeId: opts.nodeId,
    baseDelayMs: 800,
    operation: (signal) => callEdgeFunction(opts, signal),
  });
  return {
    webhookResponseBody: payload?.webhookResponseBody ?? null,
    ...(typeof payload?.workflowProof === 'string' ? { workflowProof: payload.workflowProof } : {}),
  };
}

/**
 * Tenta client-side (para deduplicação nos ad managers) e garante server-side.
 * Client-side é best-effort — não bloqueia se ausente/bloqueado.
 */
export function firePixelDual(
  opts: Omit<FirePixelOptions, 'triggerType'> & {
    triggerType?: FirePixelOptions['triggerType'];
    onFired?: (record: PixelEventRecord) => void;
  },
): void {
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
          event_dedup_id: eventId,
          ...(customParams || {}),
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
    } catch (_) {
      // Third-party pixels must never interrupt form submission.
    }
  }

  // 2. Server-side com retry — SEMPRE, independente do client
  void firePixel({ ...opts, firedClient })
    .then(() => {
      opts.onFired?.({
        platform: opts.platform,
        event_name: opts.eventName,
        event_id: opts.eventId,
        trigger_type: opts.triggerType || 'flow_node',
        fired_client: firedClient,
        fired_server: true,
        fired_at: new Date().toISOString(),
        custom_params: opts.customParams,
      });
    })
    .catch((error) => {
      console.error('[pixel-event] delivery failed:', error instanceof Error ? error.message : 'unknown_error');
      opts.onFired?.({
        platform: opts.platform,
        event_name: opts.eventName,
        event_id: opts.eventId,
        trigger_type: opts.triggerType || 'flow_node',
        fired_client: firedClient,
        fired_server: false,
        fired_at: new Date().toISOString(),
        custom_params: opts.customParams,
      });
    });
}

/**
 * Versão BLOQUEANTE do firePixelDual: aguarda o disparo server-side (útil quando o workflow
 * precisa garantir que o nó foi processado antes de avançar).
 */
export async function firePixelDualBlocking(
  opts: Omit<FirePixelOptions, 'triggerType'> & {
    triggerType?: FirePixelOptions['triggerType'];
    onFired?: (record: PixelEventRecord) => void;
  },
): Promise<Record<string, any>> {
  // 1. Client-side (best-effort)
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
          event_dedup_id: eventId,
          ...(customParams || {}),
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
    } catch (_) {
      // Third-party pixels must never interrupt form submission.
    }
  }

  // 2. Server-side com retry — aguardar aqui
  // Workflow analytics are blocking graph nodes. They must reach the server in
  // every environment so the next node receives a signed path proof. Automatic
  // load pixels remain suppressed outside production by `firePixelDual`.
  const payload = await executeWorkflowSideEffect({
    label: 'o evento de analytics',
    nodeId: opts.nodeId,
    baseDelayMs: 800,
    operation: (signal) => callEdgeFunction({ ...opts, firedClient }, signal),
  });
  const analyticsDelivered = payload?.analyticsDelivered !== false;
  opts.onFired?.({
    platform: opts.platform,
    event_name: opts.eventName,
    event_id: opts.eventId,
    trigger_type: opts.triggerType || 'flow_node',
    fired_client: firedClient,
    fired_server: analyticsDelivered,
    fired_at: new Date().toISOString(),
    custom_params: opts.customParams,
  });
  return payload;
}
