import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceWorkflowNodeRateLimits } from "../_shared/rateLimit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import {
  getPublicFormContext,
  interpolateFormHtml,
  interpolateFormText,
  isServiceRequest,
} from "../_shared/publicFormAuth.ts";
import {
  acquireWorkflowExecutionGate,
  buildWorkflowExecutionNodeKey,
  claimWorkflowExecution,
  completeWorkflowExecution,
  failWorkflowExecution,
} from "../_shared/workflowExecution.ts";
import type { WorkflowExecutionLease } from "../_shared/workflowExecution.ts";
import {
  extractResendEmailId,
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { validateFormSubmission } from "../_shared/formSubmissionValidation.ts";
import { isWorkflowNodeDisabled } from "../_shared/workflowNodeAuthorization.ts";
import {
  authorizePublicWorkflowTarget,
  issueWorkflowPathProof,
} from "../_shared/workflowPathGuard.ts";
import type { AuthorizedWorkflowTarget } from "../_shared/workflowPathGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 250_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "method_not_allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let executionAdmin: any = null;
  let executionClaim: WorkflowExecutionLease | null = null;
  try {
    const parsedBody = await readLimitedJsonObject(
      req,
      MAX_REQUEST_BYTES,
      corsHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value as Record<string, any>;
    let {
      instanceId,
      fromEmail,
      fromName,
      toEmail,
      subject,
      bodyText,
      bodyHtml,
      useHtml,
    } = body;
    const testMode = body.testMode === true;
    let enforceFireOnce = false;
    let executionNodeKey = "";
    let workflowAuthorization: AuthorizedWorkflowTarget | null = null;

    if (testMode) {
      const caller = await requireAdmin(req);
      if (!caller.ok) return caller.response;
    } else if (!isServiceRequest(req)) {
      const context = await getPublicFormContext(
        req,
        body.formId,
        body.submissionToken,
        body.responseId,
      );
      if (!context.ok) return context.response;
      const node = (context.formData.emailNodes || []).find((item: any) =>
        item.id === body.nodeId
      );
      if (
        !node?.instanceId || !node.toEmail ||
        isWorkflowNodeDisabled(context.formData, body.nodeId, "em")
      ) {
        return new Response(
          JSON.stringify({ success: false, error: "email_node_not_allowed" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const validation = validateFormSubmission(
        context.formData,
        body.answers,
        {},
        { completion: false },
      );
      if (!validation.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "invalid_answers" }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const pathAuthorization = await authorizePublicWorkflowTarget({
        admin: context.admin,
        formData: context.formData,
        identity: context.submissionState,
        sourceNodeId: body.workflowSourceNodeId,
        proof: body.workflowProof,
        targetNodeId: `em-${node.id}`,
        answers: validation.answers,
      });
      if (!pathAuthorization.ok) {
        return new Response(
          JSON.stringify({ success: false, error: pathAuthorization.error }),
          {
            status: pathAuthorization.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      workflowAuthorization = pathAuthorization.authorization;
      const answers = workflowAuthorization.answers;
      const variables = context.formData.variables || [];
      instanceId = node.instanceId;
      fromEmail = interpolateFormText(node.fromEmail, answers, variables);
      fromName = interpolateFormText(node.fromName, answers, variables);
      toEmail = interpolateFormText(node.toEmail, answers, variables);
      subject = interpolateFormText(node.subject, answers, variables);
      bodyText = interpolateFormText(node.bodyText, answers, variables);
      bodyHtml = interpolateFormHtml(node.bodyHtml, answers, variables);
      useHtml = node.useHtml === true;
      enforceFireOnce = node.fireOnce !== false;
      executionNodeKey = buildWorkflowExecutionNodeKey({
        kind: "email",
        nodeId: node.id,
      });
    }
    useHtml = useHtml === true;

    if (
      !instanceId || typeof instanceId !== "string" ||
      !UUID_PATTERN.test(instanceId) || !toEmail || typeof toEmail !== "string"
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "instanceId and toEmail are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail) || toEmail.length > 254) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid recipient email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (
      (subject != null && typeof subject !== "string") ||
      (bodyText != null && typeof bodyText !== "string") ||
      (bodyHtml != null && typeof bodyHtml !== "string") ||
      (typeof subject === "string" && subject.length > 998) ||
      (typeof bodyText === "string" && bodyText.length > 100_000) ||
      (typeof bodyHtml === "string" && bodyHtml.length > 100_000)
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Email content is too large" }),
        {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (
      (fromEmail &&
        (typeof fromEmail !== "string" || fromEmail.length > 254 ||
          !emailRegex.test(fromEmail))) ||
      (fromName &&
        (typeof fromName !== "string" || fromName.length > 200 ||
          /[\r\n]/.test(fromName)))
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid sender identity" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch instance config from integration_settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    executionAdmin = supabase;
    const { data: setting, error: settingErr } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("id", instanceId)
      .eq("integration_type", "resend")
      .single();

    if (settingErr || !setting) {
      return new Response(
        JSON.stringify({ success: false, error: "Resend instance not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!setting.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Resend instance is disabled",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const config = (await openIntegrationConfig(
      "resend",
      setting.config,
      Deno.env.get("ENCRYPTION_SECRET") ?? "",
    )).config;
    const apiKey = config.apiKey;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Resend API key not configured",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const executionGate = await acquireWorkflowExecutionGate({
      enforceFireOnce,
      claimExecution: () =>
        claimWorkflowExecution(
          supabase,
          body.formId,
          body.responseId,
          executionNodeKey,
        ),
      enforceLimits: () =>
        enforceWorkflowNodeRateLimits(supabase, req, {
          bucket: "resend-send",
          globalScope: instanceId,
          globalLimit: 180,
          formId: typeof body.formId === "string" ? body.formId : "",
          responseId: typeof body.responseId === "string"
            ? body.responseId
            : "",
          nodeKey: executionNodeKey,
          serviceRoleKey: supabaseKey,
          responseHeaders: corsHeaders,
        }),
      releaseClaim: (claim, reason) =>
        failWorkflowExecution(
          supabase,
          claim,
          reason,
        ),
    });
    if (executionGate.state === "delivered") {
      const workflowProof = workflowAuthorization
        ? await issueWorkflowPathProof(workflowAuthorization)
        : undefined;
      return new Response(
        JSON.stringify({
          success: true,
          deduplicated: true,
          data: executionGate.result,
          ...(workflowProof ? { workflowProof } : {}),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (executionGate.state === "processing") {
      return new Response(
        JSON.stringify({ success: true, processing: true }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (executionGate.state === "limited") return executionGate.response;
    executionClaim = executionGate.claim;

    // Build the Resend API payload
    const configuredFrom = typeof config.defaultFrom === "string"
      ? config.defaultFrom.trim()
      : "";
    const effectiveFromEmail = fromEmail || configuredFrom ||
      "onboarding@resend.dev";
    if (
      effectiveFromEmail.length > 254 || !emailRegex.test(effectiveFromEmail)
    ) {
      if (executionClaim) {
        await failWorkflowExecution(
          supabase,
          executionClaim,
          "resend_sender_invalid",
        );
        executionClaim = null;
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: "Resend sender is not configured correctly",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const from = fromName
      ? `${fromName} <${effectiveFromEmail}>`
      : effectiveFromEmail;

    const emailPayload: Record<string, any> = {
      from,
      to: [toEmail],
      subject: subject || "(sem assunto)",
    };

    if (useHtml && bodyHtml) {
      emailPayload.html = bodyHtml;
    } else {
      emailPayload.text = bodyText || "";
    }

    const hasStableDeliveryIdentity = typeof body.formId === "string" &&
      body.formId &&
      typeof body.responseId === "string" && body.responseId &&
      typeof body.nodeId === "string" && body.nodeId;
    const idempotencyKey = !testMode && hasStableDeliveryIdentity
      ? `forms-${body.formId.slice(0, 36)}-${body.responseId.slice(0, 36)}-${
        body.nodeId.slice(0, 80)
      }`
      : `forms-${testMode ? "test" : "delivery"}-${crypto.randomUUID()}`;

    // Send via Resend API
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(emailPayload),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });

    const resData = await readResponseJsonLimited(res, 100_000).catch(() =>
      null
    );
    const emailId = res.ok ? extractResendEmailId(resData) : null;
    const acknowledged = res.ok && emailId !== null;

    if (executionClaim) {
      if (acknowledged) {
        await completeWorkflowExecution(supabase, executionClaim, {
          id: emailId,
        });
      } else {
        await failWorkflowExecution(
          supabase,
          executionClaim,
          res.ok ? "resend_ack_missing" : `resend_failed:${res.status}`,
        );
      }
      executionClaim = null;
    }

    const workflowProof = acknowledged && workflowAuthorization
      ? await issueWorkflowPathProof(workflowAuthorization)
      : undefined;
    return new Response(
      JSON.stringify({
        success: acknowledged,
        ...(workflowProof ? { workflowProof } : {}),
        ...(emailId ? { data: { id: emailId } } : {
          error: res.ok ? "resend_ack_missing" : "resend_delivery_failed",
        }),
      }),
      {
        status: acknowledged ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const errorCode = safeIntegrationErrorCode(err, "resend_internal_error");
    if (executionAdmin && executionClaim) {
      await failWorkflowExecution(executionAdmin, executionClaim, errorCode);
    }
    console.error("resend_send_error", errorCode);
    return new Response(JSON.stringify({ success: false, error: errorCode }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
