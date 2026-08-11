import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforcePublicSubmissionRateLimits } from '../_shared/rateLimit.ts';
import { verifySignedState } from '../_shared/signedState.ts';
import type { CompletionDeliveryType } from '../_shared/completionDeliveries.ts';
import { loadCanonicalCompletedResponse } from '../_shared/canonicalFormResponse.ts';
import { encryptStoredJson } from '../_shared/formResponseCrypto.ts';
import { ensureResponseDeliveryQueued } from '../_shared/formResponseDeliveryQueue.ts';
import { rejectUnsupportedHttpMethod } from '../_shared/httpMethod.ts';
import { readLimitedJsonObject } from '../_shared/limitedJsonBody.ts';
import {
  isCompletionSubmissionRequest,
  PUBLIC_SUBMISSION_MAX_BODY_BYTES,
  sanitizePublicPageEventTelemetry,
  sanitizePublicSessionTelemetry,
  validateFormSubmission,
} from '../_shared/formSubmissionValidation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SaveBody = {
  token?: string;
  kind: 'response' | 'session' | 'event';
  action: 'insert' | 'upsert' | 'update';
  payload: Record<string, unknown>;
  onConflict?: string;
  match?: Record<string, unknown>;
};

const VALID_KINDS = ['response', 'session', 'event'] as const;
const VALID_ACTIONS = ['insert', 'upsert', 'update'] as const;

function isValidKind(v: unknown): v is SaveBody['kind'] {
  return typeof v === 'string' && (VALID_KINDS as readonly string[]).includes(v);
}
function isValidAction(v: unknown): v is SaveBody['action'] {
  return typeof v === 'string' && (VALID_ACTIONS as readonly string[]).includes(v);
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return mismatch === 0;
}

function isInternalServiceRoleRequest(req: Request, serviceKey: string): boolean {
  if (!serviceKey) return false;
  const authorization = req.headers.get('Authorization') || '';
  return authorization.startsWith('Bearer ')
    && constantTimeEqual(authorization.slice('Bearer '.length), serviceKey);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pick(payload: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(allowed.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]));
}

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isBoundedNonNegativeInteger(value: unknown, maximum: number): boolean {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= maximum;
}

Deno.serve(async (req) => {
  const methodNotAllowed = rejectUnsupportedHttpMethod(
    req,
    ['POST', 'OPTIONS'],
    corsHeaders,
  );
  if (methodNotAllowed) return methodNotAllowed;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestReceivedAt = new Date();

  try {
    const parsedBody = await readLimitedJsonObject(
      req,
      PUBLIC_SUBMISSION_MAX_BODY_BYTES,
      corsHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value as SaveBody;
    if (!isValidKind(body?.kind) || !isValidAction(body?.action) || !isPlainObject(body?.payload)) {
      return errorResponse(400, 'invalid_payload');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
    if (!encryptionSecret) return errorResponse(503, 'encryption_unavailable');
    const internalServiceRole = isInternalServiceRoleRequest(req, serviceKey);
    const requestUserAgent = req.headers.get('user-agent') ?? '';

    let tokenData: Record<string, unknown> | null = null;
    let formId = '';
    if (typeof body.token === 'string') {
      tokenData = await verifySignedState(body.token);
      formId = typeof tokenData?.formId === 'string' ? tokenData.formId : '';
      if (tokenData?.kind !== 'form-submission' || !UUID_PATTERN.test(formId)) {
        return errorResponse(401, 'invalid_or_expired_token');
      }
    } else {
      // Legacy/internal server workflows may persist a canonical response
      // without a browser submission token. The exact service-role bearer is
      // the sole compatibility boundary; public callers never reach this path.
      if (!internalServiceRole) return errorResponse(401, 'invalid_or_expired_token');
      formId = typeof body.payload.form_id === 'string' ? body.payload.form_id : '';
      if (!UUID_PATTERN.test(formId)) return errorResponse(400, 'invalid_form_id');
    }
    if (body.payload.form_id !== undefined && body.payload.form_id !== formId) {
      return errorResponse(403, 'form_mismatch');
    }

    const tokenResponseId = typeof tokenData?.responseId === 'string' && UUID_PATTERN.test(tokenData.responseId)
      ? tokenData.responseId
      : null;
    const tokenSessionId = typeof tokenData?.sessionId === 'string' && UUID_PATTERN.test(tokenData.sessionId)
      ? tokenData.sessionId
      : null;
    if ((!tokenResponseId || !tokenSessionId) && !internalServiceRole) {
      return errorResponse(401, 'submission_token_missing_identifiers');
    }

    const completionRequested = isCompletionSubmissionRequest(
      body.kind,
      body.action,
      body.payload,
      internalServiceRole,
    );

    const admin = createClient(supabaseUrl, serviceKey);
    if (completionRequested) {
      const completionRateLimited = await enforcePublicSubmissionRateLimits(admin, req, {
        bucket: 'form-public-save-completion',
        formId,
        responseId: tokenResponseId || String(body.payload.response_id || ''),
        ipFormLimit: 600,
        ipFormWindowSeconds: 60,
        formGlobalLimit: 2_000,
        formGlobalWindowSeconds: 60,
        responseLimit: 20,
        responseWindowSeconds: 300,
        serviceRoleKey: serviceKey,
        responseHeaders: corsHeaders,
      });
      if (completionRateLimited) return completionRateLimited;
    }
    const rateLimited = await enforcePublicSubmissionRateLimits(admin, req, {
      bucket: 'form-public-save',
      formId,
      responseId: tokenResponseId || String(body.payload.response_id || ''),
      ipFormLimit: 10_000,
      ipFormWindowSeconds: 60,
      formGlobalLimit: 20_000,
      formGlobalWindowSeconds: 60,
      responseLimit: 600,
      responseWindowSeconds: 300,
      serviceRoleKey: serviceKey,
      responseHeaders: corsHeaders,
    });
    if (rateLimited) return rateLimited;

    let formQuery = admin
      .from('forms')
      .select('id, title, data')
      .eq('id', formId);
    if (!internalServiceRole) formQuery = formQuery.eq('status', 'published');
    const { data: formRow } = await formQuery.maybeSingle();
    if (!formRow) return errorResponse(404, 'form_not_available');
    const persistedPageCount = isPlainObject(formRow.data) && Array.isArray(formRow.data.pages)
      ? formRow.data.pages.filter(isPlainObject).length
      : 0;
    const maximumClientDurationMs = internalServiceRole
      ? 366 * 24 * 60 * 60 * 1_000
      : 25 * 60 * 60 * 1_000;

    let safePayload: Record<string, unknown>;
    let completionTimeOnPageMs: number | null = null;
    if (body.kind === 'response') {
      if (body.action !== 'upsert') return errorResponse(400, 'invalid_action');
      safePayload = pick(body.payload, [
        'response_id', 'session_id', 'answers', 'metadata', 'total_time_ms', 'pages_visited',
        'client_save_sequence',
      ]);
      safePayload.form_id = formId;
      if (typeof safePayload.response_id !== 'string' || !UUID_PATTERN.test(safePayload.response_id)) {
        return errorResponse(400, 'invalid_response_id');
      }
      if (tokenResponseId && safePayload.response_id !== tokenResponseId) {
        return errorResponse(403, 'response_mismatch');
      }
      if (safePayload.session_id !== null && safePayload.session_id !== undefined
        && (typeof safePayload.session_id !== 'string' || !UUID_PATTERN.test(safePayload.session_id))) {
        return errorResponse(400, 'invalid_session_id');
      }
      if (tokenSessionId && safePayload.session_id !== null && safePayload.session_id !== undefined
        && safePayload.session_id !== tokenSessionId) {
        return errorResponse(403, 'session_mismatch');
      }
      if (tokenSessionId) safePayload.session_id = tokenSessionId;
      if (!isPlainObject(safePayload.answers) || !isPlainObject(safePayload.metadata)) {
        return errorResponse(400, 'invalid_response_data');
      }
      if (safePayload.client_save_sequence !== undefined
        && !isBoundedNonNegativeInteger(safePayload.client_save_sequence, Number.MAX_SAFE_INTEGER)) {
        return errorResponse(400, 'invalid_client_save_sequence');
      }
      if (safePayload.total_time_ms !== undefined && safePayload.total_time_ms !== null
        && !isBoundedNonNegativeInteger(safePayload.total_time_ms, maximumClientDurationMs)) {
        return errorResponse(400, 'invalid_total_time_ms');
      }
      if (safePayload.pages_visited !== undefined && safePayload.pages_visited !== null
        && !isBoundedNonNegativeInteger(safePayload.pages_visited, persistedPageCount)) {
        return errorResponse(400, 'invalid_pages_visited');
      }
      if (body.payload.completion_time_on_page_ms !== undefined) {
        if (!isBoundedNonNegativeInteger(
          body.payload.completion_time_on_page_ms,
          maximumClientDurationMs,
        )) {
          return errorResponse(400, 'invalid_completion_time_on_page_ms');
        }
        completionTimeOnPageMs = Number(body.payload.completion_time_on_page_ms);
      }

      const validation = validateFormSubmission(
        formRow.data,
        safePayload.answers,
        safePayload.metadata,
        {
          completion: completionRequested,
          now: requestReceivedAt,
          serverUserAgent: requestUserAgent,
          responseId: typeof safePayload.response_id === 'string'
            ? safePayload.response_id
            : tokenResponseId || undefined,
        },
      );
      if (!validation.ok) return errorResponse(422, 'invalid_submission');

      const serverMetadata = validation.metadata;
      delete serverMetadata.status;
      delete serverMetadata.submitted_at;
      serverMetadata.status = completionRequested ? 'complete' : 'partial';
      if (completionRequested) serverMetadata.submitted_at = requestReceivedAt.toISOString();
      safePayload.answers = validation.answers;
      safePayload.metadata = serverMetadata;
      safePayload.completed_at = completionRequested
        ? String(serverMetadata.submitted_at)
        : null;
      if (!internalServiceRole && completionRequested && typeof serverMetadata.landed_at === 'string') {
        safePayload.total_time_ms = Math.max(
          0,
          requestReceivedAt.getTime() - Date.parse(serverMetadata.landed_at),
        );
      }

      if (!completionRequested && (formRow.data as any)?.savePartialResponses === false) {
        if ((formRow.data as any)?.allowResume === true) {
          const { data: stored, error: resumeError } = await admin.rpc(
            'persist_form_submission_resume',
            {
              p_form_id: formId,
              p_response_id: safePayload.response_id,
              p_session_id: safePayload.session_id,
              p_answers: await encryptStoredJson(safePayload.answers, encryptionSecret),
              p_metadata: await encryptStoredJson(safePayload.metadata, encryptionSecret),
              p_pages_visited: safePayload.pages_visited ?? 0,
              p_client_save_sequence: safePayload.client_save_sequence ?? 0,
              p_ttl: '2 hours',
            },
          );
          if (resumeError) {
            console.error('form_resume_state_persistence_error', resumeError.message || resumeError);
            return errorResponse(503, 'resume_state_save_failed');
          }
          return new Response(JSON.stringify({
            success: true,
            responseSaved: false,
            resumeSaved: stored === true,
            reason: 'partial_response_retained_for_resume_only',
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          reason: 'partial_responses_disabled',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (body.kind === 'session') {
      if (body.action !== 'insert' && body.action !== 'update') return errorResponse(400, 'invalid_action');
      safePayload = pick(body.payload, [
        'id', 'response_id', 'status', 'completed_at', 'last_seen_at', 'current_page_index',
        'pages_visited', 'total_pages', 'source_url', 'referrer', 'user_agent', 'query_params',
      ]);
      safePayload.form_id = formId;
      const sessionId = body.action === 'insert' ? safePayload.id : body.match?.id;
      if (typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) return errorResponse(400, 'invalid_session_id');
      if (tokenSessionId && sessionId !== tokenSessionId) return errorResponse(403, 'session_mismatch');
      if (body.action === 'insert'
        && (typeof safePayload.response_id !== 'string' || !UUID_PATTERN.test(safePayload.response_id))) {
        return errorResponse(400, 'invalid_response_id');
      }
      if (safePayload.response_id !== undefined
        && (typeof safePayload.response_id !== 'string' || !UUID_PATTERN.test(safePayload.response_id))) {
        return errorResponse(400, 'invalid_response_id');
      }
      if (tokenResponseId && safePayload.response_id !== undefined && safePayload.response_id !== tokenResponseId) {
        return errorResponse(403, 'response_mismatch');
      }
      if (body.action === 'insert') {
        if (tokenSessionId) safePayload.id = tokenSessionId;
        if (tokenResponseId) safePayload.response_id = tokenResponseId;
      } else {
        // A progress update may only mutate telemetry columns. Identity remains
        // fenced by the token-bound match and cannot be rewritten in payload.
        delete safePayload.id;
        delete safePayload.response_id;
      }
      const sessionIdentity = body.action === 'insert'
        ? pick(safePayload, ['id', 'response_id'])
        : {};
      const sessionTelemetry = sanitizePublicSessionTelemetry(
        safePayload,
        formRow.data,
        {
          action: body.action,
          trustedInternal: internalServiceRole,
          serverUserAgent: requestUserAgent,
          now: requestReceivedAt,
        },
      );
      if (!sessionTelemetry.ok) return errorResponse(422, 'invalid_session_data');
      safePayload = {
        ...sessionIdentity,
        ...sessionTelemetry.value,
        form_id: formId,
      };
    } else {
      if (body.action !== 'insert') return errorResponse(400, 'invalid_action');
      safePayload = pick(body.payload, [
        'session_id', 'response_id', 'page_id', 'page_index', 'page_title', 'event_type',
        'time_on_page_ms', 'hesitation_ms', 'interaction_count', 'answer_char_count',
      ]);
      safePayload.form_id = formId;
      if (typeof safePayload.response_id !== 'string' || !UUID_PATTERN.test(safePayload.response_id)) {
        return errorResponse(400, 'invalid_response_id');
      }
      if (tokenResponseId && safePayload.response_id !== tokenResponseId) {
        return errorResponse(403, 'response_mismatch');
      }
      if (safePayload.session_id !== null && safePayload.session_id !== undefined
        && (typeof safePayload.session_id !== 'string' || !UUID_PATTERN.test(safePayload.session_id))) {
        return errorResponse(400, 'invalid_session_id');
      }
      if (tokenSessionId && safePayload.session_id !== null && safePayload.session_id !== undefined
        && safePayload.session_id !== tokenSessionId) {
        return errorResponse(403, 'session_mismatch');
      }
      if (tokenSessionId) safePayload.session_id = tokenSessionId;
      const eventIdentity = pick(safePayload, ['session_id', 'response_id']);
      const eventTelemetry = sanitizePublicPageEventTelemetry(
        safePayload,
        formRow.data,
        internalServiceRole,
      );
      if (!eventTelemetry.ok) return errorResponse(422, 'invalid_event_data');
      safePayload = {
        ...eventIdentity,
        ...eventTelemetry.value,
        form_id: formId,
      };
    }

    // ── Encrypt sensitive fields for form_responses ──
    // Google Sheets gets plaintext (before encryption), DB gets ciphertext
    const originalPayload = { ...safePayload };

    if (body.kind === 'response' && encryptionSecret) {
      // Encrypt answers (JSONB → encrypted string)
      if (safePayload.answers !== undefined && safePayload.answers !== null) {
        safePayload.answers = await encryptStoredJson(safePayload.answers, encryptionSecret);
      }
      // Encrypt metadata (JSONB → encrypted string)
      if (safePayload.metadata !== undefined && safePayload.metadata !== null) {
        safePayload.metadata = await encryptStoredJson(safePayload.metadata, encryptionSecret);
      }
    }

    let error: any = null;
    if (body.kind === 'response' && safePayload.completed_at !== null) {
      let completionSessionId = typeof safePayload.session_id === 'string' && UUID_PATTERN.test(safePayload.session_id)
        ? safePayload.session_id
        : null;
      if (!completionSessionId) {
        const { data: existingSession } = await admin
          .from('form_sessions')
          .select('id')
          .eq('form_id', formId)
          .eq('response_id', String(safePayload.response_id))
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        completionSessionId = typeof existingSession?.id === 'string' ? existingSession.id : crypto.randomUUID();
      }
      safePayload.session_id = completionSessionId;
      const result = await admin.rpc('persist_completed_form_submission', {
        p_form_id: formId,
        p_response_id: safePayload.response_id,
        p_session_id: completionSessionId,
        p_answers: safePayload.answers,
        p_metadata: safePayload.metadata,
        p_completed_at: safePayload.completed_at,
        p_total_time_ms: safePayload.total_time_ms ?? null,
        p_pages_visited: safePayload.pages_visited ?? null,
        p_client_save_sequence: safePayload.client_save_sequence ?? null,
        p_completion_time_on_page_ms: completionTimeOnPageMs,
      });
      error = result.error;
    } else {
      const table = body.kind === 'session' ? 'form_sessions' : body.kind === 'event' ? 'form_page_events' : 'form_responses';
      let query: any = admin.from(table);

      if (body.action === 'insert') {
        query = query.insert(safePayload);
      } else if (body.action === 'upsert') {
        query = query.upsert(safePayload, { onConflict: 'form_id,response_id' });
      } else if (body.action === 'update') {
        query = query.update(safePayload).eq('id', body.match!.id).eq('form_id', formId);
      }

      const result = await query;
      error = result.error;
    }

    if (error) {
      console.error('form_public_save_persistence_error', error.message || error);
      return new Response(JSON.stringify({ success: false, error: 'save_failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACK completion after the immutable canonical row and every required outbox
    // job are durable. External availability never blocks the thank-you screen;
    // the server-side worker owns retries and dead-letter handling.
    const deliveries: Record<string, string> = {};
    let deliveryPending = false;
    if (body.kind === 'response' && completionRequested && originalPayload.form_id) {
        const responseId = String(originalPayload.response_id || '');
        const formData = formRow.data as any;
        // Fail closed if the committed encrypted row cannot be reloaded and
        // decrypted. A retry body is never treated as the canonical response.
        await loadCanonicalCompletedResponse(admin, formId, responseId, encryptionSecret);
        // Completion supersedes the temporary resume copy. Delete it before ACK
        // so sensitive draft data is not retained beyond its purpose.
        const { error: resumeCleanupError } = await admin
          .from('form_submission_resume_states')
          .delete()
          .eq('form_id', formId)
          .eq('response_id', responseId);
        if (resumeCleanupError) {
          console.error('form_resume_state_completion_cleanup_error', resumeCleanupError.message || resumeCleanupError);
          return errorResponse(503, 'resume_state_cleanup_failed');
        }
        const jobs: { type: CompletionDeliveryType; run: () => Promise<string> }[] = [];

        if (typeof formData?.googleSheetId === 'string' && formData.googleSheetId) {
          jobs.push({
            type: 'google_sheets',
            run: () => ensureResponseDeliveryQueued(
              admin,
              formId,
              responseId,
              'google_sheets',
              formData.googleSheetId,
            ),
          });
        }
        if (typeof formData?.completionWebhookUrl === 'string' && formData.completionWebhookUrl) {
          jobs.push({
            type: 'completion_webhook',
            run: () => ensureResponseDeliveryQueued(
              admin,
              formId,
              responseId,
              'completion_webhook',
              formData.completionWebhookUrl,
            ),
          });
        }

        const settled = await Promise.allSettled(jobs.map((job) => job.run()));
        const failures: string[] = [];
        settled.forEach((result, index) => {
          const type = jobs[index].type;
          if (result.status === 'fulfilled') {
            deliveries[type] = result.value === 'delivered' ? 'delivered' : 'queued';
            deliveryPending ||= result.value !== 'delivered';
          } else {
            const message = result.reason instanceof Error ? result.reason.message : 'delivery_enqueue_failed';
            deliveries[type] = 'enqueue_failed';
            failures.push(`${type}:${message}`);
            console.error(`${type}_delivery_enqueue_error`, message);
          }
        });

        if (failures.length > 0) {
          return new Response(JSON.stringify({
            success: false,
            responseSaved: true,
            error: 'completion_delivery_enqueue_failed',
            deliveries,
          }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
    }

    return new Response(JSON.stringify({
      success: true,
      responseSaved: body.kind === 'response',
      deliveries,
      deliveryPending,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    console.error('form_public_save_unhandled_error', message);
    return new Response(JSON.stringify({ success: false, error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
