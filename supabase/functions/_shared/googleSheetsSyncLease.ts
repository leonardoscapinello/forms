const LEASE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GOOGLE_SHEETS_SYNC_LEASE_SECONDS = 120;

export async function claimGoogleSheetsSyncLease(
  supabase: any,
  destinationKey: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc(
    "claim_google_sheets_sync_lease",
    {
      p_destination_key: destinationKey,
      p_lease_seconds: GOOGLE_SHEETS_SYNC_LEASE_SECONDS,
    },
  );
  if (error) throw new Error("google_sheet_sync_lease_claim_failed");
  return typeof data === "string" && LEASE_TOKEN_PATTERN.test(data)
    ? data
    : null;
}

export async function renewGoogleSheetsSyncLease(
  supabase: any,
  destinationKey: string,
  leaseToken: string,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "renew_google_sheets_sync_lease",
    {
      p_destination_key: destinationKey,
      p_lease_token: leaseToken,
      p_lease_seconds: GOOGLE_SHEETS_SYNC_LEASE_SECONDS,
    },
  );
  if (error || data !== true) throw new Error("google_sheet_sync_lease_lost");
}

export async function releaseGoogleSheetsSyncLease(
  supabase: any,
  destinationKey: string,
  leaseToken: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "release_google_sheets_sync_lease",
    {
      p_destination_key: destinationKey,
      p_lease_token: leaseToken,
    },
  );
  return !error && data === true;
}

export async function isGoogleSheetsSyncLeaseActive(
  supabase: any,
  destinationKey: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "is_google_sheets_sync_lease_active",
    { p_destination_key: destinationKey },
  );
  if (error || typeof data !== "boolean") {
    throw new Error("google_sheet_sync_lease_check_failed");
  }
  return data;
}
