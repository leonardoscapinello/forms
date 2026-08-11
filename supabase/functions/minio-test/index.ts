import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { fetchPublicHttps } from "../_shared/outboundHttp.ts";
import {
  MASKED_INTEGRATION_SECRET,
  openIntegrationConfig,
} from "../_shared/integrationSettingsCrypto.ts";
import { readLimitedJsonObject } from "../_shared/limitedJsonBody.ts";
import { readResponseTextLimited } from "../_shared/integrationReliability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MASKED_SECRET = MASKED_INTEGRATION_SECRET;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// AWS Signature V4 helpers
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

async function sha256(data: string): Promise<string> {
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
    const caller = await requireAdmin(req);
    if (!caller.ok) return caller.response;

    const parsedBody = await readLimitedJsonObject(req, 32 * 1024, corsHeaders);
    if (!parsedBody.ok) return parsedBody.response;
    const requestBody = parsedBody.value;
    const settingsId = typeof requestBody?.settingsId === "string" &&
        UUID_PATTERN.test(requestBody.settingsId)
      ? requestBody.settingsId
      : null;
    const incoming = isPlainObject(requestBody?.config)
      ? requestBody.config
      : {};
    let stored: Record<string, unknown> = {};
    if (settingsId) {
      const { data, error } = await caller.admin
        .from("integration_settings")
        .select("config")
        .eq("id", settingsId)
        .eq("integration_type", "minio_s3")
        .maybeSingle();
      if (error) throw new Error("Falha ao carregar a configuração salva.");
      if (!data || !isPlainObject(data.config)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Configuração MinIO não encontrada.",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      stored = (await openIntegrationConfig(
        "minio_s3",
        data.config,
        Deno.env.get("ENCRYPTION_SECRET") ?? "",
      )).config;
    }

    const endpoint = text(incoming.endpoint, 2_048) ||
      text(stored.endpoint, 2_048);
    const port = text(incoming.port, 5) || text(stored.port, 5);
    const incomingAccessKey = text(incoming.accessKey, 1_024);
    const incomingSecretKey = text(incoming.secretKey, 4_096);
    const accessKey = incomingAccessKey && incomingAccessKey !== MASKED_SECRET
      ? incomingAccessKey
      : text(stored.accessKey, 1_024);
    const secretKey = incomingSecretKey && incomingSecretKey !== MASKED_SECRET
      ? incomingSecretKey
      : text(stored.secretKey, 4_096);
    const bucket = text(incoming.bucket, 255) || text(stored.bucket, 255);
    const region = text(incoming.region, 128) || text(stored.region, 128);
    const useSSL = incoming.useSSL === undefined
      ? stored.useSSL !== false
      : incoming.useSSL !== false;

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Campos obrigatórios ausentes.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!useSSL) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "HTTPS é obrigatório para proteger as credenciais do MinIO.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (
      port &&
      (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65_535)
    ) {
      return new Response(
        JSON.stringify({ success: false, message: "Porta inválida." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
      return new Response(
        JSON.stringify({ success: false, message: "Nome do bucket inválido." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const endpointWithScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint)
      ? endpoint
      : `https://${endpoint}`;
    const endpointUrl = new URL(endpointWithScheme);
    if (
      endpointUrl.protocol !== "https:" || endpointUrl.username ||
      endpointUrl.password ||
      endpointUrl.pathname !== "/" || endpointUrl.search || endpointUrl.hash
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Use um endpoint HTTPS público, sem caminho, consulta ou credenciais.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (port) endpointUrl.port = port;
    const host = endpointUrl.host;

    // Build AWS Signature V4
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dateStamp = amzDate.slice(0, 8);
    const regionVal = region || "us-east-1";
    const service = "s3";
    const method = "GET";
    const canonicalUri = `/${encodeURIComponent(bucket)}/`;
    const canonicalQueryString = "list-type=2&max-keys=1";
    const payloadHash = await sha256("");

    const canonicalHeaders =
      `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${regionVal}/${service}/aws4_request`;
    const stringToSign =
      `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256(
        canonicalRequest,
      )}`;

    const signingKey = await getSignatureKey(
      secretKey,
      dateStamp,
      regionVal,
      service,
    );
    const signatureBuffer = await hmacSHA256(signingKey, stringToSign);
    const signature = [...new Uint8Array(signatureBuffer)].map((b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    const authHeader =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    endpointUrl.pathname = canonicalUri;
    endpointUrl.search = canonicalQueryString;
    const response = await fetchPublicHttps(endpointUrl.toString(), {
      method,
      headers: {
        "Host": host,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Authorization": authHeader,
      },
      signal: AbortSignal.timeout(10_000),
    }, { maxRedirects: 0 });

    const body = await readResponseTextLimited(response, 64 * 1024)
      .catch(() => "S3Error");

    if (response.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Conectado ao bucket "${bucket}" com sucesso.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse S3 error
    const codeMatch = body.match(/<Code>(.*?)<\/Code>/);
    const msgMatch = body.match(/<Message>(.*?)<\/Message>/);
    const errorCode = codeMatch?.[1] || `HTTP ${response.status}`;
    const errorMsg = msgMatch?.[1] || "Erro desconhecido";

    return new Response(
      JSON.stringify({
        success: false,
        message: `Erro S3: ${errorCode} — ${errorMsg}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: `Erro de conexão: ${msg}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
