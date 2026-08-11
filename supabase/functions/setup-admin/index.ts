import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  promoteCreatedUserToAdmin,
  rollbackCreatedAuthUser,
} from "../_shared/adminUserCreation.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { enforceProviderRequestRateLimits } from "../_shared/rateLimit.ts";
import {
  isEmptyInstallationSnapshot,
  timingSafeTextEqual,
} from "../_shared/setupAdminState.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-setup-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const responseHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  additionalHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, ...additionalHeaders },
  });
}

type AdminClient = ReturnType<typeof createClient<any, "public", "public">>;

async function installationIsEmpty(adminClient: AdminClient): Promise<boolean> {
  const [profiles, roles, authUsers] = await Promise.all([
    adminClient.from("profiles").select("user_id", { count: "exact", head: true }),
    adminClient.from("user_roles").select("user_id", { count: "exact", head: true }),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1 }),
  ]);

  return isEmptyInstallationSnapshot({ profiles, roles, authUsers });
}

async function setupIsAvailable(adminClient: AdminClient): Promise<boolean> {
  const [empty, availability] = await Promise.all([
    installationIsEmpty(adminClient),
    adminClient.rpc("initial_admin_setup_available"),
  ]);
  if (availability.error) throw new Error("setup_installation_state_unavailable");
  return empty && availability.data === true;
}

async function claimSetup(adminClient: AdminClient): Promise<string | null> {
  const { data, error } = await adminClient.rpc("claim_initial_admin_setup");
  if (error) throw new Error("setup_claim_unavailable");
  return typeof data === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data)
    ? data
    : null;
}

async function releaseSetupClaim(adminClient: AdminClient, claimId: string): Promise<boolean> {
  const { data, error } = await adminClient.rpc("release_initial_admin_setup", {
    p_claim_id: claimId,
  });
  return !error && data === true;
}

async function completeSetupClaim(
  adminClient: AdminClient,
  claimId: string,
  userId: string,
): Promise<"confirmed" | "rejected" | "unavailable"> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await adminClient.rpc("complete_initial_admin_setup", {
      p_claim_id: claimId,
      p_user_id: userId,
    });
    if (!error) return data === true ? "confirmed" : "rejected";
  }
  return "unavailable";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, {
      Allow: "POST, OPTIONS",
    });
  }

  try {
    const parsedBody = await readLimitedJsonObject(
      req,
      4 * 1024,
      responseHeaders,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const payload = parsedBody.value;
    const setupEnabled = Deno.env.get("SETUP_ENABLED") === "true";
    const expectedSetupToken = Deno.env.get("SETUP_TOKEN") || "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (payload.action === "status") {
      if (!setupEnabled || !expectedSetupToken) {
        return jsonResponse({ setupRequired: false });
      }
      if (!supabaseUrl || !serviceRoleKey) {
        return jsonResponse({ setupRequired: false }, 503);
      }

      const statusClient = createClient(supabaseUrl, serviceRoleKey);
      const rateLimited = await enforceProviderRequestRateLimits(statusClient, req, {
        bucket: "setup-admin",
        ipLimit: 120,
        providerScope: "initial-admin",
        providerLimit: 600,
        subjectScope: "status",
        subjectLimit: 600,
        responseHeaders,
      });
      if (rateLimited) return rateLimited;

      const setupRequired = await setupIsAvailable(statusClient);
      return jsonResponse({ setupRequired });
    }

    if (!setupEnabled) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Setup unavailable" }, 503);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const rateLimited = await enforceProviderRequestRateLimits(adminClient, req, {
      bucket: "setup-admin",
      ipLimit: 30,
      providerScope: "initial-admin",
      providerLimit: 120,
      subjectScope: "create",
      subjectLimit: 20,
      responseHeaders,
    });
    if (rateLimited) return rateLimited;

    const suppliedSetupToken = req.headers.get("x-setup-token") || "";
    if (!expectedSetupToken || !timingSafeTextEqual(suppliedSetupToken, expectedSetupToken)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { email, password, displayName } = payload;
    if (typeof email !== "string" || typeof password !== "string") {
      return jsonResponse({ error: "Email and password required" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return jsonResponse({ error: "Invalid email" }, 400);
    }
    if (password.length < 12 || password.length > 128) {
      return jsonResponse({ error: "Password must be between 12 and 128 characters" }, 400);
    }
    if (
      displayName !== undefined &&
      (typeof displayName !== "string" || displayName.length > 100)
    ) {
      return jsonResponse({ error: "Invalid display name" }, 400);
    }

    const claimId = await claimSetup(adminClient);
    if (!claimId) {
      return jsonResponse({ error: "Setup unavailable or already in progress" }, 409);
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName || "Admin" },
    });
    const userId = newUser.user?.id;
    if (createError || !userId) {
      const released = await releaseSetupClaim(adminClient, claimId);
      console.error("setup-admin user creation failed", {
        reason: createError ? "provider_error" : "missing_ack",
        claimReleased: released,
      });
      return jsonResponse({ error: createError?.message || "User creation was not acknowledged" }, 400);
    }

    const promotion = await promoteCreatedUserToAdmin(adminClient, userId);
    if (!promotion.ok) {
      const rolledBack = await rollbackCreatedAuthUser(adminClient, userId);
      const claimReleased = rolledBack
        ? await releaseSetupClaim(adminClient, claimId)
        : false;
      console.error("setup-admin promotion failed", {
        reason: promotion.reason,
        rollback: rolledBack ? "confirmed" : "unconfirmed",
        claimReleased,
      });
      return jsonResponse({
        error: rolledBack
          ? "Setup was rolled back because the administrator role was not confirmed"
          : "Administrator role was not confirmed; manual review is required",
      }, 500);
    }

    const completion = await completeSetupClaim(adminClient, claimId, userId);
    if (completion !== "confirmed") {
      if (completion === "unavailable") {
        console.error("setup-admin completion acknowledgement unavailable", {
          rollback: "not_attempted",
          claimReleased: false,
        });
        return jsonResponse({
          error: "Setup completion could not be verified; manual review is required",
        }, 503);
      }

      const rolledBack = await rollbackCreatedAuthUser(adminClient, userId);
      const claimReleased = rolledBack
        ? await releaseSetupClaim(adminClient, claimId)
        : false;
      console.error("setup-admin completion acknowledgement failed", {
        rollback: rolledBack ? "confirmed" : "unconfirmed",
        claimReleased,
      });
      return jsonResponse({
        error: rolledBack
          ? "Setup was rolled back because completion was not confirmed"
          : "Setup completion was not confirmed; manual review is required",
      }, 500);
    }

    return jsonResponse({ success: true, userId });
  } catch (error: unknown) {
    console.error("setup-admin failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse({ error: "Setup failed" }, 500);
  }
});
