import { describe, expect, it } from "vitest";
import {
  findVerifiedResendSenderDomain,
  ga4ValidationOutcome,
  googleOauthCredentialsChanged,
  hasReoonCredentialError,
  isResendDomainListResponse,
  isResendManagedTestSender,
  isReoonVerificationResult,
  summarizePixelValidation,
} from "../../supabase/functions/integration-settings/validation.ts";

describe("Reoon credential response validation", () => {
  it.each([
    { status: "error" },
    { status: "ok", reason: "Invalid API key" },
    { status: "ok", message: "Authentication token missing" },
    { status: "ok", error: "Unauthorized: wrong key" },
  ])(
    "rejects an HTTP 200 body that reports an authentication error",
    (payload) => {
      expect(hasReoonCredentialError(payload)).toBe(true);
    },
  );

  it("does not confuse an invalid e-mail verdict with an invalid credential", () => {
    expect(hasReoonCredentialError({
      status: "invalid",
      verification_mode: "quick",
      reason: "The e-mail domain does not accept mail",
    })).toBe(false);
    expect(
      hasReoonCredentialError({ status: "valid", verification_mode: "quick" }),
    ).toBe(false);
  });

  it("fails closed for a malformed response body", () => {
    expect(hasReoonCredentialError(null)).toBe(true);
    expect(hasReoonCredentialError("OK")).toBe(true);
    expect(hasReoonCredentialError({})).toBe(true);
    expect(hasReoonCredentialError({ status: "success" })).toBe(true);
  });
});

describe("Reoon verification response validation", () => {
  it("accepts the documented quick and power verdict families", () => {
    expect(
      isReoonVerificationResult(
        { status: "valid", verification_mode: "quick" },
        "quick",
      ),
    ).toBe(true);
    expect(isReoonVerificationResult({
      status: "safe",
      verification_mode: "power",
      is_safe_to_send: true,
    }, "power")).toBe(true);
    expect(isReoonVerificationResult({
      status: "catch_all",
      verification_mode: "power",
      is_safe_to_send: false,
    }, "power")).toBe(true);
  });

  it("rejects mode mismatches, malformed bodies and HTTP-200 error shapes", () => {
    expect(
      isReoonVerificationResult(
        { status: "valid", verification_mode: "power" },
        "quick",
      ),
    ).toBe(false);
    expect(
      isReoonVerificationResult(
        { status: "error", verification_mode: "quick" },
        "quick",
      ),
    ).toBe(false);
    expect(
      isReoonVerificationResult(
        { status: "safe", verification_mode: "power" },
        "power",
      ),
    ).toBe(false);
  });
});

describe("Google OAuth credential rotation", () => {
  const current = {
    clientId: "old.apps.googleusercontent.com",
    clientSecret: "old-secret",
    accessToken: "old-access-token",
    refreshToken: "old-refresh-token",
  };

  it("preserves tokens when masked credentials are unchanged", () => {
    expect(googleOauthCredentialsChanged(
      current,
      {
        clientId: current.clientId,
        clientSecret: "••••••••",
      },
      [],
      "••••••••",
    )).toBe(false);
  });

  it("invalidates tokens when the client id or secret changes", () => {
    expect(googleOauthCredentialsChanged(
      current,
      { clientId: "new.apps.googleusercontent.com" },
      [],
      "••••••••",
    )).toBe(true);
    expect(googleOauthCredentialsChanged(
      current,
      { clientSecret: "new-secret" },
      [],
      "••••••••",
    )).toBe(true);
  });

  it("invalidates tokens when the client secret is explicitly cleared", () => {
    expect(googleOauthCredentialsChanged(
      current,
      {},
      ["clientSecret"],
      "••••••••",
    )).toBe(true);
  });
});

describe("Resend sender validation", () => {
  const catalog = {
    object: "list",
    has_more: false,
    data: [
      {
        id: "domain-verified",
        name: "example.com",
        status: "verified",
        capabilities: { sending: "enabled", receiving: "disabled" },
      },
      {
        id: "domain-pending",
        name: "pending.example",
        status: "pending",
        capabilities: { sending: "enabled" },
      },
      {
        id: "domain-disabled",
        name: "disabled.example",
        status: "verified",
        capabilities: { sending: "disabled" },
      },
    ],
  };

  it("accepts only an exact verified domain with sending enabled", () => {
    expect(findVerifiedResendSenderDomain("forms@example.com", catalog)).toBe(
      "example.com",
    );
    expect(findVerifiedResendSenderDomain("forms@sub.example.com", catalog))
      .toBeNull();
    expect(findVerifiedResendSenderDomain("forms@pending.example", catalog))
      .toBeNull();
    expect(findVerifiedResendSenderDomain("forms@disabled.example", catalog))
      .toBeNull();
  });

  it("fails closed for malformed catalogs and identifies only the provider test sender", () => {
    expect(isResendDomainListResponse({ data: [] })).toBe(true);
    expect(isResendDomainListResponse({ data: null })).toBe(false);
    expect(findVerifiedResendSenderDomain("forms@example.com", { ok: true }))
      .toBeNull();
    expect(isResendManagedTestSender("onboarding@resend.dev")).toBe(true);
    expect(isResendManagedTestSender("anything@resend.dev")).toBe(false);
  });
});

describe("honest GA4 validation status", () => {
  it("distinguishes payload validation from malformed provider responses", () => {
    expect(ga4ValidationOutcome({ validationMessages: [] })).toBe(
      "valid_payload",
    );
    expect(ga4ValidationOutcome({
      validationMessages: [{ validationCode: "NAME_INVALID" }],
    })).toBe("invalid_payload");
    expect(ga4ValidationOutcome({ ok: true })).toBe("malformed_response");
  });

  it("never labels the GA4 debug endpoint as full credential validation", () => {
    const result = summarizePixelValidation({
      ga4ValidatedByDebugEndpoint: true,
      tiktokValidatedByConfiguration: false,
    });
    expect(result.status).toBe("partially_validated");
    expect(result.message).toContain("não valida o API Secret");
  });

  it("keeps all partial validation caveats in the UI message", () => {
    const result = summarizePixelValidation({
      ga4ValidatedByDebugEndpoint: true,
      tiktokValidatedByConfiguration: true,
    });
    expect(result.status).toBe("partially_validated");
    expect(result.message).toContain("GA4");
    expect(result.message).toContain("TikTok");
  });
});
