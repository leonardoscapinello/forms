import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type CanonicalResponsePayload,
  performCompletionDelivery,
} from "../_shared/completionDeliveries.ts";
import { loadCanonicalCompletedResponse } from "../_shared/canonicalFormResponse.ts";
import {
  DELIVERY_MAX_ATTEMPTS,
  deliveryDestinationKey,
  type DeliveryRow,
  markResponseDeliveryDelivered,
  markResponseDeliveryFailed,
} from "../_shared/formResponseDeliveryQueue.ts";
import { isGoogleSheetsSyncLeaseActive } from "../_shared/googleSheetsSyncLease.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";

const DEFAULT_BATCH_SIZE = 10;
const MAX_REQUEST_BYTES = 1_024;
// Keep at most two provider-call waves inside the 120-second lease. A Sheets
// delivery can make several bounded network calls, so a batch of 25 had no
// safe margin before a second worker could reclaim the same job.
const MAX_BATCH_SIZE = 10;
const WORKER_LEASE_SECONDS = 120;
const PROCESSING_CONCURRENCY = 5;

type WorkerResult = {
  id: string;
  type: string;
  status: "delivered" | "failed" | "dead_letter";
  error?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
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

function isAuthorizedWorkerRequest(
  req: Request,
  serviceRoleKey: string,
  workerSecret: string,
): boolean {
  const authorization = req.headers.get("Authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const suppliedSecret = req.headers.get("x-delivery-worker-secret") || "";
  return Boolean(
    (serviceRoleKey && bearerToken &&
      constantTimeEqual(bearerToken, serviceRoleKey)) ||
      (workerSecret && suppliedSecret &&
        constantTimeEqual(suppliedSecret, workerSecret)),
  );
}

function currentConfiguredDestination(
  formData: Record<string, unknown>,
  row: DeliveryRow,
): string {
  const value = row.delivery_type === "google_sheets"
    ? formData.googleSheetId
    : formData.completionWebhookUrl;
  return typeof value === "string" ? value : "";
}

function isPermanentDeliveryFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return [
    "canonical_response_not_completed",
    "canonical_response_missing",
    "canonical_form_missing",
    "delivery_destination_missing",
    "delivery_destination_mismatch",
    "unsupported_completion_delivery_type",
    "invalid_url",
    "https_required",
    "url_credentials_not_allowed",
    "reserved_hostname",
    "reserved_ip_address",
    "dns_resolved_to_reserved_address",
    "too_many_redirects",
    "encrypted_value_",
    "answers_",
    "metadata_",
    "google_sheet_row_too_large",
  ].some((prefix) => message.startsWith(prefix));
}

async function resolveDestination(
  formData: Record<string, unknown>,
  row: DeliveryRow,
): Promise<string> {
  const destination = row.destination ||
    currentConfiguredDestination(formData, row);
  if (!destination) throw new Error("delivery_destination_missing");
  const expectedKey = await deliveryDestinationKey(
    row.delivery_type,
    destination,
  );
  if (!constantTimeEqual(expectedKey, row.destination_key)) {
    throw new Error("delivery_destination_mismatch");
  }
  return destination;
}

async function loadCanonicalDeliveryData(
  admin: any,
  row: DeliveryRow,
  encryptionSecret: string,
): Promise<{
  form: { id: string; title?: string | null; data: Record<string, unknown> };
  payload: CanonicalResponsePayload;
  destination: string;
}> {
  const [{ data: form, error: formError }, payload] = await Promise.all([
    admin.from("forms").select("id, title, data").eq("id", row.form_id)
      .maybeSingle(),
    loadCanonicalCompletedResponse(
      admin,
      row.form_id,
      row.response_id,
      encryptionSecret,
    ),
  ]);
  if (formError) {
    throw new Error(`canonical_form_lookup_failed:${formError.message}`);
  }
  if (!form) throw new Error("canonical_form_missing");
  const formData =
    form.data && typeof form.data === "object" && !Array.isArray(form.data)
      ? form.data as Record<string, unknown>
      : {};
  const destination = await resolveDestination(formData, row);

  return {
    form: { id: form.id, title: form.title, data: formData },
    destination,
    payload,
  };
}

async function processDelivery(
  admin: any,
  row: DeliveryRow,
  encryptionSecret: string,
): Promise<WorkerResult> {
  try {
    const { form, payload, destination } = await loadCanonicalDeliveryData(
      admin,
      row,
      encryptionSecret,
    );
    // The SQL claim skips leased sheets; this final check closes the race where
    // a manual sync acquires its lease after this delivery batch was claimed.
    if (
      row.delivery_type === "google_sheets" &&
      await isGoogleSheetsSyncLeaseActive(admin, row.destination_key)
    ) throw new Error("google_sheet_manual_sync_active");
    await performCompletionDelivery(
      admin,
      row.delivery_type,
      destination,
      form,
      payload,
    );
    await markResponseDeliveryDelivered(admin, row);
    return { id: row.id, type: row.delivery_type, status: "delivered" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let status: "failed" | "dead_letter" = "failed";
    try {
      status = await markResponseDeliveryFailed(admin, row, error, {
        permanentlyFailed: isPermanentDeliveryFailure(error),
      });
    } catch (markError) {
      console.error("delivery_worker_mark_failure_error", row.id, markError);
    }
    console.error(
      "delivery_worker_delivery_error",
      row.id,
      row.delivery_type,
      message,
    );
    return {
      id: row.id,
      type: row.delivery_type,
      status,
      error: message.slice(0, 300),
    };
  }
}

async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  process: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function consume(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await process(items[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => consume(),
    ),
  );
  return results;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const workerSecret = Deno.env.get("DELIVERY_WORKER_SECRET") || "";
  const encryptionSecret = Deno.env.get("ENCRYPTION_SECRET") || "";
  if (!supabaseUrl || !serviceRoleKey || !encryptionSecret) {
    return jsonResponse(503, { error: "worker_configuration_missing" });
  }
  if (!isAuthorizedWorkerRequest(req, serviceRoleKey, workerSecret)) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  // Authentication deliberately happens before consuming the request body so
  // unauthenticated callers cannot spend memory/CPU on JSON parsing.
  const parsedBody = await readLimitedJsonObject(
    req,
    MAX_REQUEST_BYTES,
    { "Cache-Control": "no-store" },
    { allowEmptyObject: true },
  );
  if (!parsedBody.ok) return parsedBody.response;

  const requestedBatchSize = parsedBody.value.batchSize ?? DEFAULT_BATCH_SIZE;
  if (
    typeof requestedBatchSize !== "number" ||
    !Number.isFinite(requestedBatchSize)
  ) {
    return jsonResponse(400, { error: "invalid_batch_size" });
  }
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Math.floor(requestedBatchSize)),
  );
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("claim_form_response_deliveries", {
    p_batch_size: batchSize,
    p_lease_seconds: WORKER_LEASE_SECONDS,
    p_max_attempts: DELIVERY_MAX_ATTEMPTS,
  });
  if (error) {
    console.error("delivery_worker_claim_error", error.message);
    return jsonResponse(500, { error: "delivery_claim_failed" });
  }

  const deliveries = Array.isArray(data) ? data as DeliveryRow[] : [];
  const results = await processWithConcurrency(
    deliveries,
    PROCESSING_CONCURRENCY,
    (delivery) => processDelivery(admin, delivery, encryptionSecret),
  );
  const delivered = results.filter((result) =>
    result.status === "delivered"
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;
  const deadLetter =
    results.filter((result) => result.status === "dead_letter").length;

  return jsonResponse(200, {
    success: true,
    claimed: deliveries.length,
    delivered,
    failed,
    deadLetter,
    results,
  });
});
