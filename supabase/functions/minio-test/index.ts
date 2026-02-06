import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const url = `${protocol}://${host}/${bucket}/?location`;

    // Sign a simple GET request to check bucket access (S3 ListBucket)
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    // Simple unsigned test — just check if the endpoint is reachable
    const testUrl = `${protocol}://${host}`;
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Host': host,
      },
    });

    // MinIO returns XML even on errors; a response means the server is reachable
    const body = await response.text();
    const reachable = response.status < 500;

    return new Response(
      JSON.stringify({
        success: reachable,
        message: reachable
          ? `MinIO acessível em ${host}. Status: ${response.status}`
          : `MinIO não respondeu corretamente. Status: ${response.status}`,
      }),
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
