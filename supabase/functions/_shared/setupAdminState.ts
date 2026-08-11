export interface CountSnapshot {
  count: number | null;
  error: unknown;
}

export interface AuthUsersSnapshot {
  data: { users: unknown[] };
  error: unknown;
}

export interface InstallationSnapshot {
  profiles: CountSnapshot;
  roles: CountSnapshot;
  authUsers: AuthUsersSnapshot;
}

/**
 * Setup is available only when every authoritative store explicitly confirms
 * zero users. Missing counts and provider errors must never open registration.
 */
export function isEmptyInstallationSnapshot(snapshot: InstallationSnapshot): boolean {
  const { profiles, roles, authUsers } = snapshot;
  if (
    profiles.error ||
    roles.error ||
    authUsers.error ||
    profiles.count === null ||
    roles.count === null ||
    !Array.isArray(authUsers.data?.users)
  ) {
    throw new Error("setup_installation_state_unavailable");
  }

  return profiles.count === 0 && roles.count === 0 && authUsers.data.users.length === 0;
}

export function timingSafeTextEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}
