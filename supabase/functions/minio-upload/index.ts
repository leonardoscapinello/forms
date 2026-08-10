import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAuthorizedCaller } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// AWS Signature V4 helpers
async function hmacSHA256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Str(data: string): Promise<string> {
  return sha256(new TextEncoder().encode(data));
}

async function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  let key = await hmacSHA256(new TextEncoder().encode('AWS4' + secretKey).buffer, dateStamp);
  key = await hmacSHA256(key, region);
  key = await hmacSHA256(key, service);
  key = await hmacSHA256(key, 'aws4_request');
  return key;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const caller = await getAuthorizedCaller(req);
    if (!caller.ok) return caller.response;

    // Get MinIO config from integration_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase
      .from('integration_settings')
      .select('config, is_active')
      .eq('integration_type', 'minio_s3')
      .maybeSingle();

    if (!settings || !settings.is_active) {
      return new Response(
        JSON.stringify({ success: false, message: 'MinIO S3 não está configurado ou ativo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cfg = settings.config as any;
    const { accessKey, secretKey, bucket, useSSL, region: regionVal } = cfg;
    const cleanEndpoint = (cfg.endpoint || '').replace(/^https?:\/\//, '');
    const host = cfg.port ? `${cleanEndpoint}:${cfg.port}` : cleanEndpoint;
    const protocol = useSSL ? 'https' : 'http';
    const region = regionVal || 'us-east-1';

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as globalThis.File | null;
    const requestedPath = formData.get('path') as string | null;

    if (!file || !requestedPath) {
      return new Response(
        JSON.stringify({ success: false, message: 'Arquivo e path são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Input validation ──
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff', 'video/mp4', 'application/pdf', 'audio/mpeg', 'audio/wav'];

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ success: false, message: 'File exceeds 50MB limit.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({ success: false, message: `File type "${file.type}" not allowed.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize file path: no directory traversal, max 500 chars
    if (requestedPath.length > 400 || /\.\./.test(requestedPath) || /[<>:"|?*\x00-\x1f\\]/.test(requestedPath)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid file path.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Namespace every new object by the authenticated user. This prevents a
    // guessed path from overwriting another account's object.
    const filePath = `users/${caller.userId}/${requestedPath.replace(/^\/+/, '')}`;
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const payloadHash = await sha256(fileBytes);

    // Build S3 PUT request with AWS Signature V4
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const service = 's3';
    const method = 'PUT';
    const canonicalUri = `/${encodeURIComponent(bucket)}/${encodedPath}`;

    const canonicalHeaders = `content-type:${file.type}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Str(canonicalRequest)}`;

    const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
    const signatureBuffer = await hmacSHA256(signingKey, stringToSign);
    const signature = [...new Uint8Array(signatureBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const uploadUrl = `${protocol}://${host}${canonicalUri}`;

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Host': host,
        'Content-Type': file.type,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authHeader,
      },
      body: fileBytes,
    });

    if (response.ok) {
      const publicUrl = `${protocol}://${host}/${encodeURIComponent(bucket)}/${encodedPath}`;
      return new Response(
        JSON.stringify({ success: true, url: publicUrl, path: filePath }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const errorBody = await response.text();
    const codeMatch = errorBody.match(/<Code>(.*?)<\/Code>/);
    const msgMatch = errorBody.match(/<Message>(.*?)<\/Message>/);

    return new Response(
      JSON.stringify({ success: false, message: `Erro S3 (${response.status}): ${codeMatch?.[1] || ''} — ${msgMatch?.[1] || errorBody.slice(0, 200)}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, message: `Erro: ${msg}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
