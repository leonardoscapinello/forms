import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceWorkflowNodeRateLimits } from "../_shared/rateLimit.ts";
import { verifySignedState } from "../_shared/signedState.ts";
import { fetchPublicHttps } from "../_shared/outboundHttp.ts";
import {
  acquireWorkflowExecutionGate,
  buildWorkflowExecutionNodeKey,
  claimWorkflowExecution,
  completeWorkflowExecution,
  failWorkflowExecution,
} from "../_shared/workflowExecution.ts";
import { classifyAnalyticsWorkflowDelivery } from "../_shared/analyticsWorkflowDelivery.ts";
import type { WorkflowExecutionLease } from "../_shared/workflowExecution.ts";
import {
  isMetaConversionsAck,
  isTikTokEventsAck,
  normalizeAnalyticsParams,
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import {
  collectAllowedWebhookResponsePaths,
  projectWebhookResponse,
} from "../_shared/webhookResponseProjection.ts";
import {
  buildAuthoritativeWebhookPayload,
} from "../_shared/webhookRequestPayload.ts";
import {
  interpolateFormText,
  stringifyFormValue,
} from "../_shared/formInterpolation.ts";
import { flattenFormElements } from "../_shared/publicFormAuth.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { validateFormSubmission } from "../_shared/formSubmissionValidation.ts";
import { isWorkflowNodeDisabled } from "../_shared/workflowNodeAuthorization.ts";
import {
  applyWebhookWorkflowOutput,
  authorizePublicWorkflowTarget,
  issueWorkflowPathProof,
} from "../_shared/workflowPathGuard.ts";
import type { AuthorizedWorkflowTarget } from "../_shared/workflowPathGuard.ts";
import { isAuthorizedWorkflowLoadEvent } from "../_shared/workflowPathAuthorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_REQUEST_BYTES = 250_000;
const MAX_OUTBOUND_WEBHOOK_BODY_BYTES = 240_000;
const META_GRAPH_API_VERSION = "v25.0";
const LINKEDIN_API_VERSION = "202607";
const ALLOWED_WEBHOOK_METHODS = new Set(["GET", "POST", "PUT", "PATCH"]);
const BLOCKED_WEBHOOK_HEADERS = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);
const DANGEROUS_JSON_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);
const PUBLIC_CONTEXT_KEYS = new Set([
  "device",
  "browser",
  "os",
  "language",
  "screenWidth",
  "screenHeight",
  "date",
  "time",
  "datetime",
  "dayOfWeek",
  "timezone",
  "latitude",
  "longitude",
  "geoCity",
  "geoState",
  "geoCountry",
  "geoCountryCode",
  "geoNeighborhood",
  "geoStreet",
  "geoCep",
]);

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requestClientIp(req: Request): string | null {
  const direct = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = (direct || forwarded || "").trim();
  return candidate && candidate.length <= 128 && !/[\r\n]/.test(candidate)
    ? candidate
    : null;
}

function resolvePersistedUserData(
  formData: Record<string, any>,
  answers: Record<string, unknown>,
  mapping: Record<string, unknown>,
): { email?: string; phone?: string; name?: string } {
  const elements = (Array.isArray(formData.pages) ? formData.pages : [])
    .flatMap((page: any) => flattenFormElements(page?.elements || []));
  const resolveId = (mappingKey: string, fallbackType: string): string => {
    const configured = mapping[mappingKey];
    if (configured === "__none__") return "";
    if (typeof configured === "string" && configured) return configured;
    const fallback = elements.find((element: any) =>
      element?.type === fallbackType
    );
    return typeof fallback?.id === "string" ? fallback.id : "";
  };
  const emailId = resolveId("emailElementId", "input_email");
  const phoneId = resolveId("phoneElementId", "input_phone");
  const nameId = resolveId("nameElementId", "input_text");
  const email = emailId ? stringifyFormValue(answers[emailId]).trim() : "";
  const phone = phoneId ? stringifyFormValue(answers[phoneId]).trim() : "";
  const name = nameId ? stringifyFormValue(answers[nameId]).trim() : "";
  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(name ? { name } : {}),
  };
}

// SHA-256 hash helper (for PII hashing required by Conversions APIs)
async function sha256(value: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Fetch pixel config from integration_settings table
async function fetchPixelConfig(
  supabaseAdmin: any,
): Promise<Record<string, any>> {
  const { data, error } = await supabaseAdmin
    .from("integration_settings")
    .select("config")
    .eq("integration_type", "pixels")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("pixel_configuration_lookup_failed");
  if (!data) return {};
  return (await openIntegrationConfig(
    "pixels",
    data.config,
    Deno.env.get("ENCRYPTION_SECRET") ?? "",
  )).config as Record<string, any>;
}

// Save event log to database
async function saveEventLog(supabaseAdmin: any, logEntry: {
  form_id: string;
  response_id?: string;
  platform: string;
  event_name: string;
  event_id?: string;
  trigger_type: string;
  fired_client: boolean;
  fired_server: boolean;
  server_response?: Record<string, any>;
  source_url?: string;
  user_agent?: string;
  custom_params?: Record<string, any>;
}): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from("pixel_events_log").insert(
      logEntry,
    );
    if (error) {
      console.error("pixel_event_log_insert_failed");
      return false;
    }
    return true;
  } catch {
    console.error("pixel_event_log_insert_failed");
    return false;
  }
}

function normalizeGa4EventName(value: unknown): string {
  const normalized = String(value || "event")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const prefixed = /^[a-z]/.test(normalized)
    ? normalized
    : `event_${normalized || "custom"}`;
  return prefixed.slice(0, 40);
}

function safeWebhookHeaders(
  entries: unknown,
  answers: Record<string, any>,
  variables: any[],
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!Array.isArray(entries)) return headers;
  for (const item of entries.slice(0, 30)) {
    const headerName = String(item?.key || "").trim();
    const lowerName = headerName.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(headerName)) continue;
    if (
      BLOCKED_WEBHOOK_HEADERS.has(lowerName) || lowerName.startsWith("sec-")
    ) continue;
    const headerValue = interpolateFormText(item?.value, answers, variables);
    if (headerValue.length <= 4_096 && !/[\r\n]/.test(headerValue)) {
      headers[headerName] = headerValue;
    }
  }
  return headers;
}

function deliveryFailureResponse(
  status: number,
  error: string,
  results: Record<string, any>,
  webhookResponseBody?: unknown,
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error,
      results,
      ...(webhookResponseBody ? { webhookResponseBody } : {}),
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return jsonError(405, "method_not_allowed");

  // Supabase admin client for DB access and logging
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
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
      platform,
      eventName,
      customParams,
    } = body;
    const {
      eventId,
      formId,
      triggerType = "flow_node", // 'load_event' | 'flow_node'
      firedClient = false, // was client-side already fired?
      responseId,
      webhookPayload,
      userData,
      sourceUrl,
      userAgent,
    } = body;
    let answers = body.answers;
    const submittedVariables = body.variables;

    const isInternal = !!supabaseServiceKey &&
      req.headers.get("authorization") === `Bearer ${supabaseServiceKey}`;
    let publicSessionId = "";
    if (!UUID_PATTERN.test(String(formId || ""))) {
      return jsonError(400, "invalid_form_id");
    }
    if (!isInternal) {
      const tokenData = typeof body.submissionToken === "string"
        ? await verifySignedState(body.submissionToken)
        : null;
      if (
        tokenData?.kind !== "form-submission" || tokenData.formId !== formId
      ) {
        return jsonError(401, "invalid_or_expired_token");
      }
      if (
        typeof responseId !== "string" ||
        !UUID_PATTERN.test(responseId) ||
        tokenData.responseId !== responseId
      ) {
        return jsonError(403, "response_mismatch");
      }
      if (
        typeof tokenData.sessionId !== "string" ||
        !UUID_PATTERN.test(tokenData.sessionId)
      ) return jsonError(403, "session_mismatch");
      publicSessionId = tokenData.sessionId;
    }

    const { data: formRow, error: formLookupError } = await supabaseAdmin
      .from("forms")
      .select("status, data")
      .eq("id", formId)
      .maybeSingle();
    if (formLookupError) throw new Error("form_lookup_failed");
    if (!formRow || (!isInternal && formRow.status !== "published")) {
      return jsonError(404, "form_not_available");
    }
    const formData = formRow.data as any;
    if (!isInternal) {
      const webhookRawAnswers = platform === "webhook" &&
          webhookPayload?.answers_raw &&
          typeof webhookPayload.answers_raw === "object" &&
          !Array.isArray(webhookPayload.answers_raw)
        ? webhookPayload.answers_raw as Record<string, unknown>
        : {};
      const submittedAnswers = answers && typeof answers === "object" &&
          !Array.isArray(answers)
        ? answers as Record<string, unknown>
        : {};
      const validation = validateFormSubmission(
        formData,
        { ...webhookRawAnswers, ...submittedAnswers },
        {},
        { completion: false },
      );
      if (!validation.ok) return jsonError(422, "invalid_answers");
      answers = validation.answers;
    }
    let verifiedWebhookNode: any = null;
    let verifiedUserDataMapping: Record<string, unknown> = {};
    let enforceFireOnce = false;
    let executionNodeKey = "";
    let workflowAuthorization: AuthorizedWorkflowTarget | null = null;

    if (platform === "webhook") {
      const integrationNodes = Array.isArray(formData.integrationNodes)
        ? formData.integrationNodes
        : [];
      verifiedWebhookNode = integrationNodes.find((node: any) =>
        node?.id === body.nodeId && node?.platform === "webhook"
      );
      if (
        !verifiedWebhookNode?.webhookUrl ||
        isWorkflowNodeDisabled(formData, body.nodeId, "int")
      ) {
        return jsonError(403, "webhook_node_not_allowed");
      }
      eventName = "webhook_fired";
      enforceFireOnce = verifiedWebhookNode.fireOnce !== false;
      executionNodeKey = buildWorkflowExecutionNodeKey({
        kind: "webhook",
        nodeId: verifiedWebhookNode.id,
        platform: "webhook",
      });
    } else if (!isInternal) {
      if (triggerType === "load_event") {
        const loadEvent = (formData.pixelLoadEvents || []).find((event: any) =>
          event.id === body.nodeId
        );
        if (
          !loadEvent ||
          !isAuthorizedWorkflowLoadEvent(formData, body.nodeId, platform)
        ) {
          return jsonError(403, "pixel_event_not_allowed");
        }
        eventName = loadEvent.eventType === "custom"
          ? (loadEvent.customEventName || "CustomEvent")
          : loadEvent.eventType;
        customParams = {};
        verifiedUserDataMapping = loadEvent.userDataMapping || {};
        enforceFireOnce = true;
        executionNodeKey = buildWorkflowExecutionNodeKey({
          kind: "pixel-load",
          nodeId: loadEvent.id,
          platform: loadEvent.platform,
        });
      } else {
        const analyticsNode = (formData.analyticsNodes || []).find((
          node: any,
        ) => node.id === body.nodeId);
        const analyticsEntries = Array.isArray(analyticsNode?.platforms)
          ? analyticsNode.platforms
          : analyticsNode?.platform
          ? [{
            id: analyticsNode.id,
            platform: analyticsNode.platform,
            eventType: analyticsNode.eventType || "Lead",
            customEventName: analyticsNode.customEventName,
            customParams: [],
            enabled: true,
          }]
          : [];
        const entry = analyticsEntries.find((item: any) =>
          item.id === body.entryId && item.enabled
        );
        if (
          !entry || entry.platform !== platform ||
          isWorkflowNodeDisabled(formData, body.nodeId, "an")
        ) {
          return jsonError(403, "pixel_event_not_allowed");
        }
        eventName = entry.eventType === "custom"
          ? (entry.customEventName || "CustomEvent")
          : entry.eventType;
        customParams = Object.fromEntries(
          (entry.customParams || []).filter((item: any) => item.key).map((
            item: any,
          ) => [item.key, item.value]),
        );
        verifiedUserDataMapping = entry.userDataMapping || {};
        enforceFireOnce = analyticsNode.fireOnce !== false;
        executionNodeKey = buildWorkflowExecutionNodeKey({
          kind: "analytics",
          nodeId: analyticsNode.id,
          platform: entry.platform,
          entryId: entry.id,
        });
      }
    }

    if (!isInternal && triggerType !== "load_event") {
      const targetNodeId = platform === "webhook"
        ? `int-${String(verifiedWebhookNode?.id || "")}`
        : `an-${String(body.nodeId || "")}`;
      const pathAuthorization = await authorizePublicWorkflowTarget({
        admin: supabaseAdmin,
        formData,
        identity: {
          formId: String(formId),
          responseId: String(responseId),
          sessionId: publicSessionId,
        },
        sourceNodeId: body.workflowSourceNodeId,
        proof: body.workflowProof,
        targetNodeId,
        answers: answers as Record<string, unknown>,
      });
      if (!pathAuthorization.ok) {
        return jsonError(pathAuthorization.status, pathAuthorization.error);
      }
      workflowAuthorization = pathAuthorization.authorization;
      answers = workflowAuthorization.answers;
    }

    const webhookAllowedResponsePaths = platform === "webhook"
      ? collectAllowedWebhookResponsePaths(
        formData,
        String(verifiedWebhookNode?.id || ""),
      )
      : [];

    if (
      ![
        "webhook",
        "meta_pixel",
        "google_analytics",
        "tiktok_pixel",
        "linkedin_pixel",
      ].includes(platform)
    ) {
      return jsonError(400, "invalid_platform");
    }
    if (
      typeof eventName !== "string" || !eventName.trim() ||
      eventName.length > 160
    ) {
      return jsonError(400, "invalid_event_name");
    }
    if (
      platform !== "webhook" &&
      (typeof eventId !== "string" || !eventId.trim() || eventId.length > 256)
    ) {
      return jsonError(400, "invalid_event_id");
    }

    const executionGate = await acquireWorkflowExecutionGate({
      enforceFireOnce,
      claimExecution: () =>
        claimWorkflowExecution(
          supabaseAdmin,
          String(formId),
          String(responseId),
          executionNodeKey,
        ),
      enforceLimits: () =>
        enforceWorkflowNodeRateLimits(
          supabaseAdmin,
          req,
          {
            bucket: "pixel-event",
            globalScope: `${String(formId)}:${String(platform)}`,
            globalLimit: platform === "webhook" ? 120 : 600,
            formId: String(formId),
            responseId: typeof responseId === "string" ? responseId : "",
            nodeKey: executionNodeKey,
            serviceRoleKey: supabaseServiceKey,
            responseHeaders: corsHeaders,
          },
        ),
      releaseClaim: (claim, reason) =>
        failWorkflowExecution(
          supabaseAdmin,
          claim,
          reason,
        ),
    });
    if (executionGate.state === "delivered") {
      const cached =
        executionGate.result && typeof executionGate.result === "object"
          ? executionGate.result as Record<string, any>
          : {};
      let cachedWebhookResponse: unknown = {};
      if (platform === "webhook") {
        try {
          // Old execution rows may still contain an unfiltered upstream body.
          // Re-project on every read so a deduplicated retry cannot revive it.
          cachedWebhookResponse = projectWebhookResponse(
            cached.webhookResponseBody,
            webhookAllowedResponsePaths,
          );
        } catch {
          cachedWebhookResponse = {};
        }
      }
      const workflowProof = workflowAuthorization
        ? await issueWorkflowPathProof(
          workflowAuthorization,
          platform === "webhook"
            ? applyWebhookWorkflowOutput({
              authorization: workflowAuthorization,
              formData,
              rawNodeId: String(body.nodeId || ""),
              responseBody: cachedWebhookResponse,
            })
            : workflowAuthorization.answers,
        )
        : undefined;
      return new Response(
        JSON.stringify({
          success: true,
          deduplicated: true,
          results: cached.results || {},
          ...(workflowProof ? { workflowProof } : {}),
          ...(platform === "webhook"
            ? { webhookResponseBody: cachedWebhookResponse }
            : {}),
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

    // Fetch pixel config from DB (not from env secrets)
    const pixelConfig = platform === "webhook"
      ? {}
      : await fetchPixelConfig(supabaseAdmin);

    const results: Record<string, any> = {};
    let serverFired = false;

    // Resolve fields
    const resolvedSourceUrl = typeof sourceUrl === "string"
      ? sourceUrl.slice(0, 4_096)
      : "";
    const resolvedFormId = formId;
    const configuredVariables = Array.isArray(formData.variables)
      ? formData.variables
      : [];
    const submittedVariableMap = submittedVariables &&
        typeof submittedVariables === "object" &&
        !Array.isArray(submittedVariables)
      ? submittedVariables as Record<string, unknown>
      : {};
    const resolvedVariables = isInternal
      ? submittedVariableMap
      : Object.fromEntries(configuredVariables.flatMap((variable: any) => {
        const name = typeof variable?.name === "string" ? variable.name : "";
        const key = `__var_${name}`;
        return name && answers && typeof answers === "object" &&
            Object.prototype.hasOwnProperty.call(answers, key)
          ? [[name, (answers as Record<string, unknown>)[key]]]
          : [];
      }));
    const resolvedUserData = !isInternal
      ? resolvePersistedUserData(
        formData,
        answers as Record<string, unknown>,
        verifiedUserDataMapping,
      )
      : userData || (() => {
        const ans = webhookPayload?.answers || {};
        let email: string | undefined;
        let phone: string | undefined;
        let name: string | undefined;
        for (const val of Object.values(ans)) {
          if (typeof val === "string" && val.includes("@") && !email) {
            email = val;
          }
          if (
            typeof val === "object" && val !== null && (val as any).full_number
          ) {
            phone = (val as any).full_number;
          }
        }
        return { email, phone, name };
      })();
    const interpolationAnswerMap = answers && typeof answers === "object" &&
        !Array.isArray(answers)
      ? answers as Record<string, unknown>
      : {};
    customParams = customParams && typeof customParams === "object" &&
        !Array.isArray(customParams)
      ? Object.fromEntries(
        Object.entries(customParams).map(([key, value]) => [
          key,
          interpolateFormText(
            value,
            interpolationAnswerMap,
            configuredVariables,
          ),
        ]),
      )
      : {};

    // ── Meta Conversions API ──────────────────────────────────────────────────
    if (platform === "meta_pixel") {
      const pixelId = pixelConfig.metaPixelId;
      const accessToken = pixelConfig.metaCapiToken;
      const enabled = pixelConfig.metaEnabled;

      if (!enabled || !pixelId || !accessToken) {
        results.meta = {
          skipped: true,
          reason: !enabled
            ? "Meta Pixel disabled in settings"
            : "Pixel ID or CAPI Token not configured in Settings → Integrations",
        };
      } else {
        const userData_hashed: Record<string, any> = {};
        if (
          typeof resolvedUserData?.email === "string" &&
          resolvedUserData.email.length <= 320
        ) {
          userData_hashed.em = [await sha256(resolvedUserData.email)];
        }
        if (
          typeof resolvedUserData?.phone === "string" &&
          resolvedUserData.phone.length <= 40
        ) {
          userData_hashed.ph = [
            await sha256(resolvedUserData.phone.replace(/\D/g, "")),
          ];
        }
        if (
          typeof resolvedUserData?.name === "string" &&
          resolvedUserData.name.length <= 300
        ) {
          // Meta CAPI expects fn (first name) hashed
          const nameParts = resolvedUserData.name.trim().split(/\s+/);
          userData_hashed.fn = [await sha256(nameParts[0])];
          if (nameParts.length > 1) {
            userData_hashed.ln = [
              await sha256(nameParts[nameParts.length - 1]),
            ];
          }
        }

        // Meta CAPI requires at least client_ip_address + client_user_agent
        // to avoid "not enough customer information parameters" error
        const clientIp = isInternal
          ? (typeof body.clientIpAddress === "string"
            ? body.clientIpAddress.slice(0, 128)
            : requestClientIp(req) || "")
          : requestClientIp(req) || "";
        const clientUa = isInternal && typeof userAgent === "string"
          ? userAgent.slice(0, 1_000)
          : req.headers.get("user-agent")?.slice(0, 1_000) || "";
        if (clientIp) userData_hashed.client_ip_address = clientIp;
        if (clientUa) userData_hashed.client_user_agent = clientUa;

        // Pass fbc/fbp cookies if available (sent from client)
        if (body.fbc) userData_hashed.fbc = body.fbc;
        if (body.fbp) userData_hashed.fbp = body.fbp;

        // External ID fallback — use responseId as external_id if no email/phone
        if (
          !resolvedUserData?.email && !resolvedUserData?.phone &&
          body.responseId
        ) {
          userData_hashed.external_id = [await sha256(body.responseId)];
        }

        const customData: Record<string, any> = {
          form_id: resolvedFormId,
          ...normalizeAnalyticsParams(customParams),
          ...normalizeAnalyticsParams(resolvedVariables, "var_"),
        };

        const payload = {
          data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            event_source_url: resolvedSourceUrl,
            action_source: "website",
            user_data: userData_hashed,
            custom_data: customData,
          }],
        };

        const metaUrl = new URL(
          `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${
            encodeURIComponent(String(pixelId))
          }/events`,
        );
        metaUrl.searchParams.set("access_token", String(accessToken));
        const res = await fetch(
          metaUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
            redirect: "error",
          },
        );
        const data = await readResponseJsonLimited<Record<string, unknown>>(
          res,
          200_000,
        ).catch((): Record<string, unknown> => ({}));
        const acknowledged = res.ok && isMetaConversionsAck(data);
        results.meta = {
          ok: acknowledged,
          status: res.status,
          eventsReceived: typeof data.events_received === "number"
            ? data.events_received
            : 0,
          ...(typeof data.fbtrace_id === "string"
            ? { traceId: data.fbtrace_id.slice(0, 256) }
            : {}),
          ...(!acknowledged && res.ok ? { error: "meta_ack_missing" } : {}),
        };
        if (acknowledged) serverFired = true;
      }
    }

    // ── Google Analytics 4 Measurement Protocol ───────────────────────────────
    if (platform === "google_analytics") {
      const measurementId = pixelConfig.ga4MeasurementId;
      const apiSecret = pixelConfig.ga4ApiSecret;
      const enabled = pixelConfig.ga4Enabled;

      if (!enabled || !measurementId || !apiSecret) {
        results.ga4 = {
          skipped: true,
          reason: !enabled
            ? "GA4 disabled in settings"
            : "Measurement ID or API Secret not configured in Settings → Integrations",
        };
      } else {
        // GA4 requires a stable client_id per user session — use responseId or fallback
        const clientId = responseId || eventId;

        const payload = {
          client_id: clientId,
          events: [{
            name: normalizeGa4EventName(eventName),
            params: {
              ...normalizeAnalyticsParams(customParams),
              ...normalizeAnalyticsParams(resolvedVariables, "var_"),
              engagement_time_msec: 1,
              form_id: resolvedFormId,
              event_dedup_id: eventId,
              session_id: clientId,
            },
          }],
        };

        const res = await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
            redirect: "error",
          },
        );
        await res.body?.cancel().catch(() => undefined);
        const acknowledged = res.status === 204;
        results.ga4 = {
          ok: acknowledged,
          status: res.status,
          acknowledgement: acknowledged
            ? "transport_accepted_processing_unverifiable"
            : "rejected",
        };
        if (acknowledged) serverFired = true;
      }
    }

    // ── TikTok Events API ─────────────────────────────────────────────────────
    if (platform === "tiktok_pixel") {
      const pixelId = pixelConfig.tiktokPixelId;
      const accessToken = pixelConfig.tiktokAccessToken;
      const enabled = pixelConfig.tiktokEnabled;

      if (!enabled || !pixelId || !accessToken) {
        results.tiktok = {
          skipped: true,
          reason: !enabled
            ? "TikTok Pixel disabled in settings"
            : "Pixel ID or Access Token not configured in Settings → Integrations",
        };
      } else {
        const userData_hashed: Record<string, string> = {};
        if (
          typeof resolvedUserData?.email === "string" &&
          resolvedUserData.email.length <= 320
        ) {
          userData_hashed.email = await sha256(resolvedUserData.email);
        }
        if (
          typeof resolvedUserData?.phone === "string" &&
          resolvedUserData.phone.length <= 40
        ) {
          userData_hashed.phone_number = await sha256(
            resolvedUserData.phone.replace(/\D/g, ""),
          );
        }

        const payload = {
          pixel_code: pixelId,
          event: eventName,
          event_id: eventId,
          timestamp: new Date().toISOString(),
          context: {
            page: { url: resolvedSourceUrl },
            user: userData_hashed,
          },
          properties: {
            contents: [{ content_id: resolvedFormId }],
            ...normalizeAnalyticsParams(customParams),
            ...normalizeAnalyticsParams(resolvedVariables, "var_"),
          },
        };

        const res = await fetch(
          "https://business-api.tiktok.com/open_api/v1.3/pixel/track/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Access-Token": accessToken,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
            redirect: "error",
          },
        );
        const data = await readResponseJsonLimited<Record<string, unknown>>(
          res,
          200_000,
        ).catch((): Record<string, unknown> => ({}));
        const accepted = res.ok && isTikTokEventsAck(data);
        results.tiktok = {
          ok: accepted,
          status: res.status,
          ...(typeof data.request_id === "string"
            ? { requestId: data.request_id.slice(0, 256) }
            : {}),
          ...(!accepted && res.ok ? { error: "tiktok_ack_missing" } : {}),
        };
        if (accepted) serverFired = true;
      }
    }

    // ── LinkedIn Conversions API ───────────────────────────────────────────────
    if (platform === "linkedin_pixel") {
      const partnerId = pixelConfig.linkedinPartnerId;
      const accessToken = pixelConfig.linkedinAccessToken;
      const conversionId = pixelConfig.linkedinConversionId;
      const enabled = pixelConfig.linkedinEnabled;

      if (!enabled || !partnerId || !accessToken || !conversionId) {
        results.linkedin = {
          skipped: true,
          reason: !enabled
            ? "LinkedIn Pixel disabled in settings"
            : "Partner ID, Access Token or Conversion ID not configured in Settings → Integrations",
        };
      } else {
        const userIds: { idType: string; idValue: string }[] = [];
        if (
          typeof resolvedUserData?.email === "string" &&
          resolvedUserData.email.length <= 320
        ) {
          userIds.push({
            idType: "SHA256_EMAIL",
            idValue: await sha256(resolvedUserData.email),
          });
        }
        if (userIds.length === 0) {
          results.linkedin = {
            skipped: true,
            reason: "LinkedIn requires at least one supported user identifier",
          };
        } else {
          const payload = {
            conversion: `urn:lla:llaPartnerConversion:${conversionId}`,
            conversionHappenedAt: Date.now(),
            user: { userIds },
            eventId,
          };

          const res = await fetch(
            "https://api.linkedin.com/rest/conversionEvents",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
                "LinkedIn-Version": LINKEDIN_API_VERSION,
                "X-Restli-Protocol-Version": "2.0.0",
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
              redirect: "error",
            },
          );
          await res.body?.cancel().catch(() => undefined);
          const acknowledged = res.status === 201;
          results.linkedin = { ok: acknowledged, status: res.status };
          if (acknowledged) serverFired = true;
        }
      }
    }

    // ── Webhook ───────────────────────────────────────────────────────────────
    if (platform === "webhook") {
      // Destination, method, headers, query and body parameters always come
      // from the persisted node resolved above. The request body is ignored as
      // a source of webhook configuration, even for service-role callers.
      const webhookNode = verifiedWebhookNode;
      const publicPayload = !isInternal
        ? buildAuthoritativeWebhookPayload({
          formData,
          formId: resolvedFormId,
          responseId,
          eventId,
          clientPayload: webhookPayload,
          fallbackAnswers: answers,
          fallbackVariables: resolvedVariables,
          queryParams: body.queryParams,
          sourceUrl,
          requestIp: requestClientIp(req),
          requestUserAgent: req.headers.get("user-agent"),
        })
        : null;
      const publicRawAnswers = publicPayload?.answers_raw &&
          typeof publicPayload.answers_raw === "object"
        ? publicPayload.answers_raw as Record<string, unknown>
        : {};
      const publicVariables = publicPayload?.variables &&
          typeof publicPayload.variables === "object"
        ? publicPayload.variables as Record<string, unknown>
        : {};
      const publicNavigation = publicPayload?.navigation &&
          typeof publicPayload.navigation === "object"
        ? publicPayload.navigation as Record<string, unknown>
        : {};
      const publicQueryParams = publicNavigation.query_params &&
          typeof publicNavigation.query_params === "object"
        ? publicNavigation.query_params as Record<string, unknown>
        : {};
      const publicRuntimeSource = answers && typeof answers === "object" &&
          !Array.isArray(answers)
        ? answers as Record<string, unknown>
        : {};
      const interpolationAnswers = isInternal
        ? ((answers || webhookPayload?.answers_raw || webhookPayload?.answers ||
          {}) as Record<
            string,
            any
          >)
        : Object.assign(
          Object.create(null),
          publicRawAnswers,
          Object.fromEntries(
            Object.entries(publicVariables).map(([key, value]) => [
              `__var_${key}`,
              value,
            ]),
          ),
          Object.fromEntries(
            Object.entries(publicQueryParams).map(([key, value]) => [
              `__param_${key}`,
              value,
            ]),
          ),
        );
      if (!isInternal) {
        // Context values are client-observed by definition. Only the documented
        // finite key set and bounded scalar values cross into interpolation.
        for (const contextKey of PUBLIC_CONTEXT_KEYS) {
          const storageKey = `__ctx_${contextKey}`;
          const candidate = publicRuntimeSource[storageKey];
          if (
            ["string", "number", "boolean"].includes(typeof candidate) &&
            String(candidate).length <= 4_096
          ) interpolationAnswers[storageKey] = candidate;
        }

        // A previous webhook response was already projected before being sent
        // to the browser. Re-project it from persisted downstream consumers so
        // a forged client object cannot add unconfigured response paths.
        const integrationNodes = Array.isArray(formData.integrationNodes)
          ? formData.integrationNodes.slice(0, 256)
          : [];
        for (const integrationNode of integrationNodes) {
          const upstreamNodeId = typeof integrationNode?.id === "string"
            ? integrationNode.id
            : "";
          if (!upstreamNodeId) continue;
          const storageKey = `__webhook_${upstreamNodeId}`;
          if (
            !Object.prototype.hasOwnProperty.call(
              publicRuntimeSource,
              storageKey,
            )
          ) {
            continue;
          }
          try {
            interpolationAnswers[storageKey] = projectWebhookResponse(
              publicRuntimeSource[storageKey],
              collectAllowedWebhookResponsePaths(formData, upstreamNodeId),
            );
          } catch {
            interpolationAnswers[storageKey] = {};
          }
        }
      }
      const formVariables = Array.isArray(formData.variables)
        ? formData.variables
        : [];
      let url = interpolateFormText(
        webhookNode.webhookUrl,
        interpolationAnswers,
        formVariables,
      );
      const method = String(webhookNode.webhookMethod || "POST").toUpperCase();

      if (!url) {
        results.webhook = {
          skipped: true,
          reason: "No URL configured on the node",
        };
      } else if (!ALLOWED_WEBHOOK_METHODS.has(method)) {
        results.webhook = {
          skipped: true,
          reason: "Webhook method is not allowed",
        };
      } else {
        // Append query params
        const queryParams = webhookNode.webhookQueryParams || [];
        const destination = new URL(url);
        if (Array.isArray(queryParams)) {
          for (const parameter of queryParams.slice(0, 50)) {
            const key = String(parameter?.key || "").trim().slice(0, 200);
            if (!key) continue;
            destination.searchParams.set(
              key,
              interpolateFormText(
                parameter?.value,
                interpolationAnswers,
                formVariables,
              )
                .slice(0, 4_096),
            );
          }
        }
        url = destination.toString();

        // Build headers
        const headers = safeWebhookHeaders(
          webhookNode.webhookHeaders,
          interpolationAnswers,
          formVariables,
        );

        // Build body with extra params
        const bodyParams = [
          ...(Array.isArray(webhookNode.webhookParams)
            ? webhookNode.webhookParams
            : []),
          ...(Array.isArray(webhookNode.webhookBodyParams)
            ? webhookNode.webhookBodyParams
            : []),
        ];
        const extraBody: Record<string, string> = Object.create(null);
        for (const parameter of bodyParams.slice(0, 100)) {
          const key = String(parameter?.key || "").trim().slice(0, 200);
          if (!key || DANGEROUS_JSON_KEYS.has(key.toLowerCase())) continue;
          extraBody[key] = interpolateFormText(
            parameter?.value,
            interpolationAnswers,
            formVariables,
          ).slice(0, 10_000);
        }

        // Anonymous callers get a server-owned schema whose answer/variable
        // values have already been filtered against the persisted form. A
        // service-role workflow may keep the legacy body contract, while all
        // transport configuration still comes from `webhookNode`.
        const outPayload = publicPayload || webhookPayload || {
          event: {
            id: responseId || eventId,
            form_id: resolvedFormId,
            response_id: responseId,
            submitted_at: new Date().toISOString(),
          },
          respondent: {
            ip: requestClientIp(req),
            user_agent: req.headers.get("user-agent"),
            geolocation: null,
          },
          answers: answers || {},
          answers_raw: answers || {},
          variables: resolvedVariables,
          query_params: body.queryParams || {},
        };

        // Merge extra body params into payload
        const finalPayload = Object.keys(extraBody).length > 0
          ? { ...outPayload, meta: extraBody }
          : outPayload;

        let webhookResponseBody: unknown = {};
        const expectsJsonResponse = webhookAllowedResponsePaths.length > 0;
        try {
          const requestBody = method !== "GET"
            ? JSON.stringify(finalPayload)
            : undefined;
          if (
            requestBody &&
            new TextEncoder().encode(requestBody).byteLength >
              MAX_OUTBOUND_WEBHOOK_BODY_BYTES
          ) {
            throw new Error("webhook_payload_too_large");
          }
          const res = await fetchPublicHttps(url, {
            method,
            headers,
            body: requestBody,
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
          });
          results.webhook = { ok: res.ok, status: res.status };
          serverFired = res.ok;
          const contentType = res.headers.get("content-type") || "";
          if (
            res.ok && expectsJsonResponse &&
            contentType.toLowerCase().includes("json")
          ) {
            try {
              const upstreamBody = await readResponseJsonLimited(res, 128_000);
              webhookResponseBody = projectWebhookResponse(
                upstreamBody,
                webhookAllowedResponsePaths,
              );
            } catch {
              serverFired = false;
              results.webhook = {
                ok: false,
                status: res.status,
                error: "webhook_response_invalid",
              };
            }
          } else {
            await res.body?.cancel().catch(() => undefined);
            if (res.ok && expectsJsonResponse) {
              serverFired = false;
              results.webhook = {
                ok: false,
                status: res.status,
                error: "webhook_json_response_required",
              };
            }
          }
        } catch (fetchErr) {
          results.webhook = {
            ok: false,
            error: safeIntegrationErrorCode(fetchErr, "webhook_request_failed"),
          };
        }

        // Log webhook fires as analytics event too
        const telemetryPersisted = await saveEventLog(supabaseAdmin, {
          form_id: resolvedFormId,
          response_id: responseId,
          platform: "webhook",
          event_name: "webhook_fired",
          event_id: eventId,
          trigger_type: triggerType,
          fired_client: firedClient,
          fired_server: serverFired,
          server_response: results,
          source_url: resolvedSourceUrl,
          user_agent: userAgent,
          custom_params: customParams,
        });
        results.telemetryPersisted = telemetryPersisted;

        if (!serverFired) {
          const skipped = !!results.webhook?.skipped;
          if (executionClaim) {
            await failWorkflowExecution(
              supabaseAdmin,
              executionClaim,
              skipped ? "webhook_not_configured" : "webhook_delivery_failed",
            );
            executionClaim = null;
          }
          return deliveryFailureResponse(
            skipped ? 424 : 502,
            skipped ? "webhook_not_configured" : "webhook_delivery_failed",
            results,
            webhookResponseBody,
          );
        }

        if (executionClaim) {
          await completeWorkflowExecution(supabaseAdmin, executionClaim, {
            results,
            webhookResponseBody,
          });
          executionClaim = null;
        }

        const workflowProof = workflowAuthorization
          ? await issueWorkflowPathProof(
            workflowAuthorization,
            applyWebhookWorkflowOutput({
              authorization: workflowAuthorization,
              formData,
              rawNodeId: String(body.nodeId || ""),
              responseBody: webhookResponseBody,
            }),
          )
          : undefined;

        return new Response(
          JSON.stringify({
            success: true,
            results,
            webhookResponseBody,
            ...(workflowProof ? { workflowProof } : {}),
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // ── Save pixel event log ──────────────────────────────────────────────────
    if (platform !== "webhook") {
      const telemetryPersisted = await saveEventLog(supabaseAdmin, {
        form_id: resolvedFormId,
        response_id: responseId,
        platform,
        event_name: eventName,
        event_id: eventId,
        trigger_type: triggerType,
        fired_client: firedClient,
        fired_server: serverFired,
        server_response: results,
        source_url: resolvedSourceUrl,
        user_agent: userAgent,
        custom_params: customParams,
      });
      results.telemetryPersisted = telemetryPersisted;
    }

    if (!serverFired) {
      const outcome = Object.values(results)[0] as
        | Record<string, any>
        | undefined;
      const skipped = !!outcome?.skipped;
      const isWebhook = platform === "webhook";

      // Analytics cannot change the route or produce variables. After the
      // authenticated server attempt and durable telemetry write above, issue
      // the path proof even when the provider is disabled or unavailable. A
      // tracking outage remains visible in analyticsDeliveryStatus, but it can
      // never strand the respondent before the lead is saved.
      if (workflowAuthorization && !isWebhook) {
        const analyticsDeliveryStatus = classifyAnalyticsWorkflowDelivery(
          serverFired,
          outcome,
        );
        if (executionClaim) {
          await completeWorkflowExecution(supabaseAdmin, executionClaim, {
            results,
            analyticsDeliveryStatus,
          });
          executionClaim = null;
        }
        const workflowProof = await issueWorkflowPathProof(
          workflowAuthorization,
        );
        return new Response(JSON.stringify({
          success: true,
          results,
          analyticsDelivered: false,
          analyticsDeliveryStatus,
          workflowProof,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (executionClaim) {
        await failWorkflowExecution(
          supabaseAdmin,
          executionClaim,
          skipped
            ? `${platform}_not_configured`
            : `${platform}_delivery_failed`,
        );
        executionClaim = null;
      }
      return deliveryFailureResponse(
        skipped ? 424 : 502,
        skipped
          ? (isWebhook ? "webhook_not_configured" : "pixel_not_configured")
          : (isWebhook ? "webhook_delivery_failed" : "pixel_delivery_failed"),
        results,
      );
    }

    if (executionClaim) {
      await completeWorkflowExecution(supabaseAdmin, executionClaim, {
        results,
      });
      executionClaim = null;
    }

    const workflowProof = workflowAuthorization
      ? await issueWorkflowPathProof(workflowAuthorization)
      : undefined;

    return new Response(JSON.stringify({
      success: true,
      results,
      ...(workflowProof ? { workflowProof } : {}),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorCode = safeIntegrationErrorCode(
      err,
      "pixel_event_internal_error",
    );
    if (executionClaim) {
      await failWorkflowExecution(supabaseAdmin, executionClaim, errorCode);
    }
    console.error("pixel_event_error", errorCode);
    return new Response(JSON.stringify({ success: false, error: errorCode }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
