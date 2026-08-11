import {
  claimGoogleSheetsSyncLease,
  isGoogleSheetsSyncLeaseActive,
  releaseGoogleSheetsSyncLease,
  renewGoogleSheetsSyncLease,
} from "./googleSheetsSyncLease.ts";

function assert(
  condition: unknown,
  message = "assertion_failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function mockRpc(
  responses: Array<{ data: unknown; error: unknown }>,
): { client: any; calls: Array<{ name: string; args: unknown }> } {
  const calls: Array<{ name: string; args: unknown }> = [];
  return {
    calls,
    client: {
      rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return Promise.resolve(
          responses.shift() || { data: null, error: null },
        );
      },
    },
  };
}

const DESTINATION_KEY = `google_sheets:${"a".repeat(64)}`;
const LEASE_TOKEN = "10000000-0000-4000-8000-000000000001";

Deno.test("Sheets lease helpers preserve fencing tokens across claim, renew and release", async () => {
  const { client, calls } = mockRpc([
    { data: LEASE_TOKEN, error: null },
    { data: true, error: null },
    { data: true, error: null },
    { data: true, error: null },
  ]);

  assert(
    await claimGoogleSheetsSyncLease(client, DESTINATION_KEY) === LEASE_TOKEN,
  );
  await renewGoogleSheetsSyncLease(client, DESTINATION_KEY, LEASE_TOKEN);
  assert(await isGoogleSheetsSyncLeaseActive(client, DESTINATION_KEY));
  assert(
    await releaseGoogleSheetsSyncLease(client, DESTINATION_KEY, LEASE_TOKEN),
  );
  assert(
    calls.map((call) => call.name).join(",") === [
      "claim_google_sheets_sync_lease",
      "renew_google_sheets_sync_lease",
      "is_google_sheets_sync_lease_active",
      "release_google_sheets_sync_lease",
    ].join(","),
  );
  assert(
    (calls[1].args as Record<string, unknown>).p_lease_token === LEASE_TOKEN,
  );
});

Deno.test("Sheets lease helpers fail closed on malformed RPC acknowledgements", async () => {
  const { client } = mockRpc([
    { data: "not-a-token", error: null },
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: { message: "db unavailable" } },
  ]);
  assert(await claimGoogleSheetsSyncLease(client, DESTINATION_KEY) === null);

  let renewRejected = false;
  try {
    await renewGoogleSheetsSyncLease(client, DESTINATION_KEY, LEASE_TOKEN);
  } catch (error) {
    renewRejected = error instanceof Error &&
      error.message === "google_sheet_sync_lease_lost";
  }
  assert(renewRejected, "renew must reject a missing fencing ACK");

  let activeRejected = false;
  try {
    await isGoogleSheetsSyncLeaseActive(client, DESTINATION_KEY);
  } catch (error) {
    activeRejected = error instanceof Error &&
      error.message === "google_sheet_sync_lease_check_failed";
  }
  assert(activeRejected, "lease read errors must pause provider I/O");
  assert(
    !(await releaseGoogleSheetsSyncLease(
      client,
      DESTINATION_KEY,
      LEASE_TOKEN,
    )),
    "release errors rely on bounded expiry instead of reporting success",
  );
});
