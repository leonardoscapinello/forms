import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthorizedCaller } from "../_shared/auth.ts";
import { fetchPublicHttps } from "../_shared/outboundHttp.ts";
import { openIntegrationConfig } from "../_shared/integrationSettingsCrypto.ts";
import { readResponseTextLimited } from "../_shared/integrationReliability.ts";
import { readLimitedRequestBody } from "../_shared/limitedRequestBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_MULTIPART_SIZE = MAX_FILE_SIZE + 1024 * 1024;

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

async function sha256(data: Uint8Array): Promise<string> {
  const bytes = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Str(data: string): Promise<string> {
  return sha256(new TextEncoder().encode(data));
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

    // Get MinIO config from integration_settings
    const { data: settings } = await caller.admin
      .from("integration_settings")
      .select("config, is_active")
      .eq("integration_type", "minio_s3")
      .maybeSingle();

    if (!settings || !settings.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "MinIO S3 não está configurado ou ativo.",
        }),
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
    const { accessKey, secretKey, bucket, useSSL, region: regionVal } = cfg;
    if (useSSL === false) {
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
    const region = regionVal || "us-east-1";

    // Parse multipart only after enforcing the envelope on the actual stream;
    // `Request.formData()` buffers before individual `File.size` is available.
    const limitedBody = await readLimitedRequestBody(
      req,
      MAX_MULTIPART_SIZE,
      corsHeaders,
    );
    if (!limitedBody.ok) return limitedBody.response;
    const multipartHeaders = new Headers();
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return new Response(
        JSON.stringify({ success: false, message: "Multipart inválido." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    multipartHeaders.set("content-type", contentType);
    let formData: FormData;
    try {
      // Deno's fetch types require an owned ArrayBuffer here. Copying also
      // avoids forwarding a view whose backing buffer may be shared/resizable.
      const multipartBody = new Uint8Array(limitedBody.value.byteLength);
      multipartBody.set(limitedBody.value);
      formData = await new Request(req.url, {
        method: "POST",
        headers: multipartHeaders,
        body: multipartBody.buffer,
      }).formData();
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: "Multipart inválido." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const file = formData.get("file") as globalThis.File | null;
    const requestedPath = formData.get("path") as string | null;

    if (!file || !requestedPath) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Arquivo e path são obrigatórios.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Input validation ──
    const ALLOWED_TYPES = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/bmp",
      "image/tiff",
      "video/mp4",
      "application/pdf",
      "audio/mpeg",
      "audio/wav",
    ];

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ success: false, message: "File exceeds 50MB limit." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `File type "${file.type}" not allowed.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Sanitize file path: no directory traversal, max 500 chars
    if (
      requestedPath.length > 400 || /\.\./.test(requestedPath) ||
      /[<>:"|?*\x00-\x1f\\]/.test(requestedPath)
    ) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid file path." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Namespace every new object by the authenticated user. This prevents a
    // guessed path from overwriting another account's object.
    const filePath = `users/${caller.userId}/${
      requestedPath.replace(/^\/+/, "")
    }`;
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const payloadHash = await sha256(fileBytes);

    // Build S3 PUT request with AWS Signature V4
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dateStamp = amzDate.slice(0, 8);
    const service = "s3";
    const method = "PUT";
    const canonicalUri = `/${encodeURIComponent(bucket)}/${encodedPath}`;

    const canonicalHeaders =
      `content-type:${file.type}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign =
      `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Str(
        canonicalRequest,
      )}`;

    const signingKey = await getSignatureKey(
      secretKey,
      dateStamp,
      region,
      service,
    );
    const signatureBuffer = await hmacSHA256(signingKey, stringToSign);
    const signature = [...new Uint8Array(signatureBuffer)].map((b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    const authHeader =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    endpointUrl.pathname = canonicalUri;
    const uploadUrl = endpointUrl.toString();

    const response = await fetchPublicHttps(uploadUrl, {
      method: "PUT",
      headers: {
        "Host": host,
        "Content-Type": file.type,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Authorization": authHeader,
      },
      body: fileBytes,
      signal: AbortSignal.timeout(20_000),
    }, { maxRedirects: 0 });

    if (response.ok) {
      const publicUrl = uploadUrl;
      return new Response(
        JSON.stringify({ success: true, url: publicUrl, path: filePath }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const errorBody = await readResponseTextLimited(response, 64 * 1024)
      .catch(() => "S3Error");
    const codeMatch = errorBody.match(/<Code>(.*?)<\/Code>/);
    const msgMatch = errorBody.match(/<Message>(.*?)<\/Message>/);

    return new Response(
      JSON.stringify({
        success: false,
        message: `Erro S3 (${response.status}): ${codeMatch?.[1] || ""} — ${
          msgMatch?.[1] || errorBody.slice(0, 200)
        }`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: `Erro: ${msg}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
