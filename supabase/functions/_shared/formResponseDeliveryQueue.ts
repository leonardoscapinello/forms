import type { CompletionDeliveryType } from './completionDeliveries.ts';

export const DELIVERY_LEASE_MS = 45_000;
export const DELIVERY_MAX_ATTEMPTS = 8;
export const DELIVERY_BACKOFF_BASE_MS = 30_000;
export const DELIVERY_BACKOFF_MAX_MS = 60 * 60 * 1_000;

export type DeliveryStatus = 'failed' | 'processing' | 'delivered' | 'dead_letter';

export type DeliveryRow = {
  id: string;
  form_id: string;
  response_id: string;
  delivery_type: CompletionDeliveryType;
  destination_key: string;
  destination: string | null;
  status: DeliveryStatus;
  attempts: number;
  next_attempt_at: string | null;
  lease_until: string | null;
  lease_token: string | null;
};

export type DeliveryClaim =
  | { state: 'claimed'; row: DeliveryRow }
  | { state: 'delivered'; id: string }
  | { state: 'processing'; id: string }
  | { state: 'scheduled'; id: string }
  | { state: 'dead_letter'; id: string };

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/** Equal-jitter exponential backoff. Injecting random makes it deterministic in tests. */
export function calculateDeliveryBackoffMs(
  attempt: number,
  random = Math.random,
  baseMs = DELIVERY_BACKOFF_BASE_MS,
  maxMs = DELIVERY_BACKOFF_MAX_MS,
): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const ceiling = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitter = Math.min(1, Math.max(0, random()));
  return Math.round((ceiling / 2) + (ceiling / 2) * jitter);
}

export function isDeliveryClaimable(
  row: Pick<DeliveryRow, 'status' | 'attempts' | 'next_attempt_at' | 'lease_until'>,
  nowMs: number,
  maxAttempts = DELIVERY_MAX_ATTEMPTS,
): boolean {
  if (row.attempts >= maxAttempts || row.status === 'delivered' || row.status === 'dead_letter') return false;
  if (row.status === 'processing') {
    const leaseUntil = timestamp(row.lease_until);
    return leaseUntil === null || leaseUntil <= nowMs;
  }
  const nextAttemptAt = timestamp(row.next_attempt_at);
  return row.status === 'failed' && (nextAttemptAt === null || nextAttemptAt <= nowMs);
}

export function shouldDeadLetterDelivery(
  attempt: number,
  permanentlyFailed = false,
  maxAttempts = DELIVERY_MAX_ATTEMPTS,
): boolean {
  return permanentlyFailed || attempt >= maxAttempts;
}

export function classifyExistingDeliveryClaim(
  row: Pick<DeliveryRow, 'status' | 'attempts' | 'next_attempt_at' | 'lease_until'>,
  nowMs: number,
  maxAttempts = DELIVERY_MAX_ATTEMPTS,
): 'claimable' | 'delivered' | 'processing' | 'scheduled' | 'dead_letter' {
  if (row.status === 'delivered') return 'delivered';
  if (row.status === 'dead_letter' || row.attempts >= maxAttempts) return 'dead_letter';
  if (isDeliveryClaimable(row, nowMs, maxAttempts)) return 'claimable';
  return row.status === 'processing' ? 'processing' : 'scheduled';
}

export async function deliveryDestinationKey(
  deliveryType: CompletionDeliveryType,
  destination: string,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(destination));
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${deliveryType}:${hash}`;
}

/** Ensure an outbox row exists without claiming or performing external I/O. */
export async function ensureResponseDeliveryQueued(
  supabase: any,
  formId: string,
  responseId: string,
  deliveryType: CompletionDeliveryType,
  destination: string,
): Promise<DeliveryStatus> {
  const destinationKey = await deliveryDestinationKey(deliveryType, destination);
  const now = new Date().toISOString();
  const { error: insertError } = await supabase
    .from('form_response_deliveries')
    .upsert({
      form_id: formId,
      response_id: responseId,
      delivery_type: deliveryType,
      destination_key: destinationKey,
      destination,
      status: 'failed',
      attempts: 0,
      next_attempt_at: now,
    }, {
      onConflict: 'form_id,response_id,destination_key',
      ignoreDuplicates: true,
    });
  if (insertError) {
    throw new Error(`delivery_enqueue_failed:${insertError.message}`);
  }

  const { data, error } = await supabase
    .from('form_response_deliveries')
    .select('status')
    .eq('form_id', formId)
    .eq('response_id', responseId)
    .eq('destination_key', destinationKey)
    .single();
  if (error || !data) throw new Error(`delivery_enqueue_verify_failed:${error?.message || 'not_found'}`);
  return data.status as DeliveryStatus;
}

function newLease(nowMs: number, leaseMs: number) {
  return {
    leaseToken: crypto.randomUUID(),
    leaseUntil: new Date(nowMs + leaseMs).toISOString(),
  };
}

export async function claimResponseDelivery(
  supabase: any,
  formId: string,
  responseId: string,
  deliveryType: CompletionDeliveryType,
  destination: string,
  options: {
    nowMs?: number;
    leaseMs?: number;
    maxAttempts?: number;
  } = {},
): Promise<DeliveryClaim> {
  const nowMs = options.nowMs ?? Date.now();
  const leaseMs = options.leaseMs ?? DELIVERY_LEASE_MS;
  const maxAttempts = options.maxAttempts ?? DELIVERY_MAX_ATTEMPTS;
  const now = new Date(nowMs).toISOString();
  const destinationKey = await deliveryDestinationKey(deliveryType, destination);
  const lease = newLease(nowMs, leaseMs);

  const initialRow = {
    form_id: formId,
    response_id: responseId,
    delivery_type: deliveryType,
    destination_key: destinationKey,
    destination,
    status: 'processing',
    attempts: 1,
    next_attempt_at: now,
    claimed_at: now,
    last_attempt_at: now,
    lease_until: lease.leaseUntil,
    lease_token: lease.leaseToken,
  };
  const { data: inserted, error: insertError } = await supabase
    .from('form_response_deliveries')
    .insert(initialRow)
    .select('id, form_id, response_id, delivery_type, destination_key, destination, status, attempts, next_attempt_at, lease_until, lease_token')
    .maybeSingle();
  if (!insertError && inserted?.id) return { state: 'claimed', row: inserted as DeliveryRow };
  if (insertError?.code !== '23505') {
    throw new Error(`delivery_claim_failed:${insertError?.message || 'unknown_error'}`);
  }

  const { data: existing, error: selectError } = await supabase
    .from('form_response_deliveries')
    .select('id, form_id, response_id, delivery_type, destination_key, destination, status, attempts, next_attempt_at, lease_until, lease_token')
    .eq('form_id', formId)
    .eq('response_id', responseId)
    .eq('destination_key', destinationKey)
    .single();
  if (selectError || !existing) {
    throw new Error(`delivery_lookup_failed:${selectError?.message || 'not_found'}`);
  }
  const row = existing as DeliveryRow;
  const classification = classifyExistingDeliveryClaim(row, nowMs, maxAttempts);
  if (classification !== 'claimable') return { state: classification, id: row.id };

  const reclaimedLease = newLease(nowMs, leaseMs);
  let reclaim = supabase
    .from('form_response_deliveries')
    .update({
      destination: row.destination || destination,
      status: 'processing',
      attempts: Number(row.attempts || 0) + 1,
      claimed_at: now,
      last_attempt_at: now,
      lease_until: reclaimedLease.leaseUntil,
      lease_token: reclaimedLease.leaseToken,
      updated_at: now,
    })
    .eq('id', row.id)
    .eq('status', row.status)
    .eq('attempts', row.attempts);
  reclaim = row.lease_token ? reclaim.eq('lease_token', row.lease_token) : reclaim.is('lease_token', null);

  const { data: reclaimed, error: reclaimError } = await reclaim
    .select('id, form_id, response_id, delivery_type, destination_key, destination, status, attempts, next_attempt_at, lease_until, lease_token')
    .maybeSingle();
  if (reclaimError) throw new Error(`delivery_reclaim_failed:${reclaimError.message}`);
  return reclaimed?.id
    ? { state: 'claimed', row: reclaimed as DeliveryRow }
    : { state: 'processing', id: row.id };
}

export async function markResponseDeliveryDelivered(supabase: any, row: DeliveryRow): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('form_response_deliveries')
    .update({
      status: 'delivered',
      delivered_at: now,
      lease_until: null,
      lease_token: null,
      next_attempt_at: null,
      last_error: null,
      updated_at: now,
    })
    .eq('id', row.id)
    .eq('status', 'processing')
    .eq('lease_token', row.lease_token)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    throw new Error(`delivery_mark_delivered_failed:${error?.message || 'claim_lost'}`);
  }
}

export async function markResponseDeliveryFailed(
  supabase: any,
  row: DeliveryRow,
  failure: unknown,
  options: {
    nowMs?: number;
    permanentlyFailed?: boolean;
    random?: () => number;
    maxAttempts?: number;
  } = {},
): Promise<'failed' | 'dead_letter'> {
  const nowMs = options.nowMs ?? Date.now();
  const maxAttempts = options.maxAttempts ?? DELIVERY_MAX_ATTEMPTS;
  const deadLetter = shouldDeadLetterDelivery(row.attempts, options.permanentlyFailed, maxAttempts);
  const message = (failure instanceof Error ? failure.message : String(failure)).slice(0, 1_000);
  const nextAttemptAt = deadLetter
    ? null
    : new Date(nowMs + calculateDeliveryBackoffMs(row.attempts, options.random)).toISOString();
  const now = new Date(nowMs).toISOString();
  const { data, error } = await supabase
    .from('form_response_deliveries')
    .update({
      status: deadLetter ? 'dead_letter' : 'failed',
      lease_until: null,
      lease_token: null,
      next_attempt_at: nextAttemptAt,
      dead_lettered_at: deadLetter ? now : null,
      last_error: message,
      updated_at: now,
    })
    .eq('id', row.id)
    .eq('status', 'processing')
    .eq('lease_token', row.lease_token)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`delivery_mark_failed_error:${error.message}`);
  if (!data) throw new Error('delivery_mark_failed_error:claim_lost');
  return deadLetter ? 'dead_letter' : 'failed';
}

export async function runClaimedResponseDelivery(
  supabase: any,
  row: DeliveryRow,
  deliver: () => Promise<void>,
): Promise<'delivered'> {
  try {
    await deliver();
    await markResponseDeliveryDelivered(supabase, row);
    return 'delivered';
  } catch (error) {
    await markResponseDeliveryFailed(supabase, row, error);
    throw error;
  }
}

export async function runResponseDeliveryOnce(
  supabase: any,
  formId: string,
  responseId: string,
  deliveryType: CompletionDeliveryType,
  destination: string,
  deliver: () => Promise<void>,
): Promise<'delivered' | 'deduplicated'> {
  const claim = await claimResponseDelivery(
    supabase,
    formId,
    responseId,
    deliveryType,
    destination,
  );
  if (claim.state === 'delivered') return 'deduplicated';
  if (claim.state !== 'claimed') throw new Error(`${deliveryType}_delivery_${claim.state}`);
  return runClaimedResponseDelivery(supabase, claim.row, deliver);
}
