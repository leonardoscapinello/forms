import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// AWS Signature V4 helpers
async function hmacSHA256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
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
    const { config } = await req.json();
    const { endpoint, port, accessKey, secretKey, bucket, useSSL, region } = config;

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      return new Response(
        JSON.stringify({ success: false, message: 'Campos obrigatórios ausentes.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const protocol = useSSL ? 'https' : 'http';
    const host = port ? `${endpoint}:${port}` : endpoint;
    const url = `${protocol}://${host}/${bucket}/`;

    // Build AWS Signature V4
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const regionVal = region || 'us-east-1';
    const service = 's3';
    const method = 'GET';
    const canonicalUri = `/${bucket}/`;
    const canonicalQueryString = 'list-type=2&max-keys=1';
    const payloadHash = await sha256('');

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${regionVal}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

    const signingKey = await getSignatureKey(secretKey, dateStamp, regionVal, service);
    const signatureBuffer = await hmacSHA256(signingKey, stringToSign);
    const signature = [...new Uint8Array(signatureBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`${url}?${canonicalQueryString}`, {
      method,
      headers: {
        'Host': host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authHeader,
      },
    });

    const body = await response.text();

    if (response.ok) {
      return new Response(
        JSON.stringify({ success: true, message: `Conectado ao bucket "${bucket}" com sucesso.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse S3 error
    const codeMatch = body.match(/<Code>(.*?)<\/Code>/);
    const msgMatch = body.match(/<Message>(.*?)<\/Message>/);
    const errorCode = codeMatch?.[1] || `HTTP ${response.status}`;
    const errorMsg = msgMatch?.[1] || 'Erro desconhecido';

    return new Response(
      JSON.stringify({ success: false, message: `Erro S3: ${errorCode} — ${errorMsg}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, message: `Erro de conexão: ${msg}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
