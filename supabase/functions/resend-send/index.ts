import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { getPublicFormContext, interpolateFormText, isServiceRequest } from '../_shared/publicFormAuth.ts';

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
    let { instanceId, fromEmail, fromName, toEmail, subject, bodyText, bodyHtml, useHtml } = body;
    const testMode = body.testMode === true;

    if (testMode) {
      const caller = await requireAdmin(req);
      if (!caller.ok) return caller.response;
    } else if (!isServiceRequest(req)) {
      const context = await getPublicFormContext(req, body.formId, body.submissionToken);
      if (!context.ok) return context.response;
      const node = (context.formData.emailNodes || []).find((item: any) => item.id === body.nodeId);
      if (!node?.instanceId || !node.toEmail) {
        return new Response(JSON.stringify({ success: false, error: 'email_node_not_allowed' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
      const variables = context.formData.variables || [];
      instanceId = node.instanceId;
      fromEmail = interpolateFormText(node.fromEmail, answers, variables);
      fromName = interpolateFormText(node.fromName, answers, variables);
      toEmail = interpolateFormText(node.toEmail, answers, variables);
      subject = interpolateFormText(node.subject, answers, variables);
      bodyText = interpolateFormText(node.bodyText, answers, variables);
      bodyHtml = interpolateFormText(node.bodyHtml, answers, variables);
      useHtml = node.useHtml === true;
    }

    if (!instanceId || typeof instanceId !== 'string' || !toEmail || typeof toEmail !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'instanceId and toEmail are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail) || toEmail.length > 254) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid recipient email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if ((typeof subject === 'string' && subject.length > 998)
      || (typeof bodyText === 'string' && bodyText.length > 100_000)
      || (typeof bodyHtml === 'string' && bodyHtml.length > 100_000)) {
      return new Response(JSON.stringify({ success: false, error: 'Email content is too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch instance config from integration_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const limited = await enforceRateLimit(
      supabase, req, 'resend-send', 5, 60, instanceId, supabaseKey, corsHeaders,
    );
    if (limited) return limited;

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
