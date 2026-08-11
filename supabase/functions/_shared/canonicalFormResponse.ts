import type { CanonicalResponsePayload } from "./completionDeliveries.ts";
import { readStoredJsonObject } from "./formResponseCrypto.ts";

/**
 * Reloads the immutable completed response and decrypts it server-side.
 * External integrations must use this value, never a retry request body.
 */
export async function loadCanonicalCompletedResponse(
  supabase: any,
  formId: string,
  responseId: string,
  encryptionSecret: string,
): Promise<CanonicalResponsePayload> {
  const { data: response, error } = await supabase
    .from("form_responses")
    .select(
      "form_id, response_id, session_id, answers, metadata, total_time_ms, pages_visited, created_at, completed_at",
    )
    .eq("form_id", formId)
    .eq("response_id", responseId)
    .maybeSingle();
  if (error) {
    throw new Error(`canonical_response_lookup_failed:${error.message}`);
  }
  if (!response) throw new Error("canonical_response_missing");
  if (!response.completed_at) {
    throw new Error("canonical_response_not_completed");
  }

  return {
    form_id: response.form_id,
    response_id: response.response_id,
    session_id: response.session_id,
    answers: await readStoredJsonObject(
      response.answers,
      encryptionSecret,
      "answers",
    ),
    metadata: await readStoredJsonObject(
      response.metadata,
      encryptionSecret,
      "metadata",
    ),
    total_time_ms: response.total_time_ms,
    pages_visited: response.pages_visited,
    created_at: response.created_at,
    completed_at: response.completed_at,
  };
}
