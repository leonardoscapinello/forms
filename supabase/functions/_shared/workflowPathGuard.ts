import {
  evaluateAuthorizedWorkflowPath,
  type WorkflowPathTargetKind,
} from "./workflowPathAuthorization.ts";
import {
  createWorkflowPathProof,
  verifyWorkflowPathProof,
} from "./workflowPathProof.ts";

export type PublicSubmissionIdentity = {
  formId: string;
  responseId: string;
  sessionId: string;
};

export type AuthorizedWorkflowTarget = {
  formId: string;
  responseId: string;
  sessionId: string;
  nodeId: string;
  answers: Record<string, unknown>;
};

export type WorkflowTargetAuthorization =
  | { ok: true; authorization: AuthorizedWorkflowTarget }
  | { ok: false; error: string; status: number };

async function validateInitialCheckpoint(options: {
  admin: any;
  formData: Record<string, unknown>;
  identity: PublicSubmissionIdentity;
  sourceNodeId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, formData, identity, sourceNodeId } = options;
  if (sourceNodeId !== "start" && !sourceNodeId.startsWith("p-")) {
    return { ok: false, error: "workflow_proof_required" };
  }
  const { data: session, error } = await admin.from("form_sessions")
    .select("status, current_page_index, pages_visited")
    .eq("id", identity.sessionId)
    .eq("form_id", identity.formId)
    .eq("response_id", identity.responseId)
    .maybeSingle();
  if (error) return { ok: false, error: "workflow_session_lookup_failed" };

  // Start-node effects can legitimately run before the deferred session insert.
  if (sourceNodeId === "start") {
    if (!session) return { ok: true };
    if (session.status === "completed") {
      return { ok: false, error: "workflow_session_completed" };
    }
    return Number(session.pages_visited || 0) <= 0
      ? { ok: true }
      : { ok: false, error: "workflow_source_mismatch" };
  }
  if (!session) return { ok: false, error: "workflow_session_not_ready" };
  if (session.status === "completed") {
    return { ok: false, error: "workflow_session_completed" };
  }
  const pageId = sourceNodeId.slice(2);
  const pages = Array.isArray(formData.pages) ? formData.pages : [];
  const pageIndex = pages.findIndex((page) =>
    !!page && typeof page === "object" &&
    String((page as Record<string, unknown>).id || "") === pageId
  );
  return pageIndex >= 0 && Number(session.current_page_index) === pageIndex
    ? { ok: true }
    : { ok: false, error: "workflow_source_mismatch" };
}

/** Authorizes a public workflow node before any claim, quota, or provider I/O. */
export async function authorizePublicWorkflowTarget(options: {
  admin: any;
  formData: Record<string, unknown>;
  identity: PublicSubmissionIdentity | null;
  sourceNodeId: unknown;
  proof: unknown;
  targetNodeId: string;
  targetKind?: WorkflowPathTargetKind;
  answers: Record<string, unknown>;
}): Promise<WorkflowTargetAuthorization> {
  const identity = options.identity;
  if (!identity) return { ok: false, status: 403, error: "workflow_identity_missing" };
  if (
    typeof options.sourceNodeId !== "string" ||
    options.sourceNodeId.length > 256
  ) return { ok: false, status: 403, error: "workflow_source_required" };

  if (options.proof !== undefined && options.proof !== null && options.proof !== "") {
    const proof = await verifyWorkflowPathProof({
      proof: options.proof,
      formId: identity.formId,
      responseId: identity.responseId,
      sessionId: identity.sessionId,
      sourceNodeId: options.sourceNodeId,
      answers: options.answers,
    });
    if (!proof.ok) return { ok: false, status: 403, error: proof.error };
  } else {
    const checkpoint = await validateInitialCheckpoint({
      admin: options.admin,
      formData: options.formData,
      identity,
      sourceNodeId: options.sourceNodeId,
    });
    if (!checkpoint.ok) {
      return { ok: false, status: 403, error: checkpoint.error };
    }
  }

  const path = evaluateAuthorizedWorkflowPath({
    formData: options.formData,
    responseId: identity.responseId,
    sourceNodeId: options.sourceNodeId,
    targetNodeId: options.targetNodeId,
    targetKind: options.targetKind ?? "side_effect",
    answers: options.answers,
  });
  if (!path.ok) return { ok: false, status: 403, error: path.error };
  return {
    ok: true,
    authorization: {
      ...identity,
      nodeId: options.targetNodeId,
      answers: path.answers,
    },
  };
}

export async function issueWorkflowPathProof(
  authorization: AuthorizedWorkflowTarget,
  answers: Record<string, unknown> = authorization.answers,
  notBefore?: number,
): Promise<string> {
  return await createWorkflowPathProof({
    formId: authorization.formId,
    responseId: authorization.responseId,
    sessionId: authorization.sessionId,
    nodeId: authorization.nodeId,
    answers,
    notBefore,
  });
}

function getNestedValue(value: unknown, path: string): unknown {
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  if (segments.some((segment) =>
    ["__proto__", "prototype", "constructor"].includes(segment.toLowerCase())
  )) return undefined;
  return segments.reduce<unknown>((current, segment) =>
    current && typeof current === "object"
      ? (current as Record<string, unknown>)[segment]
      : undefined, value);
}

export function applyWebhookWorkflowOutput(options: {
  authorization: AuthorizedWorkflowTarget;
  formData: Record<string, unknown>;
  rawNodeId: string;
  responseBody: unknown;
}): Record<string, unknown> {
  const updated = {
    ...options.authorization.answers,
    [`__webhook_${options.rawNodeId}`]: options.responseBody,
  };
  const nodes = Array.isArray(options.formData.integrationNodes)
    ? options.formData.integrationNodes
    : [];
  const node = nodes.find((candidate) =>
    !!candidate && typeof candidate === "object" &&
    (candidate as Record<string, unknown>).id === options.rawNodeId
  ) as Record<string, unknown> | undefined;
  const variables = Array.isArray(options.formData.variables)
    ? options.formData.variables
    : [];
  for (const mapping of Array.isArray(node?.responseMappings)
    ? node.responseMappings
    : []) {
    if (!mapping || typeof mapping !== "object") continue;
    const record = mapping as Record<string, unknown>;
    if (
      typeof record.responsePath !== "string" ||
      typeof record.variableId !== "string"
    ) continue;
    const value = getNestedValue(options.responseBody, record.responsePath);
    if (value === undefined) continue;
    const variable = variables.find((candidate) =>
      !!candidate && typeof candidate === "object" &&
      (candidate as Record<string, unknown>).id === record.variableId
    ) as Record<string, unknown> | undefined;
    const name = typeof variable?.name === "string"
      ? variable.name
      : record.variableId;
    updated[`__var_${name}`] = value;
  }
  return updated;
}

export function applyAiWorkflowOutput(options: {
  authorization: AuthorizedWorkflowTarget;
  formData: Record<string, unknown>;
  rawNodeId: string;
  result: unknown;
}): Record<string, unknown> {
  const updated = { ...options.authorization.answers };
  const nodes = Array.isArray(options.formData.aiNodes)
    ? options.formData.aiNodes
    : [];
  const node = nodes.find((candidate) =>
    !!candidate && typeof candidate === "object" &&
    (candidate as Record<string, unknown>).id === options.rawNodeId
  ) as Record<string, unknown> | undefined;
  if (typeof node?.outputVariableId !== "string") return updated;
  const variables = Array.isArray(options.formData.variables)
    ? options.formData.variables
    : [];
  const variable = variables.find((candidate) =>
    !!candidate && typeof candidate === "object" &&
    (candidate as Record<string, unknown>).id === node.outputVariableId
  ) as Record<string, unknown> | undefined;
  if (typeof variable?.name === "string" && variable.name) {
    updated[`__var_${variable.name}`] = options.result ?? "";
  }
  return updated;
}
