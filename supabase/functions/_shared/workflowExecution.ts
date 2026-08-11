const EXECUTION_LEASE_MS = 120_000;

export type WorkflowExecutionLease = {
  id: string;
  leaseUntil: string;
};

export type WorkflowExecutionClaim =
  | ({ state: 'claimed' } & WorkflowExecutionLease)
  | { state: 'delivered'; id: string; result: unknown }
  | { state: 'processing'; id: string };

export type WorkflowExecutionRecord = {
  status: string;
  lease_until?: string | null;
};

export type WorkflowExecutionNodeIdentity = {
  kind: 'ai' | 'email' | 'whatsapp' | 'webhook' | 'pixel-load' | 'analytics';
  nodeId: string;
  platform?: string;
  entryId?: string;
};

export type WorkflowExecutionGateResult<TLimited> =
  | { state: 'ready'; claim: WorkflowExecutionLease | null }
  | { state: 'delivered'; id: string; result: unknown }
  | { state: 'processing'; id: string }
  | { state: 'limited'; response: TLimited };

type WorkflowExecutionGateOptions<TLimited> = {
  enforceFireOnce: boolean;
  claimExecution: () => Promise<WorkflowExecutionClaim>;
  enforceLimits: () => Promise<TLimited | null>;
  releaseClaim: (claim: WorkflowExecutionLease, reason: string) => Promise<unknown>;
};

/**
 * Guarantees the ordering required by external side effects: claim first,
 * short-circuit delivered/processing retries, and only then consume quota.
 * A newly acquired claim is released when quota denies the attempt so the
 * caller is not left behind a two-minute processing lease.
 */
export async function acquireWorkflowExecutionGate<TLimited>({
  enforceFireOnce,
  claimExecution,
  enforceLimits,
  releaseClaim,
}: WorkflowExecutionGateOptions<TLimited>): Promise<WorkflowExecutionGateResult<TLimited>> {
  let claim: WorkflowExecutionLease | null = null;
  if (enforceFireOnce) {
    const disposition = await claimExecution();
    if (disposition.state === 'delivered') return disposition;
    if (disposition.state === 'processing') return disposition;
    claim = disposition;
  }

  const limited = await enforceLimits();
  if (limited !== null) {
    if (claim) {
      try {
        await releaseClaim(claim, 'workflow_rate_limited');
      } catch (error) {
        console.error(
          'workflow_execution_rate_limit_release_failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return { state: 'limited', response: limited };
  }

  return { state: 'ready', claim };
}

function keyPart(value: string | undefined): string {
  return value === undefined ? 'missing' : `value:${encodeURIComponent(value)}`;
}

/**
 * Produces an unambiguous identity for a side-effecting node. Analytics entries
 * deliberately include both their platform and entry id because one analytics
 * node can fan out to multiple destinations.
 */
export function buildWorkflowExecutionNodeKey(identity: WorkflowExecutionNodeIdentity): string {
  return [
    `kind=${keyPart(identity.kind)}`,
    `node=${keyPart(identity.nodeId)}`,
    `platform=${keyPart(identity.platform)}`,
    `entry=${keyPart(identity.entryId)}`,
  ].join('&');
}

export function getWorkflowExecutionDisposition(
  existing: WorkflowExecutionRecord,
  nowMs = Date.now(),
): 'delivered' | 'processing' | 'reclaim' {
  if (existing.status === 'delivered') return 'delivered';
  const leaseTime = existing.lease_until ? Date.parse(existing.lease_until) : Number.NaN;
  if (existing.status === 'processing' && Number.isFinite(leaseTime) && leaseTime > nowMs) {
    return 'processing';
  }
  return 'reclaim';
}

export async function claimWorkflowExecution(
  supabase: any,
  formId: string,
  responseId: string,
  nodeKey: string,
): Promise<WorkflowExecutionClaim> {
  const nowMs = Date.now();
  const leaseUntil = new Date(nowMs + EXECUTION_LEASE_MS).toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from('form_workflow_executions')
    .insert({
      form_id: formId,
      response_id: responseId,
      node_key: nodeKey,
      status: 'processing',
      attempts: 1,
      lease_until: leaseUntil,
    })
    .select('id')
    .maybeSingle();

  if (!insertError && inserted?.id) {
    return { state: 'claimed', id: inserted.id, leaseUntil };
  }
  if (insertError?.code !== '23505') {
    throw new Error(`workflow_execution_claim_failed:${insertError?.message || 'unknown_error'}`);
  }

  const { data: existing, error: lookupError } = await supabase
    .from('form_workflow_executions')
    .select('id, status, attempts, lease_until, result')
    .eq('form_id', formId)
    .eq('response_id', responseId)
    .eq('node_key', nodeKey)
    .single();
  if (lookupError || !existing) throw new Error('workflow_execution_lookup_failed');

  const disposition = getWorkflowExecutionDisposition(existing, nowMs);
  if (disposition === 'delivered') {
    return { state: 'delivered', id: existing.id, result: existing.result ?? null };
  }
  if (disposition === 'processing') {
    return { state: 'processing', id: existing.id };
  }

  let reclaim = supabase
    .from('form_workflow_executions')
    .update({
      status: 'processing',
      attempts: Number(existing.attempts || 0) + 1,
      lease_until: leaseUntil,
      completed_at: null,
      last_error: null,
      result: null,
      updated_at: new Date(nowMs).toISOString(),
    })
    .eq('id', existing.id)
    .eq('status', existing.status);
  reclaim = existing.lease_until
    ? reclaim.eq('lease_until', existing.lease_until)
    : reclaim.is('lease_until', null);
  const { data: reclaimed, error: reclaimError } = await reclaim.select('id').maybeSingle();
  if (reclaimError) throw new Error('workflow_execution_reclaim_failed');
  return reclaimed?.id
    ? { state: 'claimed', id: reclaimed.id, leaseUntil }
    : { state: 'processing', id: existing.id };
}

export async function completeWorkflowExecution(
  supabase: any,
  claim: WorkflowExecutionLease,
  result: unknown = null,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('form_workflow_executions')
    .update({
      status: 'delivered',
      completed_at: now,
      lease_until: null,
      last_error: null,
      result: result === undefined ? null : result,
      updated_at: now,
    })
    .eq('id', claim.id)
    .eq('status', 'processing')
    .eq('lease_until', claim.leaseUntil)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`workflow_execution_complete_failed:${error.message}`);
  if (!data?.id) throw new Error('workflow_execution_claim_lost');
}

export async function failWorkflowExecution(
  supabase: any,
  claim: WorkflowExecutionLease,
  error: unknown,
): Promise<boolean> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  try {
    const { data, error: updateError } = await supabase
      .from('form_workflow_executions')
      .update({
        status: 'failed',
        lease_until: null,
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claim.id)
      .eq('status', 'processing')
      .eq('lease_until', claim.leaseUntil)
      .select('id')
      .maybeSingle();
    if (updateError) {
      console.error('workflow_execution_fail_update_error', updateError.message);
      return false;
    }
    return !!data?.id;
  } catch (updateError) {
    console.error(
      'workflow_execution_fail_update_error',
      updateError instanceof Error ? updateError.message : String(updateError),
    );
    return false;
  }
}
