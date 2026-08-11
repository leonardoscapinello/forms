function normalizedText(value: unknown, maxLength = 300): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength).toLowerCase()
    : "";
}

const CREDENTIAL_ERROR_PATTERN =
  /(?:api[ _-]?key|key|auth(?:entication|orization)?|token).{0,80}(?:invalid|missing|not[ _-]?found|required|wrong|unauthori[sz]ed|expired)|(?:invalid|missing|required|wrong|unauthori[sz]ed|expired).{0,80}(?:api[ _-]?key|key|auth(?:entication|orization)?|token)/i;
const QUICK_RESULT_STATUSES = new Set([
  "valid",
  "invalid",
  "disposable",
  "spamtrap",
]);
const POWER_RESULT_STATUSES = new Set([
  "safe",
  "invalid",
  "disabled",
  "disposable",
  "inbox_full",
  "catch_all",
  "role",
  "role_account",
  "spamtrap",
  "unknown",
]);

export type PixelValidationSummary = {
  status: "validated" | "partially_validated";
  message?: string;
};

export function isResendManagedTestSender(value: unknown): boolean {
  return normalizedText(value, 320) === "onboarding@resend.dev";
}

export function isResendDomainListResponse(
  payload: unknown,
): payload is { data: unknown[]; has_more?: boolean } {
  return !!payload && typeof payload === "object" && !Array.isArray(payload) &&
    Array.isArray((payload as Record<string, unknown>).data);
}

/**
 * A Resend sender is production-ready only when its exact domain is verified
 * and the provider reports sending as enabled. A verified parent domain is not
 * assumed to authorize arbitrary subdomains.
 */
export function findVerifiedResendSenderDomain(
  sender: unknown,
  payload: unknown,
): string | null {
  if (typeof sender !== "string" || !isResendDomainListResponse(payload)) {
    return null;
  }
  const separator = sender.trim().lastIndexOf("@");
  const senderDomain = separator >= 0
    ? sender.trim().slice(separator + 1).toLowerCase().replace(/\.$/, "")
    : "";
  if (!senderDomain) return null;

  for (const item of payload.data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const domain = item as Record<string, unknown>;
    const name = normalizedText(domain.name, 255).replace(/\.$/, "");
    const status = normalizedText(domain.status, 80);
    const capabilities = domain.capabilities &&
        typeof domain.capabilities === "object" &&
        !Array.isArray(domain.capabilities)
      ? domain.capabilities as Record<string, unknown>
      : {};
    const sending = normalizedText(capabilities.sending, 40);
    if (
      name === senderDomain && status === "verified" && sending === "enabled"
    ) return name;
  }
  return null;
}

export function ga4ValidationOutcome(
  payload: unknown,
): "valid_payload" | "invalid_payload" | "malformed_response" {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "malformed_response";
  }
  const messages = (payload as Record<string, unknown>).validationMessages;
  if (!Array.isArray(messages)) return "malformed_response";
  return messages.length === 0 ? "valid_payload" : "invalid_payload";
}

export function summarizePixelValidation(input: {
  ga4ValidatedByDebugEndpoint: boolean;
  tiktokValidatedByConfiguration: boolean;
}): PixelValidationSummary {
  const reasons: string[] = [];
  if (input.ga4ValidatedByDebugEndpoint) {
    reasons.push(
      "GA4: o payload foi validado, mas o Google não valida o API Secret nesse endpoint; confirme o evento no DebugView ou Tempo real.",
    );
  }
  if (input.tiktokValidatedByConfiguration) {
    reasons.push(
      "TikTok validado por formato; a prova final ocorre no primeiro evento.",
    );
  }
  return reasons.length > 0
    ? { status: "partially_validated", message: reasons.join(" ") }
    : { status: "validated" };
}

/**
 * Reoon can report authentication failures inside an HTTP 200 body. Do not
 * confuse an invalid test e-mail result with an invalid API credential.
 */
export function hasReoonCredentialError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return true;
  }
  const record = payload as Record<string, unknown>;
  const status = normalizedText(record.status, 80);
  if (status === "error") return true;

  const errorText = [record.reason, record.message, record.error]
    .map((value) => normalizedText(value))
    .filter(Boolean)
    .join(" ");
  if (CREDENTIAL_ERROR_PATTERN.test(errorText)) return true;

  const verificationMode = normalizedText(record.verification_mode, 40);
  if (verificationMode && verificationMode !== "quick") return true;
  return !QUICK_RESULT_STATUSES.has(status);
}

/** Validates a real Reoon verdict separately from credential-check semantics. */
export function isReoonVerificationResult(
  payload: unknown,
  mode: "quick" | "power",
): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const status = normalizedText(record.status, 80);
  const verificationMode = normalizedText(record.verification_mode, 40);
  if (verificationMode !== mode) return false;
  if (mode === "quick") return QUICK_RESULT_STATUSES.has(status);
  return POWER_RESULT_STATUSES.has(status) &&
    typeof record.is_safe_to_send === "boolean";
}

/**
 * OAuth access/refresh tokens are bound to the Google OAuth client that issued
 * them. Changing either client credential must force a fresh consent flow.
 */
export function googleOauthCredentialsChanged(
  currentConfig: unknown,
  incomingConfig: unknown,
  clearSecretFields: unknown,
  maskedSecret: string,
): boolean {
  const current = currentConfig && typeof currentConfig === "object" &&
      !Array.isArray(currentConfig)
    ? currentConfig as Record<string, unknown>
    : {};
  const incoming = incomingConfig && typeof incomingConfig === "object" &&
      !Array.isArray(incomingConfig)
    ? incomingConfig as Record<string, unknown>
    : {};

  if (Object.prototype.hasOwnProperty.call(incoming, "clientId")) {
    const previous = typeof current.clientId === "string"
      ? current.clientId.trim()
      : "";
    const next = typeof incoming.clientId === "string"
      ? incoming.clientId.trim()
      : "";
    if (next !== previous) return true;
  }

  const clear = Array.isArray(clearSecretFields) &&
    clearSecretFields.includes("clientSecret");
  if (
    clear && typeof current.clientSecret === "string" && current.clientSecret
  ) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(incoming, "clientSecret")) {
    const next = typeof incoming.clientSecret === "string"
      ? incoming.clientSecret.trim()
      : "";
    if (next && next !== maskedSecret) {
      const previous = typeof current.clientSecret === "string"
        ? current.clientSecret.trim()
        : "";
      if (next !== previous) return true;
    }
  }
  return false;
}
