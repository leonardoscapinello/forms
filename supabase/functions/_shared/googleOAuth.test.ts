import { getGoogleAccessToken } from "./googleOAuth.ts";

function assert(
  condition: unknown,
  message = "assertion_failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function queryResult(data: unknown[], error: unknown = null): any {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data, error }),
  };
  return { from: () => query };
}

Deno.test("Google OAuth selects one active config and keeps a non-expiring token", async () => {
  const token = await getGoogleAccessToken(
    queryResult([{
      id: "10000000-0000-4000-8000-000000000001",
      updated_at: "2026-08-10T20:00:00.000Z",
      config: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenExpiry: "2099-01-01T00:00:00.000Z",
      },
    }]),
    { encryptionSecret: "google-oauth-unit-test-secret" },
  );
  assert(token.accessToken === "access-token");
  assert(token.settingsUpdatedAt === "2026-08-10T20:00:00.000Z");
});

Deno.test("Google OAuth fails closed when more than one active config exists", async () => {
  let rejected = false;
  try {
    await getGoogleAccessToken(queryResult([
      { id: "first", updated_at: "2026-08-10T20:00:00.000Z", config: {} },
      { id: "second", updated_at: "2026-08-10T21:00:00.000Z", config: {} },
    ]));
  } catch (error) {
    rejected = error instanceof Error &&
      error.message === "google_oauth_ambiguous_configuration";
  }
  assert(
    rejected,
    "ambiguous OAuth config must not select credentials silently",
  );
});
