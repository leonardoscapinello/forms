import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceWorkflowNodeRateLimits } from "../_shared/rateLimit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import {
  flattenFormElements,
  getPublicFormContext,
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
  extractOpenAiChatAck,
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { validateFormSubmission } from "../_shared/formSubmissionValidation.ts";
import { isWorkflowNodeDisabled } from "../_shared/workflowNodeAuthorization.ts";
import {
  applyAiWorkflowOutput,
  authorizePublicWorkflowTarget,
  issueWorkflowPathProof,
} from "../_shared/workflowPathGuard.ts";
import type { AuthorizedWorkflowTarget } from "../_shared/workflowPathGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OBJECTIVE_PROMPTS: Record<string, string> = {
  summarize:
    "You are an expert summarizer. Summarize the following form data concisely in the same language as the input. Be clear and actionable.",
  classify:
    "You are a classification expert. Analyze the following form data and classify it into the most appropriate category. Respond with just the category name. Use the same language as the input.",
  generate:
    "You are a creative writer. Generate personalized content based on the following form data. Match the tone and language of the input.",
  extract:
    "You are a data extraction specialist. Extract the requested information from the following form data. Return only the extracted data in a clear format. Use the same language as the input.",
  custom: "You are a helpful AI assistant. Follow the instructions carefully.",
};

const MAX_REQUEST_BYTES = 64_000;

serve(async (req) => {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceRoleKey);
    executionAdmin = admin;

    const parsedBody = await readLimitedJsonObject(
      req,
      MAX_REQUEST_BYTES,
      corsHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value as Record<string, any>;
    const test = body.test === true;
    if (test) {
      const caller = await requireAdmin(req);
      if (!caller.ok) return caller.response;
    }

    let objective =
      typeof body.objective === "string" && body.objective in OBJECTIVE_PROMPTS
        ? body.objective
        : "custom";
    let prompt = typeof body.prompt === "string"
      ? body.prompt.slice(0, 20_000)
      : "";
    let systemPrompt = typeof body.systemPrompt === "string"
      ? body.systemPrompt.slice(0, 20_000)
      : "";
    let inputData = body.inputData && typeof body.inputData === "object" &&
        !Array.isArray(body.inputData)
      ? body.inputData as Record<string, unknown>
      : {};
    let requestedModel = typeof body.model === "string"
      ? body.model.slice(0, 100)
      : "";
    let maxTokens =
      typeof body.maxTokens === "number" && Number.isFinite(body.maxTokens)
        ? body.maxTokens
        : 500;
    let temperature =
      typeof body.temperature === "number" && Number.isFinite(body.temperature)
        ? body.temperature
        : 0.7;
    let enforceFireOnce = false;
    let executionNodeKey = "";
    let workflowAuthorization: AuthorizedWorkflowTarget | null = null;
    let workflowFormData: Record<string, unknown> | null = null;

    if (!test && !isServiceRequest(req)) {
      const context = await getPublicFormContext(
        req,
        body.formId,
        body.submissionToken,
        body.responseId,
      );
      if (!context.ok) return context.response;
      const node = (context.formData.aiNodes || []).find((item: any) =>
        item.id === body.nodeId
      );
      if (
        !node ||
        isWorkflowNodeDisabled(context.formData, body.nodeId, "ai")
      ) {
        return new Response(
          JSON.stringify({ success: false, error: "ai_node_not_allowed" }),
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
        targetNodeId: `ai-${node.id}`,
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
      workflowFormData = context.formData;
      const answers = workflowAuthorization.answers;
      const variables = context.formData.variables || [];
      const elements = (context.formData.pages || []).flatMap((page: any) =>
        flattenFormElements(page.elements || [])
      );
      objective = node.objective in OBJECTIVE_PROMPTS
        ? node.objective
        : "custom";
      prompt = interpolateFormText(node.prompt, answers, variables).slice(
        0,
        20_000,
      );
      systemPrompt = interpolateFormText(
        node.systemPrompt,
        answers,
        variables,
      ).slice(0, 20_000);
      inputData = {};
      for (const sourceId of node.inputSources || []) {
        if (answers[sourceId] === undefined || answers[sourceId] === null) {
          continue;
        }
        const element = elements.find((item: any) => item.id === sourceId);
        const label = element?.label || element?.placeholder || sourceId;
        inputData[label] = typeof answers[sourceId] === "object"
          ? JSON.stringify(answers[sourceId])
          : String(answers[sourceId]);
      }
      requestedModel = typeof node.model === "string"
        ? node.model.slice(0, 100)
        : "";
      maxTokens =
        typeof node.maxTokens === "number" && Number.isFinite(node.maxTokens)
          ? node.maxTokens
          : 500;
      temperature = typeof node.temperature === "number" &&
          Number.isFinite(node.temperature)
        ? node.temperature
        : 0.7;
      enforceFireOnce = node.fireOnce !== false;
      executionNodeKey = buildWorkflowExecutionNodeKey({
        kind: "ai",
        nodeId: node.id,
      });
    }

    // Validate
    if (!prompt && !Object.keys(inputData).length && !test) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Prompt or input data is required.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: settings, error: settingsError } = await admin
      .from("integration_settings")
      .select("config, is_active")
      .eq("integration_type", "openai")
      .maybeSingle();

    if (settingsError) throw new Error("openai_settings_lookup_failed");

    const config = settings
      ? (await openIntegrationConfig(
        "openai",
        settings.config,
        Deno.env.get("ENCRYPTION_SECRET") ?? "",
      )).config
      : {};
    const apiKey = settings?.is_active && typeof config.apiKey === "string"
      ? config.apiKey
      : "";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OpenAI is not configured" }),
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
          admin,
          body.formId,
          body.responseId,
          executionNodeKey,
        ),
      enforceLimits: () =>
        enforceWorkflowNodeRateLimits(admin, req, {
          bucket: "ai-process",
          globalScope: String(body.formId || "admin-test"),
          globalLimit: 60,
          formId: typeof body.formId === "string" ? body.formId : "",
          responseId: typeof body.responseId === "string"
            ? body.responseId
            : "",
          nodeKey: executionNodeKey,
          serviceRoleKey,
          responseHeaders: corsHeaders,
        }),
      releaseClaim: (claim, reason) =>
        failWorkflowExecution(
          admin,
          claim,
          reason,
        ),
    });
    if (executionGate.state === "delivered") {
      const cached =
        executionGate.result && typeof executionGate.result === "object"
          ? (executionGate.result as Record<string, unknown>).result
          : executionGate.result;
      const workflowProof = workflowAuthorization && workflowFormData
        ? await issueWorkflowPathProof(
          workflowAuthorization,
          applyAiWorkflowOutput({
            authorization: workflowAuthorization,
            formData: workflowFormData,
            rawNodeId: String(body.nodeId || ""),
            result: cached ?? "",
          }),
        )
        : undefined;
      return new Response(
        JSON.stringify({
          success: true,
          deduplicated: true,
          result: cached ?? "",
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
        JSON.stringify({ success: true, processing: true, result: "" }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (executionGate.state === "limited") return executionGate.response;
    executionClaim = executionGate.claim;

    // Build the system prompt
    const baseSystem = OBJECTIVE_PROMPTS[objective] || OBJECTIVE_PROMPTS.custom;
    const fullSystem = systemPrompt
      ? `${baseSystem}\n\n${systemPrompt}`
      : baseSystem;

    // Build user message
    let userMessage = "";
    if (Object.keys(inputData).length > 0) {
      userMessage += "Form data:\n";
      for (const [key, value] of Object.entries(inputData)) {
        userMessage += `- ${key}: ${value}\n`;
      }
      userMessage += "\n";
    }
    if (prompt) {
      userMessage += prompt;
    }
    if (test && !userMessage) {
      userMessage =
        'This is a test message. Please respond with "AI node is working correctly!" in the same language as the system prompt.';
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: requestedModel ||
          (typeof config.model === "string" ? config.model : "") ||
          "gpt-4.1-mini",
        messages: [
          { role: "system", content: fullSystem },
          { role: "user", content: userMessage },
        ],
        max_completion_tokens: Math.max(
          1,
          Math.min(Math.floor(maxTokens), 4000),
        ),
        temperature: Math.max(0, Math.min(temperature, 2)),
      }),
      signal: AbortSignal.timeout(90_000),
      redirect: "error",
    });

    if (!response.ok) {
      if (executionClaim) {
        await failWorkflowExecution(
          admin,
          executionClaim,
          `openai_failed:${response.status}`,
        );
        executionClaim = null;
      }
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Rate limit exceeded. Try again in a moment.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Payment required. Please add credits to your workspace.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      console.error("openai_api_error", response.status);
      return new Response(
        JSON.stringify({
          success: false,
          error: `OpenAI API error (${response.status})`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await readResponseJsonLimited(response, 2_000_000);
    const acknowledgement = extractOpenAiChatAck(data);
    if (!acknowledgement) {
      if (executionClaim) {
        await failWorkflowExecution(
          admin,
          executionClaim,
          "openai_ack_missing",
        );
        executionClaim = null;
      }
      return new Response(
        JSON.stringify({ success: false, error: "openai_ack_missing" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { result } = acknowledgement;

    if (executionClaim) {
      await completeWorkflowExecution(admin, executionClaim, {
        result,
        completionId: acknowledgement.completionId,
      });
      executionClaim = null;
    }

    const workflowProof = workflowAuthorization && workflowFormData
      ? await issueWorkflowPathProof(
        workflowAuthorization,
        applyAiWorkflowOutput({
          authorization: workflowAuthorization,
          formData: workflowFormData,
          rawNodeId: String(body.nodeId || ""),
          result,
        }),
      )
      : undefined;
    return new Response(
      JSON.stringify({
        success: true,
        result,
        ...(workflowProof ? { workflowProof } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorCode = safeIntegrationErrorCode(
      error,
      "ai_process_internal_error",
    );
    if (executionAdmin && executionClaim) {
      await failWorkflowExecution(executionAdmin, executionClaim, errorCode);
    }
    console.error("ai_process_error", errorCode);
    return new Response(
      JSON.stringify({ success: false, error: errorCode }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
