import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceWorkflowNodeRateLimits } from "../_shared/rateLimit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import {
  getPublicFormContext,
  interpolateFormText,
  isServiceRequest,
} from "../_shared/publicFormAuth.ts";
import {
  fetchPublicHttps,
  validatePublicHttpsUrl,
} from "../_shared/outboundHttp.ts";
import {
  acquireWorkflowExecutionGate,
  buildWorkflowExecutionNodeKey,
  claimWorkflowExecution,
  completeWorkflowExecution,
  failWorkflowExecution,
} from "../_shared/workflowExecution.ts";
import type { WorkflowExecutionLease } from "../_shared/workflowExecution.ts";
import {
  extractEvolutionMessageAck,
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
const MAX_REQUEST_BYTES = 50_000;

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
      recipientNumber,
      messageText,
      mediaUrl,
      mediaType,
      mediaFileName,
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
      const node = (context.formData.whatsappNodes || []).find((item: any) =>
        item.id === body.nodeId
      );
      if (
        !node?.instanceId || !node.recipientNumber ||
        isWorkflowNodeDisabled(context.formData, body.nodeId, "wa")
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "whatsapp_node_not_allowed",
          }),
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
        targetNodeId: `wa-${node.id}`,
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
      recipientNumber = interpolateFormText(
        node.recipientNumber,
        answers,
        variables,
      );
      messageText = interpolateFormText(node.messageText, answers, variables);
      mediaUrl = node.sendMedia
        ? interpolateFormText(node.mediaUrl, answers, variables)
        : undefined;
      mediaType = node.sendMedia ? node.mediaType : undefined;
      mediaFileName = node.sendMedia
        ? interpolateFormText(node.mediaFileName, answers, variables)
        : undefined;
      enforceFireOnce = node.fireOnce !== false;
      executionNodeKey = buildWorkflowExecutionNodeKey({
        kind: "whatsapp",
        nodeId: node.id,
      });
    }

    if (
      !instanceId || typeof instanceId !== "string" ||
      !UUID_PATTERN.test(instanceId) || !recipientNumber ||
      typeof recipientNumber !== "string"
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "instanceId and recipientNumber are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate phone number format (digits, +, spaces, dashes, parens only, max 20 chars)
    if (!/^[\d\s\-\+\(\)]{5,20}$/.test(recipientNumber)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid phone number format",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate optional text fields
    if (
      messageText !== undefined &&
      (typeof messageText !== "string" || messageText.length > 10_000)
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid message text" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (mediaUrl !== undefined && typeof mediaUrl !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid media URL" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (typeof mediaUrl === "string" && mediaUrl) {
      try {
        await validatePublicHttpsUrl(mediaUrl, { maxUrlLength: 4_096 });
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid media URL" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    if (
      mediaType !== undefined &&
      !["image", "video", "audio", "document"].includes(mediaType)
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid media type" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (
      mediaFileName !== undefined &&
      (typeof mediaFileName !== "string" || mediaFileName.length > 240 ||
        /[\r\n/\\]/.test(mediaFileName))
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid media file name" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Normalize and validate before acquiring an execution lease. A malformed
    // recipient must not leave a public retry reporting `processing`.
    const cleanNumber = recipientNumber.replace(/[\s\-\+\(\)]/g, "");
    if (!/^\d{5,15}$/.test(cleanNumber)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid phone number format",
        }),
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
      .eq("integration_type", "evolution_api")
      .single();

    if (settingErr || !setting) {
      return new Response(
        JSON.stringify({ success: false, error: "Instance not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!setting.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Instance is disabled" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const config = (await openIntegrationConfig(
      "evolution_api",
      setting.config,
      Deno.env.get("ENCRYPTION_SECRET") ?? "",
    )).config;
    const apiUrl = typeof config.apiUrl === "string" ? config.apiUrl : "";
    const apiKey = typeof config.apiKey === "string" ? config.apiKey : "";
    const instanceName = typeof config.instanceName === "string"
      ? config.instanceName
      : "";

    if (!apiUrl || !apiKey || !instanceName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Incomplete instance configuration",
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
          bucket: "whatsapp-send",
          globalScope: instanceId,
          globalLimit: 120,
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

    const parsedEvolutionUrl = new URL(String(apiUrl));
    if (
      parsedEvolutionUrl.search || parsedEvolutionUrl.hash ||
      parsedEvolutionUrl.username || parsedEvolutionUrl.password
    ) {
      throw new Error("evolution_invalid_api_url");
    }
    const evolutionBaseUrl = `${parsedEvolutionUrl.origin}${
      parsedEvolutionUrl.pathname.replace(/\/+$/, "")
    }`;
    const encodedInstanceName = encodeURIComponent(String(instanceName));

    // Send media if provided
    if (mediaUrl) {
      const mediaEndpoint =
        `${evolutionBaseUrl}/message/sendMedia/${encodedInstanceName}`;
      const mediaBody: any = {
        number: cleanNumber,
        mediatype: mediaType || "image",
        media: mediaUrl,
        caption: messageText || "",
      };
      if (mediaType === "document" && mediaFileName) {
        mediaBody.fileName = mediaFileName;
      }

      const mediaRes = await fetchPublicHttps(mediaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(mediaBody),
        signal: AbortSignal.timeout(20_000),
      }, { maxRedirects: 0 });

      const mediaData = await readResponseJsonLimited(mediaRes, 200_000).catch(
        () => null,
      );
      const mediaAck = mediaRes.ok
        ? extractEvolutionMessageAck(mediaData)
        : null;
      const acknowledged = mediaRes.ok && mediaAck !== null;

      if (executionClaim) {
        if (acknowledged) {
          await completeWorkflowExecution(supabase, executionClaim, mediaAck);
        } else {
          await failWorkflowExecution(
            supabase,
            executionClaim,
            mediaRes.ok
              ? "evolution_ack_missing"
              : `evolution_api_failed:${mediaRes.status}`,
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
          ...(mediaAck ? { data: mediaAck } : {
            error: mediaRes.ok
              ? "evolution_ack_missing"
              : "evolution_delivery_failed",
          }),
        }),
        {
          status: acknowledged ? 200 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Send text message
    const textEndpoint =
      `${evolutionBaseUrl}/message/sendText/${encodedInstanceName}`;
    const textRes = await fetchPublicHttps(textEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: messageText || "",
      }),
      signal: AbortSignal.timeout(20_000),
    }, { maxRedirects: 0 });

    const textData = await readResponseJsonLimited(textRes, 200_000).catch(() =>
      null
    );
    const textAck = textRes.ok ? extractEvolutionMessageAck(textData) : null;
    const acknowledged = textRes.ok && textAck !== null;

    if (executionClaim) {
      if (acknowledged) {
        await completeWorkflowExecution(supabase, executionClaim, textAck);
      } else {
        await failWorkflowExecution(
          supabase,
          executionClaim,
          textRes.ok
            ? "evolution_ack_missing"
            : `evolution_api_failed:${textRes.status}`,
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
        ...(textAck ? { data: textAck } : {
          error: textRes.ok
            ? "evolution_ack_missing"
            : "evolution_delivery_failed",
        }),
      }),
      {
        status: acknowledged ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const errorCode = safeIntegrationErrorCode(err, "whatsapp_internal_error");
    if (executionAdmin && executionClaim) {
      await failWorkflowExecution(executionAdmin, executionClaim, errorCode);
    }
    console.error("whatsapp_send_error", errorCode);
    return new Response(JSON.stringify({ success: false, error: errorCode }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
