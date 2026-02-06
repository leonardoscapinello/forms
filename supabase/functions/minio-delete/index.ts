import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function hmacSHA256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256Str(data: string): Promise<string> {
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
    const { path } = await req.json();
    if (!path) {
      return new Response(
        JSON.stringify({ success: false, message: 'Path é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase
      .from('integration_settings')
      .select('config')
      .eq('integration_type', 'minio_s3')
      .maybeSingle();

    if (!settings) {
      return new Response(
        JSON.stringify({ success: false, message: 'MinIO não configurado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cfg = settings.config as any;
    const cleanEndpoint = (cfg.endpoint || '').replace(/^https?:\/\//, '');
    const host = cfg.port ? `${cleanEndpoint}:${cfg.port}` : cleanEndpoint;
    const protocol = cfg.useSSL ? 'https' : 'http';
    const region = cfg.region || 'us-east-1';

    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${cfg.bucket}/${path}`;
    const payloadHash = await sha256Str('');

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = ['DELETE', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Str(canonicalRequest)}`;

    const signingKey = await getSignatureKey(cfg.secretKey, dateStamp, region, 's3');
    const signatureBuffer = await hmacSHA256(signingKey, stringToSign);
    const signature = [...new Uint8Array(signatureBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const deleteUrl = `${protocol}://${host}${canonicalUri}`;
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Host': host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authHeader,
      },
    });

    return new Response(
      JSON.stringify({ success: response.ok || response.status === 204 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, message: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
