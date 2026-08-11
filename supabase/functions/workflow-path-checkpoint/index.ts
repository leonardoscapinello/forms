import { getPublicFormContext } from "../_shared/publicFormAuth.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { validateFormSubmission } from "../_shared/formSubmissionValidation.ts";
import { enforcePublicSubmissionRateLimits } from "../_shared/rateLimit.ts";
import {
  authorizePublicWorkflowTarget,
  issueWorkflowPathProof,
} from "../_shared/workflowPathGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, error: "method_not_allowed" });

  const parsed = await readLimitedJsonObject(req, 250_000, corsHeaders);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const context = await getPublicFormContext(
    req,
    body.formId,
    body.submissionToken,
    body.responseId,
  );
  if (!context.ok) return context.response;
  if (!context.submissionState) {
    return json(403, { success: false, error: "workflow_identity_missing" });
  }
  const validation = validateFormSubmission(
    context.formData,
    body.answers,
    {},
    { completion: false },
  );
  if (!validation.ok) return json(422, { success: false, error: "invalid_answers" });
  const targetNodeId = typeof body.targetNodeId === "string"
    ? body.targetNodeId
    : "";
  const targetKind = targetNodeId.startsWith("wt-")
    ? "wait"
    : targetNodeId.startsWith("p-")
    ? "page"
    : null;
  if (!targetKind) {
    return json(400, { success: false, error: "invalid_checkpoint_target" });
  }
  const authorization = await authorizePublicWorkflowTarget({
    admin: context.admin,
    formData: context.formData,
    identity: context.submissionState,
    sourceNodeId: body.workflowSourceNodeId,
    proof: body.workflowProof,
    targetNodeId,
    targetKind,
    answers: validation.answers,
  });
  if (!authorization.ok) {
    return json(authorization.status, { success: false, error: authorization.error });
  }
  const limited = await enforcePublicSubmissionRateLimits(
    context.admin,
    req,
    {
      bucket: "workflow-path-checkpoint",
      formId: context.submissionState.formId,
      responseId: context.submissionState.responseId,
      ipFormLimit: 10_000,
      formGlobalLimit: 50_000,
      responseLimit: 200,
      responseWindowSeconds: 30 * 60,
      serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      responseHeaders: corsHeaders,
    },
  );
  if (limited) return limited;

  let notBefore: number | undefined;
  if (targetKind === "wait") {
    const rawId = targetNodeId.slice(3);
    const wait = (Array.isArray(context.formData.waitNodes)
      ? context.formData.waitNodes
      : []).find((node: any) => node?.id === rawId);
    if (!wait) return json(403, { success: false, error: "workflow_wait_missing" });
    const multiplier = wait.unit === "hours"
      ? 3_600_000
      : wait.unit === "minutes"
      ? 60_000
      : 1_000;
    const durationMs = Math.max(0, Math.min(
      Number(wait.duration || 0) * multiplier,
      24 * 60 * 60 * 1_000,
    ));
    // A configured skip is itself a legitimate immediate route.
    notBefore = Date.now() + (wait.feedback?.allowSkip === true ? 0 : durationMs);
  }
  const workflowProof = await issueWorkflowPathProof(
    authorization.authorization,
    authorization.authorization.answers,
    notBefore,
  );
  return json(200, { success: true, workflowProof });
});
