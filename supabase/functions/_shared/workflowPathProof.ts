import {
  createSignedState,
  createSignedStateWithSecret,
  verifySignedState,
  verifySignedStateWithSecret,
} from "./signedState.ts";

const PROOF_KIND = "form-workflow-path";
const PROOF_VERSION = 1;

function canonicalize(value: unknown, depth = 0): unknown {
  if (depth > 24) return null;
  if (
    value === null || typeof value === "string" ||
    typeof value === "boolean"
  ) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value.slice(0, 1_000).map((item) => canonicalize(item, depth + 1));
  }
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["__proto__", "prototype", "constructor"].includes(key.toLowerCase()))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 2_000)
      .map(([key, item]) => [key, canonicalize(item, depth + 1)]),
  );
}

export async function workflowAnswersDigest(
  answers: Record<string, unknown>,
): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(canonicalize(answers)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type WorkflowPathProofIdentity = {
  formId: string;
  responseId: string;
  sessionId: string;
  nodeId: string;
  answers: Record<string, unknown>;
  notBefore?: number;
};

export async function createWorkflowPathProof(
  identity: WorkflowPathProofIdentity,
): Promise<string> {
  return await createSignedState(await workflowProofPayload(identity), proofTtl(identity));
}

function proofTtl(identity: WorkflowPathProofIdentity): number {
  const waitSeconds = typeof identity.notBefore === "number"
    ? Math.ceil((identity.notBefore - Date.now()) / 1_000) + 10 * 60
    : 0;
  return Math.max(30 * 60, Math.min(waitSeconds, 25 * 60 * 60));
}

async function workflowProofPayload(identity: WorkflowPathProofIdentity) {
  return {
    kind: PROOF_KIND,
    version: PROOF_VERSION,
    formId: identity.formId,
    responseId: identity.responseId,
    sessionId: identity.sessionId,
    nodeId: identity.nodeId,
    answersDigest: await workflowAnswersDigest(identity.answers),
    ...(typeof identity.notBefore === "number"
      ? { notBefore: Math.max(0, Math.floor(identity.notBefore)) }
      : {}),
  };
}

export async function createWorkflowPathProofWithSecret(
  identity: WorkflowPathProofIdentity,
  secret: string,
): Promise<string> {
  return await createSignedStateWithSecret(
    await workflowProofPayload(identity),
    proofTtl(identity),
    secret,
  );
}

export async function verifyWorkflowPathProof(options: {
  proof: unknown;
  formId: string;
  responseId: string;
  sessionId: string;
  sourceNodeId: string;
  answers: Record<string, unknown>;
  nowMs?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof options.proof !== "string" || options.proof.length > 8_192) {
    return { ok: false, error: "workflow_proof_required" };
  }
  const state = await verifySignedState(options.proof);
  return await validateWorkflowPathProofState(state, options);
}

export async function verifyWorkflowPathProofWithSecret(
  options: {
    proof: unknown;
    formId: string;
    responseId: string;
    sessionId: string;
    sourceNodeId: string;
    answers: Record<string, unknown>;
    nowMs?: number;
  },
  secret: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof options.proof !== "string" || options.proof.length > 8_192) {
    return { ok: false, error: "workflow_proof_required" };
  }
  const state = await verifySignedStateWithSecret(options.proof, secret);
  return await validateWorkflowPathProofState(state, options);
}

async function validateWorkflowPathProofState(
  state: Record<string, unknown> | null,
  options: {
    formId: string;
    responseId: string;
    sessionId: string;
    sourceNodeId: string;
    answers: Record<string, unknown>;
    nowMs?: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    state?.kind !== PROOF_KIND || state.version !== PROOF_VERSION ||
    state.formId !== options.formId || state.responseId !== options.responseId ||
    state.sessionId !== options.sessionId || state.nodeId !== options.sourceNodeId
  ) return { ok: false, error: "workflow_proof_invalid" };
  if (
    typeof state.notBefore === "number" &&
    state.notBefore > (options.nowMs ?? Date.now())
  ) return { ok: false, error: "workflow_wait_not_elapsed" };
  const digest = await workflowAnswersDigest(options.answers);
  if (state.answersDigest !== digest) {
    return { ok: false, error: "workflow_answers_changed" };
  }
  return { ok: true };
}
