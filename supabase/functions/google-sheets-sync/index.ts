import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireFormAccess } from "../_shared/auth.ts";
import { deliveryDestinationKey } from "../_shared/formResponseDeliveryQueue.ts";
import { readStoredJsonObject } from "../_shared/formResponseCrypto.ts";
import {
  buildGoogleSheetsResponseRow,
  buildGoogleSheetsSchema,
  chunkGoogleSheetsRows,
} from "../_shared/googleSheetsSchema.ts";
import {
  getGoogleAccessToken,
  googleApiFetch,
} from "../_shared/googleOAuth.ts";
import {
  claimGoogleSheetsSyncLease,
  releaseGoogleSheetsSyncLease,
  renewGoogleSheetsSyncLease,
} from "../_shared/googleSheetsSyncLease.ts";
import {
  isGoogleSheetsClearAck,
  isGoogleSheetsMutationAck,
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../_shared/integrationReliability.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { enforceProviderRequestRateLimits } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const MAX_REQUEST_BYTES = 150_000;
const RESPONSE_PAGE_SIZE = 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{10,256}$/;

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function boundedSheetTitle(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 200)
    : "Formulário";
}

async function writeRows(
  token: Awaited<ReturnType<typeof getGoogleAccessToken>>,
  spreadsheetId: string,
  startRow: number,
  rows: Array<Array<string | number>>,
  renew?: () => Promise<void>,
): Promise<number> {
  const encodedSpreadsheetId = encodeURIComponent(spreadsheetId);
  let rowNumber = startRow;
  for (const batch of chunkGoogleSheetsRows(rows)) {
    if (renew) await renew();
    const response = await googleApiFetch(
      token,
      `${SHEETS_API}/${encodedSpreadsheetId}/values/Respostas!A${rowNumber}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: batch }),
      },
    );
    const ack = await readResponseJsonLimited(response, 200_000).catch(() =>
      null
    );
    if (!response.ok || !isGoogleSheetsMutationAck(ack, batch.length)) {
      throw new Error(
        response.ok
          ? "google_sheet_write_ack_missing"
          : `google_sheet_write_failed:${response.status}`,
      );
    }
    rowNumber += batch.length;
  }
  return rowNumber;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(503, { error: "server_configuration_missing" });
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const parsedBody = await readLimitedJsonObject(
      req,
      MAX_REQUEST_BYTES,
      corsHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const { action, formId, spreadsheetId } = body;

    if (!formId || typeof formId !== "string" || !UUID_PATTERN.test(formId)) {
      return jsonResponse(400, { error: "invalid_form_id" });
    }
    if (action !== "create" && action !== "sync") {
      return jsonResponse(400, { error: "invalid_action" });
    }
    const caller = await requireFormAccess(req, formId);
    if (!caller.ok) return caller.response;

    const rateLimited = await enforceProviderRequestRateLimits(
      caller.admin,
      req,
      {
        bucket: "google-sheets-sync",
        ipLimit: 300,
        ipWindowSeconds: 60,
        providerScope: `google-sheets:${action}`,
        providerLimit: action === "create" ? 30 : 60,
        providerWindowSeconds: 60,
        subjectScope: `${caller.userId}:${formId}:${action}`,
        subjectLimit: action === "create" ? 5 : 2,
        subjectWindowSeconds: action === "create" ? 3_600 : 60,
        responseHeaders: corsHeaders,
      },
    );
    if (rateLimited) return rateLimited;

    const { data: formRow, error: formError } = await supabase
      .from("forms")
      .select("title, data")
      .eq("id", formId)
      .single();
    if (formError || !formRow) throw new Error("form_not_found");
    const formData = formRow.data && typeof formRow.data === "object" &&
        !Array.isArray(formRow.data)
      ? formRow.data as Record<string, unknown>
      : {};
    const sheetSchema = buildGoogleSheetsSchema(formData);
    const token = await getGoogleAccessToken(supabase);

    if (action === "create") {
      const createResponse = await googleApiFetch(token, SHEETS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: {
            title: `Respostas — ${boundedSheetTitle(formRow.title)}`,
          },
          sheets: [{ properties: { title: "Respostas", index: 0 } }],
        }),
      });
      const sheet = await readResponseJsonLimited<Record<string, unknown>>(
        createResponse,
        500_000,
      ).catch((): Record<string, unknown> => ({}));
      if (!createResponse.ok) {
        throw new Error(`google_sheet_create_failed:${createResponse.status}`);
      }

      const createdSpreadsheetId = typeof sheet.spreadsheetId === "string" &&
          SHEET_ID_PATTERN.test(sheet.spreadsheetId)
        ? sheet.spreadsheetId
        : "";
      const spreadsheetUrl = typeof sheet.spreadsheetUrl === "string"
        ? sheet.spreadsheetUrl
        : "";
      if (!createdSpreadsheetId || !spreadsheetUrl) {
        throw new Error("google_sheet_create_ack_missing");
      }

      try {
        await writeRows(
          token,
          createdSpreadsheetId,
          1,
          [sheetSchema.headers],
        );
      } catch (error) {
        // A sheet without its canonical header can never be used safely by the
        // worker. Best-effort cleanup uses the drive.file scope requested by OAuth.
        await googleApiFetch(
          token,
          `${DRIVE_API}/${encodeURIComponent(createdSpreadsheetId)}`,
          { method: "DELETE" },
        ).then((response) => response.body?.cancel().catch(() => undefined))
          .catch(() => undefined);
        throw error;
      }

      return jsonResponse(200, {
        spreadsheetId: createdSpreadsheetId,
        spreadsheetUrl,
      });
    }

    if (
      typeof spreadsheetId !== "string" ||
      !SHEET_ID_PATTERN.test(spreadsheetId)
    ) return jsonResponse(400, { error: "invalid_spreadsheet_id" });
    if (formData.googleSheetId !== spreadsheetId) {
      return jsonResponse(409, { error: "google_sheet_not_connected_to_form" });
    }

    const destinationKey = await deliveryDestinationKey(
      "google_sheets",
      spreadsheetId,
    );
    const leaseToken = await claimGoogleSheetsSyncLease(
      supabase,
      destinationKey,
    );
    if (!leaseToken) {
      return jsonResponse(409, { error: "google_sheet_sync_in_progress" });
    }

    try {
      // A worker that claimed immediately before this lease remains fenced by
      // its processing row. Returning 409 is safer than racing its provider I/O.
      const { count: activeWorkers, error: workerLookupError } = await supabase
        .from("form_response_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("delivery_type", "google_sheets")
        .eq("destination_key", destinationKey)
        .eq("status", "processing")
        .gt("lease_until", new Date().toISOString());
      if (workerLookupError) {
        throw new Error("google_sheet_worker_state_lookup_failed");
      }
      if ((activeWorkers || 0) > 0) {
        return jsonResponse(409, {
          error: "google_sheet_delivery_in_progress",
        });
      }

      const renew = () =>
        renewGoogleSheetsSyncLease(supabase, destinationKey, leaseToken);
      let nextSheetRow = await writeRows(
        token,
        spreadsheetId,
        1,
        [sheetSchema.headers],
        renew,
      );
      let rowsWritten = 0;
      let snapshotCreatedAt: string | null = null;
      const { data: snapshotRow, error: snapshotError } = await supabase
        .from("form_responses")
        .select("created_at")
        .eq("form_id", formId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapshotError) throw new Error("google_sheet_snapshot_failed");
      snapshotCreatedAt = typeof snapshotRow?.created_at === "string"
        ? snapshotRow.created_at
        : null;

      if (snapshotCreatedAt) {
        for (let from = 0;; from += RESPONSE_PAGE_SIZE) {
          const { data: responsePage, error: responsesError } = await supabase
            .from("form_responses")
            .select(
              "id, response_id, answers, metadata, total_time_ms, pages_visited, created_at, completed_at",
            )
            .eq("form_id", formId)
            .lte("created_at", snapshotCreatedAt)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + RESPONSE_PAGE_SIZE - 1);
          if (responsesError) {
            throw new Error("google_sheet_response_page_failed");
          }
          const page = responsePage || [];
          if (page.length === 0) break;

          const encryptionSecret = Deno.env.get("ENCRYPTION_SECRET") ?? "";
          const rows: Array<Array<string | number>> = [];
          for (const [index, response] of page.entries()) {
            const answers = await readStoredJsonObject(
              response.answers,
              encryptionSecret,
              "answers",
            );
            const metadata = response.metadata == null
              ? {}
              : await readStoredJsonObject(
                response.metadata,
                encryptionSecret,
                "metadata",
              );
            rows.push(buildGoogleSheetsResponseRow(sheetSchema, {
              sequence: rowsWritten + index + 1,
              responseId: response.response_id,
              answers,
              metadata,
              totalTimeMs: response.total_time_ms,
              createdAt: response.created_at,
              completedAt: response.completed_at,
            }));
          }
          nextSheetRow = await writeRows(
            token,
            spreadsheetId,
            nextSheetRow,
            rows,
            renew,
          );
          rowsWritten += page.length;
          if (page.length < RESPONSE_PAGE_SIZE) break;
        }
      }

      // Never clear before every canonical replacement batch is acknowledged.
      await renew();
      const clearResponse = await googleApiFetch(
        token,
        `${SHEETS_API}/${
          encodeURIComponent(spreadsheetId)
        }/values/Respostas!A${nextSheetRow}:ZZ:clear`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const clearAck = await readResponseJsonLimited(clearResponse, 200_000)
        .catch(() => null);
      if (!clearResponse.ok || !isGoogleSheetsClearAck(clearAck)) {
        throw new Error(
          clearResponse.ok
            ? "google_sheet_clear_ack_missing"
            : `google_sheet_clear_failed:${clearResponse.status}`,
        );
      }

      if (snapshotCreatedAt) {
        const { data: acknowledged, error: ledgerError } = await supabase.rpc(
          "ack_google_sheets_manual_sync",
          {
            p_form_id: formId,
            p_destination_key: destinationKey,
            p_destination: spreadsheetId,
            p_snapshot_created_at: snapshotCreatedAt,
            p_lease_token: leaseToken,
          },
        );
        const acknowledgedRows = Number(acknowledged);
        if (
          ledgerError || !Number.isSafeInteger(acknowledgedRows) ||
          acknowledgedRows < 0
        ) throw new Error("google_sheet_delivery_ledger_ack_failed");
      }

      return jsonResponse(200, { success: true, rowsWritten });
    } finally {
      const released = await releaseGoogleSheetsSyncLease(
        supabase,
        destinationKey,
        leaseToken,
      );
      if (!released) {
        console.error("google_sheet_sync_lease_release_failed", destinationKey);
      }
    }
  } catch (error: unknown) {
    const errorCode = safeIntegrationErrorCode(
      error,
      "google_sheets_sync_failed",
    );
    console.error("google_sheets_sync_error", errorCode);
    return jsonResponse(500, { error: errorCode });
  }
});
