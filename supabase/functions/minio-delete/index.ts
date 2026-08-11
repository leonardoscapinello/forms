import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthorizedCaller } from "../_shared/auth.ts";
import { fetchPublicHttps } from "../_shared/outboundHttp.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hmacSHA256(
  key: ArrayBuffer,
  data: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function sha256Str(data: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  let key = await hmacSHA256(
    new TextEncoder().encode("AWS4" + secretKey).buffer,
    dateStamp,
  );
  key = await hmacSHA256(key, region);
  key = await hmacSHA256(key, service);
  key = await hmacSHA256(key, "aws4_request");
  return key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  try {
    const caller = await getAuthorizedCaller(req);
    if (!caller.ok) return caller.response;

    const parsedBody = await readLimitedJsonObject(req, 2 * 1024, corsHeaders);
    if (!parsedBody.ok) return parsedBody.response;
    const { path } = parsedBody.value;
    if (
      !path || typeof path !== "string" || path.length > 500 ||
      /\.\./.test(path) || /[<>:"|?*\x00-\x1f\\]/.test(path)
    ) {
      return new Response(
        JSON.stringify({ success: false, message: "Path é obrigatório." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!caller.isAdmin && !path.startsWith(`users/${caller.userId}/`)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await caller.admin
      .from("integration_settings")
      .select("config, is_active")
      .eq("integration_type", "minio_s3")
      .maybeSingle();

    if (!settings || !settings.is_active) {
      return new Response(
        JSON.stringify({ success: false, message: "MinIO não configurado." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const cfg: any = (await openIntegrationConfig(
      "minio_s3",
      settings.config,
      Deno.env.get("ENCRYPTION_SECRET") ?? "",
    )).config;
    if (cfg.useSSL === false) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "HTTPS é obrigatório para o armazenamento.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const rawEndpoint = String(cfg.endpoint || "").trim();
    const endpointUrl = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(rawEndpoint)
        ? rawEndpoint
        : `https://${rawEndpoint}`,
    );
    if (
      endpointUrl.protocol !== "https:" || endpointUrl.username ||
      endpointUrl.password ||
      endpointUrl.pathname !== "/" || endpointUrl.search || endpointUrl.hash
    ) {
      return new Response(
        JSON.stringify({ success: false, message: "Endpoint MinIO inválido." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (cfg.port) endpointUrl.port = String(cfg.port);
    const host = endpointUrl.host;
    const region = cfg.region || "us-east-1";

    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dateStamp = amzDate.slice(0, 8);
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const canonicalUri = `/${encodeURIComponent(cfg.bucket)}/${encodedPath}`;
    const payloadHash = await sha256Str("");

    const canonicalHeaders =
      `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "DELETE",
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign =
      `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Str(
        canonicalRequest,
      )}`;

    const signingKey = await getSignatureKey(
      cfg.secretKey,
      dateStamp,
      region,
      "s3",
    );
    const signatureBuffer = await hmacSHA256(signingKey, stringToSign);
    const signature = [...new Uint8Array(signatureBuffer)].map((b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    const authHeader =
      `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    endpointUrl.pathname = canonicalUri;
    const deleteUrl = endpointUrl.toString();
    const response = await fetchPublicHttps(deleteUrl, {
      method: "DELETE",
      headers: {
        "Host": host,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Authorization": authHeader,
      },
      signal: AbortSignal.timeout(15_000),
    }, { maxRedirects: 0 });

    return new Response(
      JSON.stringify({ success: response.ok || response.status === 204 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
