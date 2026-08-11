import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  isEmptyInstallationSnapshot,
  timingSafeTextEqual,
  type InstallationSnapshot,
} from "./setupAdminState.ts";

const emptySnapshot = (): InstallationSnapshot => ({
  profiles: { count: 0, error: null },
  roles: { count: 0, error: null },
  authUsers: { data: { users: [] }, error: null },
});

Deno.test("setup opens only when every user store explicitly confirms empty", () => {
  assertEquals(isEmptyInstallationSnapshot(emptySnapshot()), true);

  const withProfile = emptySnapshot();
  withProfile.profiles.count = 1;
  assertEquals(isEmptyInstallationSnapshot(withProfile), false);

  const withAuthUser = emptySnapshot();
  withAuthUser.authUsers.data.users.push({ id: "existing-user" });
  assertEquals(isEmptyInstallationSnapshot(withAuthUser), false);
});

Deno.test("setup fails closed when a count or provider result is unavailable", () => {
  const missingCount = emptySnapshot();
  missingCount.roles.count = null;
  assertThrows(() => isEmptyInstallationSnapshot(missingCount));

  const providerFailure = emptySnapshot();
  providerFailure.authUsers.error = new Error("offline");
  assertThrows(() => isEmptyInstallationSnapshot(providerFailure));
});

Deno.test("setup token comparison requires an exact value", () => {
  assertEquals(timingSafeTextEqual("temporary-token", "temporary-token"), true);
  assertEquals(timingSafeTextEqual("temporary-token", "temporary-taken"), false);
  assertEquals(timingSafeTextEqual("short", "longer-value"), false);
});
