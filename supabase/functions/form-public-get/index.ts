import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateAndRateLimitPublicFormGet } from '../_shared/rateLimit.ts';
import { rejectUnsupportedHttpMethod } from '../_shared/httpMethod.ts';
import { readLimitedJsonObject } from '../_shared/limitedJsonBody.ts';
import { createSignedState, verifySignedState } from '../_shared/signedState.ts';
import {
  buildSubmissionResumeSnapshot,
  createSubmissionTokenState,
  readResumedSubmissionIdentity,
  selectStoredSubmissionResumeCandidate,
} from '../_shared/submissionResume.ts';
import { omitAdminOnlyPublicFormFields } from '../_shared/publicFormProjection.ts';
import { readStoredJsonObject } from '../_shared/formResponseCrypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-resume-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // Workflow data must always be fresh; stale caches can break routing and submit too early
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Vary': 'Accept-Encoding',
};
const MAX_REQUEST_BYTES = 4_096;
const SUBMISSION_TOKEN_TTL_SECONDS = 2 * 60 * 60;

/**
 * Lightweight public form delivery endpoint.
 * Returns ONLY the fields needed for rendering the form —
 * strips admin-only metadata, reduces payload size by ~40%.
 *
 * GET /form-public-get?id=<uuid>
 * POST /form-public-get { id: "<uuid>" }
 */
Deno.serve(async (req) => {
  const methodNotAllowed = rejectUnsupportedHttpMethod(
    req,
    ['GET', 'POST', 'OPTIONS'],
    corsHeaders,
  );
  if (methodNotAllowed) return methodNotAllowed;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let formId: string | null = null;
    let resumeToken: string | null = req.headers.get('x-form-resume-token');

    if (req.method === 'GET') {
      const url = new URL(req.url);
      formId = url.searchParams.get('id');
    } else {
      const parsedBody = await readLimitedJsonObject(req, MAX_REQUEST_BYTES, corsHeaders);
      if (!parsedBody.ok) return parsedBody.response;
      const body = parsedBody.value;
      formId = typeof body.id === 'string' ? body.id : null;
      if (!resumeToken && typeof body?.resumeToken === 'string') resumeToken = body.resumeToken;
    }

    // Parse and validate first so malformed traffic cannot consume a shared
    // corporate-NAT bucket. The scope is IP + form, not IP alone.
    const access = await validateAndRateLimitPublicFormGet(
      supabase, req, formId, serviceKey, corsHeaders,
    );
    if (access.response) return access.response;
    formId = access.formId;

    // First try published/closed
    const [{ data, error }, { data: brandRow }] = await Promise.all([
      supabase
        .from('forms')
        .select('id, title, status, data')
        .eq('id', formId)
        .in('status', ['published', 'closed'])
        .single(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'brand')
        .maybeSingle(),
    ]);

    if (error || !data) {
      // Check if form exists but is draft/archived — return notFoundRedirectUrl if configured
      const { data: draftData } = await supabase
        .from('forms')
        .select('data')
        .eq('id', formId)
        .single();

      if (draftData?.data) {
        const d = draftData.data as Record<string, unknown>;
        const redirectUrl = d.notFoundRedirectUrl as string | undefined;
        if (redirectUrl) {
          return new Response(JSON.stringify({ error: 'Form not available', redirectUrl }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ error: 'Form not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Strip admin-only fields from the data blob to minimize payload
    const d = data.data as Record<string, unknown>;
    
    // Destinations for completion delivery and linked spreadsheet identifiers
    // stay server-side; none are needed by the respondent renderer.
    const cleaned = omitAdminOnlyPublicFormFields(d);
    const publicBrand = brandRow?.value && typeof brandRow.value === 'object' && !Array.isArray(brandRow.value)
      ? brandRow.value as Record<string, unknown>
      : {};
    cleaned.brand = {
      productName: typeof publicBrand.productName === 'string' ? publicBrand.productName.slice(0, 80) : 'Forms',
      ownerName: typeof publicBrand.ownerName === 'string' ? publicBrand.ownerName.slice(0, 120) : 'Leonardo Scapinello',
      description: typeof publicBrand.description === 'string' ? publicBrand.description.slice(0, 320) : '',
      logoUrl: typeof publicBrand.logoUrl === 'string' ? publicBrand.logoUrl.slice(0, 2_048) : '/images/brand-icon.svg',
      faviconUrl: typeof publicBrand.faviconUrl === 'string' ? publicBrand.faviconUrl.slice(0, 2_048) : '/images/brand-favicon.svg',
    };
    // Webhook destinations, headers and test payloads stay server-side. The
    // public runtime only needs node identity and response mappings; pixel-event
    // resolves the authoritative configuration from the database.
    if (Array.isArray(d.integrationNodes)) {
      cleaned.integrationNodes = d.integrationNodes.map((node: any) => ({
        id: node.id,
        platform: node.platform,
        responseMappings: node.responseMappings,
        fireOnce: node.fireOnce,
      }));
    }
    if (Array.isArray(d.whatsappNodes)) {
      cleaned.whatsappNodes = d.whatsappNodes.map((node: any) => ({ id: node.id, fireOnce: node.fireOnce }));
    }
    if (Array.isArray(d.emailNodes)) {
      cleaned.emailNodes = d.emailNodes.map((node: any) => ({ id: node.id, fireOnce: node.fireOnce }));
    }
    if (Array.isArray(d.aiNodes)) {
      cleaned.aiNodes = d.aiNodes.map((node: any) => ({
        id: node.id,
        outputVariableId: node.outputVariableId,
        executionMode: node.executionMode,
        fireOnce: node.fireOnce,
      }));
    }
    let resumed = false;
    let resumeSnapshot: ReturnType<typeof buildSubmissionResumeSnapshot> | null = null;
    let responseId: string;
    let sessionId: string;
    if (resumeToken && d.allowResume === true) {
      const resumeState = await verifySignedState(resumeToken);
      const identity = readResumedSubmissionIdentity(resumeState, data.id, true);
      if (!identity) {
        return new Response(JSON.stringify({ error: 'invalid_resume_token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      responseId = identity.responseId;
      sessionId = identity.sessionId;

      const [
        { data: response, error: responseError },
        { data: session, error: sessionError },
        { data: transientResume, error: transientResumeError },
      ] = await Promise.all([
        supabase
          .from('form_responses')
          .select('answers, metadata, pages_visited, completed_at, client_save_sequence, updated_at')
          .eq('form_id', data.id)
          .eq('response_id', responseId)
          .maybeSingle(),
        supabase
          .from('form_sessions')
          .select('current_page_index, pages_visited')
          .eq('form_id', data.id)
          .eq('id', sessionId)
          .eq('response_id', responseId)
          .maybeSingle(),
        supabase
          .from('form_submission_resume_states')
          .select('answers, metadata, pages_visited, client_save_sequence, updated_at')
          .eq('form_id', data.id)
          .eq('response_id', responseId)
          .eq('session_id', sessionId)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle(),
      ]);
      if (responseError || sessionError || transientResumeError) {
        return new Response(JSON.stringify({ error: 'resume_state_unavailable' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '5' },
        });
      }
      // A completed lead is immutable and must never be reopened by a stale
      // browser credential. The client discards it and requests a fresh form.
      if (response?.completed_at) {
        return new Response(JSON.stringify({ error: 'invalid_resume_token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let canonicalAnswers: Record<string, unknown> = {};
      let canonicalMetadata: Record<string, unknown> = {};
      const selection = selectStoredSubmissionResumeCandidate(
        response ? {
          source: 'response',
          state: {
            answers: response.answers,
            metadata: response.metadata,
            pages_visited: response.pages_visited,
          },
          clientSaveSequence: response.client_save_sequence,
          updatedAt: response.updated_at,
        } : null,
        transientResume ? {
          source: 'transient',
          state: {
            answers: transientResume.answers,
            metadata: transientResume.metadata,
            pages_visited: transientResume.pages_visited,
          },
          clientSaveSequence: transientResume.client_save_sequence,
          updatedAt: transientResume.updated_at,
        } : null,
      );
      if (!selection.ok) {
        console.error('form resume state selection failed', selection.error);
        return new Response(JSON.stringify({ error: 'resume_state_conflict' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const canonicalState = selection.candidate?.state ?? null;
      if (canonicalState) {
        const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
        try {
          canonicalAnswers = await readStoredJsonObject(canonicalState.answers, encryptionSecret, 'answers');
          if (canonicalState.metadata !== null && canonicalState.metadata !== undefined) {
            canonicalMetadata = await readStoredJsonObject(canonicalState.metadata, encryptionSecret, 'metadata');
          }
        } catch (error) {
          console.error(
            'form resume state decryption failed',
            error instanceof Error ? error.message : 'unknown_resume_decryption_error',
          );
          return new Response(JSON.stringify({ error: 'resume_state_unavailable' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '5' },
          });
        }
      }
      const pageIndex = canonicalMetadata.last_page_index ?? session?.current_page_index ?? 0;
      const pagesVisited = Math.max(
        Number(canonicalState?.pages_visited) || 0,
        Number(session?.pages_visited) || 0,
      );
      resumeSnapshot = buildSubmissionResumeSnapshot(
        d,
        canonicalAnswers,
        pageIndex,
        Math.max(Number(pageIndex) || 0, pagesVisited - 1),
      );
      resumed = true;
    } else {
      responseId = crypto.randomUUID();
      sessionId = crypto.randomUUID();
    }
    cleaned.submissionResponseId = responseId;
    cleaned.submissionSessionId = sessionId;
    cleaned.submissionResumed = resumed;
    if (resumeSnapshot) cleaned.submissionResumeState = resumeSnapshot;
    cleaned.submissionToken = await createSignedState(
      createSubmissionTokenState(data.id, { responseId, sessionId }),
      SUBMISSION_TOKEN_TTL_SECONDS,
    );

    const result = {
      id: data.id,
      title: data.title,
      status: data.status,
      data: cleaned,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
