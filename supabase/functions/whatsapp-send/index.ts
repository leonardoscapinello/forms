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
    let { instanceId, recipientNumber, messageText, mediaUrl, mediaType, mediaFileName } = body;
    const testMode = body.testMode === true;

    if (testMode) {
      const caller = await requireAdmin(req);
      if (!caller.ok) return caller.response;
    } else if (!isServiceRequest(req)) {
      const context = await getPublicFormContext(req, body.formId, body.submissionToken);
      if (!context.ok) return context.response;
      const node = (context.formData.whatsappNodes || []).find((item: any) => item.id === body.nodeId);
      if (!node?.instanceId || !node.recipientNumber) {
        return new Response(JSON.stringify({ success: false, error: 'whatsapp_node_not_allowed' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
      const variables = context.formData.variables || [];
      instanceId = node.instanceId;
      recipientNumber = interpolateFormText(node.recipientNumber, answers, variables);
      messageText = interpolateFormText(node.messageText, answers, variables);
      mediaUrl = node.sendMedia ? interpolateFormText(node.mediaUrl, answers, variables) : undefined;
      mediaType = node.sendMedia ? node.mediaType : undefined;
      mediaFileName = node.sendMedia ? node.mediaFileName : undefined;
    }

    if (!instanceId || typeof instanceId !== 'string' || !recipientNumber || typeof recipientNumber !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'instanceId and recipientNumber are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate phone number format (digits, +, spaces, dashes, parens only, max 20 chars)
    if (!/^[\d\s\-\+\(\)]{5,20}$/.test(recipientNumber)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid phone number format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate optional text fields
    if (messageText !== undefined && (typeof messageText !== 'string' || messageText.length > 10_000)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid message text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mediaUrl !== undefined && typeof mediaUrl === 'string') {
      try {
        const u = new URL(mediaUrl);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'Invalid media URL' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (mediaType !== undefined && !['image', 'video', 'audio', 'document'].includes(mediaType)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid media type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch instance config from integration_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const limited = await enforceRateLimit(
      supabase, req, 'whatsapp-send', 5, 60, instanceId, supabaseKey, corsHeaders,
    );
    if (limited) return limited;

    const { data: setting, error: settingErr } = await supabase
      .from('integration_settings')
      .select('*')
      .eq('id', instanceId)
      .eq('integration_type', 'evolution_api')
      .single();

    if (settingErr || !setting) {
      return new Response(JSON.stringify({ success: false, error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!setting.is_active) {
      return new Response(JSON.stringify({ success: false, error: 'Instance is disabled' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const config = setting.config as any;
    const { apiUrl, apiKey, instanceName } = config;

    if (!apiUrl || !apiKey || !instanceName) {
      return new Response(JSON.stringify({ success: false, error: 'Incomplete instance configuration' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean recipient number (remove spaces, dashes, +)
    const cleanNumber = recipientNumber.replace(/[\s\-\+\(\)]/g, '');

    // Send media if provided
    if (mediaUrl) {
      const mediaEndpoint = `${apiUrl}/message/sendMedia/${instanceName}`;
      const mediaBody: any = {
        number: cleanNumber,
        mediatype: mediaType || 'image',
        media: mediaUrl,
        caption: messageText || '',
      };
      if (mediaType === 'document' && mediaFileName) {
        mediaBody.fileName = mediaFileName;
      }

      const mediaRes = await fetch(mediaEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify(mediaBody),
      });

      const mediaData = await mediaRes.json();

      return new Response(JSON.stringify({
        success: mediaRes.ok,
        data: mediaData,
      }), {
        status: mediaRes.ok ? 200 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send text message
    const textEndpoint = `${apiUrl}/message/sendText/${instanceName}`;
    const textRes = await fetch(textEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: messageText || '',
      }),
    });

    const textData = await textRes.json();

    return new Response(JSON.stringify({
      success: textRes.ok,
      data: textData,
    }), {
      status: textRes.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('WhatsApp send error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
