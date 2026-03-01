import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { instanceId, fromEmail, fromName, toEmail, subject, bodyText, bodyHtml, useHtml, testMode } = body;

    if (!instanceId || !toEmail) {
      return new Response(JSON.stringify({ success: false, error: 'instanceId and toEmail are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch instance config from integration_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: setting, error: settingErr } = await supabase
      .from('integration_settings')
      .select('*')
      .eq('id', instanceId)
      .eq('integration_type', 'resend')
      .single();

    if (settingErr || !setting) {
      return new Response(JSON.stringify({ success: false, error: 'Resend instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!setting.is_active) {
      return new Response(JSON.stringify({ success: false, error: 'Resend instance is disabled' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const config = setting.config as any;
    const apiKey = config.apiKey;

    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Resend API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the Resend API payload
    const from = fromName ? `${fromName} <${fromEmail || 'onboarding@resend.dev'}>` : (fromEmail || 'onboarding@resend.dev');

    const emailPayload: Record<string, any> = {
      from,
      to: [toEmail],
      subject: subject || '(sem assunto)',
    };

    if (useHtml && bodyHtml) {
      emailPayload.html = bodyHtml;
    } else {
      emailPayload.text = bodyText || '';
    }

    // Send via Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    const resData = await res.json();

    return new Response(JSON.stringify({
      success: res.ok,
      data: resData,
    }), {
      status: res.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Resend send error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
