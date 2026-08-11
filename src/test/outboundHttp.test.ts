import { describe, expect, it, vi } from "vitest";
import {
  type DnsResolver,
  fetchPublicHttps,
  isReservedIpAddress,
  normalizeTrustedVideoEmbedUrl,
  OutboundHttpError,
  validatePublicHttpsUrl,
} from "../../supabase/functions/_shared/outboundHttp.ts";

const publicDns: DnsResolver = async (_hostname, type) =>
  type === "A" ? ["93.184.216.34"] : [];

describe("outbound HTTPS guard", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])("recognizes reserved address %s", (address) => {
    expect(isReservedIpAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("allows globally routable address %s", (address) => {
    expect(isReservedIpAddress(address)).toBe(false);
  });

  it.each([
    "http://example.com/hook",
    "https://localhost/hook",
    "https://service.internal/hook",
    "https://127.0.0.1/hook",
    "https://[::1]/hook",
    "https://user:secret@example.com/hook",
  ])("rejects unsafe destination %s", async (url) => {
    await expect(validatePublicHttpsUrl(url, { resolver: publicDns })).rejects
      .toBeInstanceOf(OutboundHttpError);
  });

  it("rejects a hostname if any DNS answer is private", async () => {
    const resolver: DnsResolver = async (_hostname, type) =>
      type === "A" ? ["93.184.216.34", "10.0.0.5"] : [];
    await expect(
      validatePublicHttpsUrl("https://example.com/hook", { resolver }),
    )
      .rejects.toMatchObject({ code: "dns_resolved_to_reserved_address" });
  });

  it("accepts a public HTTPS hostname after DNS validation", async () => {
    await expect(
      validatePublicHttpsUrl("https://example.com/hook", {
        resolver: publicDns,
      }),
    )
      .resolves.toMatchObject({ hostname: "example.com" });
  });

  it("bounds DNS resolution before the outbound fetch starts", async () => {
    const hangingResolver: DnsResolver = async () =>
      await new Promise<string[]>(() => {});
    await expect(validatePublicHttpsUrl("https://example.com/hook", {
      resolver: hangingResolver,
      dnsTimeoutMs: 10,
    })).rejects.toMatchObject({ code: "dns_resolution_failed" });
  });

  it("revalidates redirects before issuing the redirected request", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://127.0.0.1/internal" },
      })
    ) as unknown as typeof fetch;

    await expect(
      fetchPublicHttps("https://example.com/start", {}, {
        resolver: publicDns,
        fetchImpl,
      }),
    )
      .rejects.toMatchObject({ code: "reserved_ip_address" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a safe redirect and applies standard POST-to-GET behavior", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init });
        return requests.length === 1
          ? new Response(null, { status: 302, headers: { Location: "/done" } })
          : new Response("ok", { status: 200 });
      },
    ) as unknown as typeof fetch;

    const response = await fetchPublicHttps("https://example.com/start", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: "{}",
    }, { resolver: publicDns, fetchImpl });

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(requests[1].url).toBe("https://example.com/done");
    expect(requests[1].init?.method).toBe("GET");
    expect(requests[1].init?.body).toBeUndefined();
  });
});

describe("server-rendered video URLs", () => {
  it("normalizes supported providers", () => {
    expect(normalizeTrustedVideoEmbedUrl("https://youtu.be/dQw4w9WgXcQ"))
      .toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(normalizeTrustedVideoEmbedUrl("https://vimeo.com/76979871"))
      .toBe("https://player.vimeo.com/video/76979871");
  });

  it("rejects arbitrary iframe destinations", () => {
    expect(normalizeTrustedVideoEmbedUrl("https://evil.example/video")).toBe(
      "",
    );
    expect(normalizeTrustedVideoEmbedUrl("javascript:alert(1)")).toBe("");
  });
});
