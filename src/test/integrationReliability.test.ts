import { describe, expect, it } from "vitest";
import {
  extractEvolutionMessageAck,
  extractOpenAiChatAck,
  extractResendEmailId,
  googleTokenExpiryIso,
  isGoogleSheetsClearAck,
  isGoogleSheetsMutationAck,
  isMetaConversionsAck,
  isTikTokEventsAck,
  normalizeAnalyticsParams,
  normalizeOAuthReturnUrl,
  readResponseJsonLimited,
  safeIntegrationErrorCode,
} from "../../supabase/functions/_shared/integrationReliability.ts";

describe("external integration acknowledgements", () => {
  it("requires the Resend delivery id documented by the provider", () => {
    expect(extractResendEmailId({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }))
      .toBeTruthy();
    expect(extractResendEmailId({ success: true })).toBeNull();
  });

  it("requires an Evolution message id instead of trusting HTTP 2xx", () => {
    expect(
      extractEvolutionMessageAck({
        key: { id: "message-123" },
        status: "PENDING",
      }),
    )
      .toEqual({ messageId: "message-123", status: "PENDING" });
    expect(extractEvolutionMessageAck({ status: "ok" })).toBeNull();
    expect(extractEvolutionMessageAck({ id: "message-123", status: "failed" }))
      .toBeNull();
  });

  it("requires a non-empty OpenAI completion associated with a completion id", () => {
    expect(
      extractOpenAiChatAck({
        id: "chatcmpl-1",
        choices: [{ message: { content: "resultado" } }],
      }),
    )
      .toEqual({ completionId: "chatcmpl-1", result: "resultado" });
    expect(
      extractOpenAiChatAck({
        choices: [{ message: { content: "resultado" } }],
      }),
    ).toBeNull();
    expect(extractOpenAiChatAck({ id: "chatcmpl-1", choices: [] })).toBeNull();
  });

  it("checks Google mutation row counts and clear acknowledgement", () => {
    expect(
      isGoogleSheetsMutationAck({
        updatedRows: 2,
        updatedRange: "Respostas!A1:B2",
      }, 2),
    ).toBe(true);
    expect(
      isGoogleSheetsMutationAck({
        updates: { updatedRows: 1, updatedRange: "Respostas!A1" },
      }, 1),
    ).toBe(true);
    expect(
      isGoogleSheetsMutationAck({
        updatedRows: 1,
        updatedRange: "Respostas!A1",
      }, 2),
    ).toBe(false);
    expect(isGoogleSheetsClearAck({ clearedRange: "Respostas!A4:ZZ" })).toBe(
      true,
    );
    expect(isGoogleSheetsClearAck({})).toBe(false);
  });

  it("uses provider-specific pixel acknowledgements", () => {
    expect(isMetaConversionsAck({ events_received: 1, fbtrace_id: "trace" }))
      .toBe(true);
    expect(isMetaConversionsAck({ success: true })).toBe(false);
    expect(
      isTikTokEventsAck({ code: 0, message: "OK", request_id: "request-1" }),
    ).toBe(true);
    expect(isTikTokEventsAck({ code: 0 })).toBe(false);
  });
});

describe("bounded upstream responses", () => {
  it("parses a bounded JSON response", async () => {
    await expect(readResponseJsonLimited(new Response('{"ok":true}'), 64))
      .resolves.toEqual({ ok: true });
  });

  it("rejects oversized chunked responses before buffering all content", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("12345"));
          controller.enqueue(new TextEncoder().encode("67890"));
          controller.close();
        },
      }),
    );
    await expect(readResponseJsonLimited(response, 8)).rejects.toMatchObject({
      code: "upstream_response_too_large",
    });
  });

  it("does not expose arbitrary upstream or database messages", () => {
    expect(
      safeIntegrationErrorCode(
        new Error("https://user:secret@example.com failed"),
        "provider_failed",
      ),
    )
      .toBe("provider_failed");
    expect(
      safeIntegrationErrorCode(new Error("provider_failed:502"), "fallback"),
    )
      .toBe("provider_failed:502");
  });
});

describe("OAuth token expiry", () => {
  it("bounds malformed provider expiry values", () => {
    expect(googleTokenExpiryIso(60, 0)).toBe("1970-01-01T00:01:00.000Z");
    expect(googleTokenExpiryIso(Number.POSITIVE_INFINITY, 0)).toBe(
      "1970-01-01T01:00:00.000Z",
    );
    expect(googleTokenExpiryIso(999_999_999, 0)).toBe(
      "1970-01-01T01:00:00.000Z",
    );
  });
});

describe("analytics privacy", () => {
  it("removes obvious PII from custom provider properties", () => {
    expect(normalizeAnalyticsParams({
      campaign: "summer",
      score: 7,
      email: "lead@example.com",
      telefone: "+5511999999999",
      nome_completo: "Lead Name",
      nested: { unsafe: true },
    }, "var_")).toEqual({
      var_campaign: "summer",
      var_score: 7,
    });
  });
});

describe("Google OAuth return URL", () => {
  it("keeps the callback on the initiating application origin", () => {
    expect(normalizeOAuthReturnUrl(
      "https://forms.example.com/settings?tab=google#secret-fragment",
      ["https://forms.example.com"],
    )).toBe("https://forms.example.com/settings?tab=google");
    expect(
      normalizeOAuthReturnUrl("https://attacker.example/callback", [
        "https://forms.example.com",
      ]),
    )
      .toBeNull();
  });

  it("allows HTTP only for local development origins", () => {
    expect(
      normalizeOAuthReturnUrl("http://127.0.0.1:8080/settings", [
        "http://127.0.0.1:8080",
      ]),
    )
      .toBe("http://127.0.0.1:8080/settings");
    expect(
      normalizeOAuthReturnUrl("http://forms.example.com/settings", [
        "http://forms.example.com",
      ]),
    )
      .toBeNull();
  });
});
