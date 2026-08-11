import { fetchPublicHttps } from "./outboundHttp.ts";
import {
  isGoogleSheetsMutationAck,
  readResponseJsonLimited,
} from "./integrationReliability.ts";
import {
  buildGoogleSheetsResponseRow,
  buildGoogleSheetsSchema,
  chunkGoogleSheetsRows,
} from "./googleSheetsSchema.ts";
import { getGoogleAccessToken, googleApiFetch } from "./googleOAuth.ts";
import {
  type FormInterpolationVariable,
  resolveFormVariableValues,
} from "./formInterpolation.ts";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const REQUEST_TIMEOUT_MS = 8_000;
const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{10,256}$/;

export type CompletionDeliveryType = "google_sheets" | "completion_webhook";

export type CanonicalResponsePayload = {
  form_id: string;
  response_id: string;
  session_id?: string | null;
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  total_time_ms?: number | null;
  pages_visited?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type FormRecord = {
  id: string;
  title?: string | null;
  data?: Record<string, unknown> | null;
};

export function buildCompletionWebhookBody(
  form: FormRecord,
  payload: CanonicalResponsePayload,
): Record<string, unknown> {
  const configuredVariables = Array.isArray(form.data?.variables)
    ? form.data.variables as FormInterpolationVariable[]
    : [];
  const variables = resolveFormVariableValues(
    configuredVariables,
    payload.answers,
  );
  return {
    event: {
      type: "form_completed",
      form_id: form.id,
      form_title: form.title || "",
      response_id: payload.response_id,
      submitted_at: payload.completed_at || payload.metadata.submitted_at ||
        new Date().toISOString(),
    },
    answers: payload.answers,
    variables,
    metadata: payload.metadata,
  };
}

export async function fireCompletionWebhook(
  form: FormRecord,
  payload: CanonicalResponsePayload,
  destination?: string,
): Promise<void> {
  const configuredUrl = form.data?.completionWebhookUrl;
  const url = destination ||
    (typeof configuredUrl === "string" ? configuredUrl : "");
  if (!url) throw new Error("completion_webhook_not_configured");

  const response = await fetchPublicHttps(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `form-completed:${form.id}:${payload.response_id}`,
      "X-Forms-Event": "form_completed",
    },
    body: JSON.stringify(buildCompletionWebhookBody(form, payload)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`completion_webhook_failed:${response.status}`);
  }
}

/** Upsert one canonical completed response into the configured sheet. */
export async function appendToGoogleSheet(
  supabase: any,
  form: FormRecord,
  payload: CanonicalResponsePayload,
  destination?: string,
): Promise<void> {
  const formData = form.data || {};
  const configuredSheetId = formData.googleSheetId;
  const sheetId = destination ||
    (typeof configuredSheetId === "string" ? configuredSheetId : "");
  if (!sheetId) throw new Error("google_sheet_not_configured");
  if (!SHEET_ID_PATTERN.test(sheetId)) {
    throw new Error("invalid_spreadsheet_id");
  }

  const token = await getGoogleAccessToken(supabase);

  const sheetSchema = buildGoogleSheetsSchema(formData);
  const expectedHeaders = sheetSchema.headers;

  const encodedSheetId = encodeURIComponent(sheetId);
  const headerResponse = await googleApiFetch(
    token,
    `${SHEETS_API}/${encodedSheetId}/values/Respostas!1:1`,
  );
  if (!headerResponse.ok) {
    throw new Error(`google_sheet_header_read_failed:${headerResponse.status}`);
  }
  const headerData = await readResponseJsonLimited<Record<string, unknown>>(
    headerResponse,
    500_000,
  );
  const headerValues = Array.isArray(headerData.values)
    ? headerData.values
    : [];
  const currentHeaders = Array.isArray(headerValues[0]) ? headerValues[0] : [];
  if (JSON.stringify(currentHeaders) !== JSON.stringify(expectedHeaders)) {
    throw new Error("google_sheet_schema_mismatch:run_manual_sync");
  }

  const { data: rawSequence, error: sequenceError } = await supabase.rpc(
    "get_form_response_sheet_sequence",
    { p_form_id: form.id, p_response_id: payload.response_id },
  );
  const sequence = Number(rawSequence);
  if (
    sequenceError || !Number.isSafeInteger(sequence) || sequence < 1 ||
    sequence > 9_999_999
  ) throw new Error("google_sheet_sequence_lookup_failed");

  const sheetRow = sequence + 1;
  const targetResponse = await googleApiFetch(
    token,
    `${SHEETS_API}/${encodedSheetId}/values/Respostas!A${sheetRow}:B${sheetRow}`,
  );
  if (!targetResponse.ok) {
    throw new Error(`google_sheet_row_read_failed:${targetResponse.status}`);
  }
  const targetData = await readResponseJsonLimited<Record<string, unknown>>(
    targetResponse,
    100_000,
  );
  const targetValues = Array.isArray(targetData.values) &&
      Array.isArray(targetData.values[0])
    ? targetData.values[0] as unknown[]
    : [];
  const targetResponseId = String(targetValues[1] || "");
  if (targetResponseId && targetResponseId !== payload.response_id) {
    throw new Error("google_sheet_row_conflict:run_manual_sync");
  }

  const row = buildGoogleSheetsResponseRow(sheetSchema, {
    sequence,
    responseId: payload.response_id,
    answers: payload.answers,
    metadata: payload.metadata,
    totalTimeMs: payload.total_time_ms,
    createdAt: payload.created_at,
    completedAt: payload.completed_at,
  });
  chunkGoogleSheetsRows([row]);
  const writeResponse = await googleApiFetch(
    token,
    `${SHEETS_API}/${encodedSheetId}/values/Respostas!A${sheetRow}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    },
  );
  const writeAck = await readResponseJsonLimited(writeResponse, 200_000).catch(
    () => null,
  );
  if (!writeResponse.ok || !isGoogleSheetsMutationAck(writeAck, 1)) {
    throw new Error(
      writeResponse.ok
        ? "google_sheet_write_ack_missing"
        : `google_sheet_write_failed:${writeResponse.status}`,
    );
  }
}

export async function performCompletionDelivery(
  supabase: any,
  deliveryType: CompletionDeliveryType,
  destination: string,
  form: FormRecord,
  payload: CanonicalResponsePayload,
): Promise<void> {
  if (deliveryType === "google_sheets") {
    await appendToGoogleSheet(supabase, form, payload, destination);
    return;
  }
  if (deliveryType === "completion_webhook") {
    await fireCompletionWebhook(form, payload, destination);
    return;
  }
  throw new Error("unsupported_completion_delivery_type");
}
