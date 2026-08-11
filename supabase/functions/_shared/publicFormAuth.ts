import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySignedState } from "./signedState.ts";
export {
  interpolateFormHtml,
  interpolateFormText,
} from "./formInterpolation.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

type PublicFormContext = {
  ok: true;
  // The esm.sh Supabase generic signature varies across Deno/TypeScript
  // releases; callers only rely on the runtime client surface here.
  admin: any;
  formData: any;
  submissionState: {
    formId: string;
    responseId: string;
    sessionId: string;
  } | null;
};
type Rejected = { ok: false; response: Response };

function reject(status: number, error: string): Rejected {
  return {
    ok: false,
    response: new Response(JSON.stringify({ success: false, error }), {
      status,
      headers,
    }),
  };
}

export function isServiceRequest(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return !!serviceKey &&
    req.headers.get("authorization") === `Bearer ${serviceKey}`;
}

export async function getPublicFormContext(
  req: Request,
  formId: unknown,
  submissionToken: unknown,
  responseId?: unknown,
): Promise<PublicFormContext | Rejected> {
  if (typeof formId !== "string" || !UUID_PATTERN.test(formId)) {
    return reject(400, "invalid_form_id");
  }
  let submissionState: PublicFormContext["submissionState"] = null;
  if (!isServiceRequest(req)) {
    const state = typeof submissionToken === "string"
      ? await verifySignedState(submissionToken)
      : null;
    if (state?.kind !== "form-submission" || state.formId !== formId) {
      return reject(401, "invalid_or_expired_token");
    }
    if (
      typeof responseId !== "string" || !UUID_PATTERN.test(responseId) ||
      state.responseId !== responseId
    ) {
      return reject(403, "response_mismatch");
    }
    if (typeof state.sessionId !== "string" || !UUID_PATTERN.test(state.sessionId)) {
      return reject(403, "session_mismatch");
    }
    submissionState = {
      formId,
      responseId,
      sessionId: state.sessionId,
    };
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data: row } = await admin.from("forms").select("status, data").eq(
    "id",
    formId,
  ).maybeSingle();
  if (!row || (!isServiceRequest(req) && row.status !== "published")) {
    return reject(404, "form_not_available");
  }
  return { ok: true, admin, formData: row.data as any, submissionState };
}

export function flattenFormElements(elements: any[] = []): any[] {
  return elements.flatMap((element: any) => [
    element,
    ...(element?.type === "columns"
      ? (element.columnData || []).flatMap((column: any) =>
        flattenFormElements(column?.elements || [])
      )
      : []),
  ]);
}
