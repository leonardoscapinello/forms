import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// SHA-256 hash helper (for PII hashing required by Conversions APIs)
async function sha256(value: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fetch pixel config from integration_settings table
async function fetchPixelConfig(supabaseAdmin: ReturnType<typeof createClient>): Promise<Record<string, any>> {
  const { data } = await supabaseAdmin
    .from('integration_settings')
    .select('config')
    .eq('integration_type', 'pixels')
    .maybeSingle();
  return (data?.config as Record<string, any>) || {};
}

// Save event log to database
async function saveEventLog(supabaseAdmin: ReturnType<typeof createClient>, logEntry: {
  form_id: string;
  response_id?: string;
  platform: string;
  event_name: string;
  event_id?: string;
  trigger_type: string;
  fired_client: boolean;
  fired_server: boolean;
  server_response?: Record<string, any>;
  source_url?: string;
  user_agent?: string;
  custom_params?: Record<string, any>;
}) {
  try {
    await supabaseAdmin.from('pixel_events_log').insert(logEntry);
  } catch (e) {
    console.error('Failed to save pixel event log:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Supabase admin client for DB access and logging
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const {
      platform,
      eventName,
      eventId,
      formId,
      triggerType = 'flow_node', // 'load_event' | 'flow_node'
      firedClient = false,        // was client-side already fired?
      responseId,
      webhookPayload,
      answers,
      variables,
      userData,
      sourceUrl,
      userAgent,
      customParams,
    } = body;

    // Fetch pixel config from DB (not from env secrets)
    const pixelConfig = await fetchPixelConfig(supabaseAdmin);

    const results: Record<string, any> = {};
    let serverFired = false;

    // Resolve fields
    const resolvedSourceUrl = sourceUrl || '';
    const resolvedFormId = formId || webhookPayload?.event?.form_id || '';
    const resolvedVariables = variables || webhookPayload?.variables || {};
    const resolvedUserData = userData || (() => {
      const ans = webhookPayload?.answers || {};
      let email: string | undefined;
      let phone: string | undefined;
      for (const val of Object.values(ans)) {
        if (typeof val === 'string' && val.includes('@')) email = val;
        if (typeof val === 'object' && val !== null && (val as any).full_number) {
          phone = (val as any).full_number;
        }
      }
      return { email, phone };
    })();

    // ── Meta Conversions API ──────────────────────────────────────────────────
    if (platform === 'meta_pixel') {
      const pixelId = pixelConfig.metaPixelId;
      const accessToken = pixelConfig.metaCapiToken;
      const enabled = pixelConfig.metaEnabled;

      if (!enabled || !pixelId || !accessToken) {
        results.meta = { skipped: true, reason: !enabled ? 'Meta Pixel disabled in settings' : 'Pixel ID or CAPI Token not configured in Settings → Integrations' };
      } else {
        const userData_hashed: Record<string, string> = {};
        if (resolvedUserData?.email) userData_hashed.em = await sha256(resolvedUserData.email);
        if (resolvedUserData?.phone) {
          userData_hashed.ph = await sha256(resolvedUserData.phone.replace(/\D/g, ''));
        }

        const customData: Record<string, any> = {
          form_id: resolvedFormId,
          ...(customParams || {}),
          ...Object.fromEntries(Object.entries(resolvedVariables).map(([k, v]) => [`var_${k}`, v])),
        };

        const payload = {
          data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            event_source_url: resolvedSourceUrl,
            action_source: 'website',
            user_data: userData_hashed,
            custom_data: customData,
          }],
        };

        const res = await fetch(
          `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        const data = await res.json();
        results.meta = { ok: res.ok, data };
        if (res.ok) serverFired = true;
      }
    }

    // ── Google Analytics 4 Measurement Protocol ───────────────────────────────
    if (platform === 'google_analytics') {
      const measurementId = pixelConfig.ga4MeasurementId;
      const apiSecret = pixelConfig.ga4ApiSecret;
      const enabled = pixelConfig.ga4Enabled;

      if (!enabled || !measurementId || !apiSecret) {
        results.ga4 = { skipped: true, reason: !enabled ? 'GA4 disabled in settings' : 'Measurement ID or API Secret not configured in Settings → Integrations' };
      } else {
        const payload = {
          client_id: eventId,
          events: [{
            name: eventName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            params: {
              engagement_time_msec: 1,
              form_id: resolvedFormId,
              event_dedup_id: eventId,
              ...(customParams || {}),
              ...Object.fromEntries(Object.entries(resolvedVariables).map(([k, v]) => [`var_${k}`, v])),
            },
          }],
        };

        const res = await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        results.ga4 = { ok: res.ok, status: res.status };
        if (res.ok) serverFired = true;
      }
    }

    // ── TikTok Events API ─────────────────────────────────────────────────────
    if (platform === 'tiktok_pixel') {
      const pixelId = pixelConfig.tiktokPixelId;
      const accessToken = pixelConfig.tiktokAccessToken;
      const enabled = pixelConfig.tiktokEnabled;

      if (!enabled || !pixelId || !accessToken) {
        results.tiktok = { skipped: true, reason: !enabled ? 'TikTok Pixel disabled in settings' : 'Pixel ID or Access Token not configured in Settings → Integrations' };
      } else {
        const userData_hashed: Record<string, string> = {};
        if (resolvedUserData?.email) userData_hashed.email = await sha256(resolvedUserData.email);
        if (resolvedUserData?.phone) {
          userData_hashed.phone_number = await sha256(resolvedUserData.phone.replace(/\D/g, ''));
        }

        const payload = {
          pixel_code: pixelId,
          event: eventName,
          event_id: eventId,
          timestamp: new Date().toISOString(),
          context: {
            page: { url: resolvedSourceUrl },
            user: userData_hashed,
          },
          properties: {
            contents: [{ content_id: resolvedFormId }],
            ...(customParams || {}),
            ...Object.fromEntries(Object.entries(resolvedVariables).map(([k, v]) => [`var_${k}`, v])),
          },
        };

        const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Access-Token': accessToken },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        results.tiktok = { ok: res.ok, data };
        if (res.ok) serverFired = true;
      }
    }

    // ── LinkedIn Conversions API ───────────────────────────────────────────────
    if (platform === 'linkedin_pixel') {
      const partnerId = pixelConfig.linkedinPartnerId;
      const accessToken = pixelConfig.linkedinAccessToken;
      const conversionId = pixelConfig.linkedinConversionId;
      const enabled = pixelConfig.linkedinEnabled;

      if (!enabled || !partnerId || !accessToken || !conversionId) {
        results.linkedin = { skipped: true, reason: !enabled ? 'LinkedIn Pixel disabled in settings' : 'Partner ID, Access Token or Conversion ID not configured in Settings → Integrations' };
      } else {
        const userData_hashed: Record<string, any> = {};
        if (resolvedUserData?.email) userData_hashed.email = await sha256(resolvedUserData.email);

        const payload = {
          conversion: `urn:lla:llaPartnerConversion:${conversionId}`,
          conversionHappenedAt: Date.now(),
          user: userData_hashed,
          eventId,
        };

        const res = await fetch('https://api.linkedin.com/rest/conversionEvents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'LinkedIn-Version': '202401',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify(payload),
        });
        results.linkedin = { ok: res.ok, status: res.status };
        if (res.ok) serverFired = true;
      }
    }

    // ── Webhook ───────────────────────────────────────────────────────────────
    if (platform === 'webhook') {
      const url = body.webhookUrl;
      const method = body.webhookMethod || 'POST';

      if (!url) {
        results.webhook = { skipped: true, reason: 'No URL configured on the node' };
      } else {
        const outPayload = webhookPayload || {
          event: {
            id: eventId,
            form_id: resolvedFormId,
            landed_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
          },
          respondent: {
            ip: body.respondentIp ?? null,
            user_agent: userAgent ?? null,
            geolocation: null,
          },
          answers: answers || {},
          answers_raw: answers || {},
          variables: resolvedVariables,
          query_params: body.queryParams || {},
          meta: Object.keys(body.webhookParams || {}).length > 0 ? body.webhookParams : undefined,
        };

        let webhookResponseBody: Record<string, any> | null = null;
        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method !== 'GET' ? JSON.stringify(outPayload) : undefined,
          });
          results.webhook = { ok: res.ok, status: res.status };
          serverFired = res.ok;
          // Try to parse response body (for variable mapping)
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            try { webhookResponseBody = await res.json(); } catch { /* ignore */ }
          }
        } catch (fetchErr) {
          results.webhook = { ok: false, error: String(fetchErr) };
        }

        // Log webhook fires as analytics event too
        await saveEventLog(supabaseAdmin, {
          form_id: resolvedFormId,
          response_id: responseId,
          platform: 'webhook',
          event_name: 'webhook_fired',
          event_id: eventId,
          trigger_type: triggerType,
          fired_client: firedClient,
          fired_server: serverFired,
          server_response: results,
          source_url: resolvedSourceUrl,
          user_agent: userAgent,
          custom_params: customParams,
        });

        return new Response(JSON.stringify({ success: true, results, webhookResponseBody }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Save pixel event log ──────────────────────────────────────────────────
    if (platform !== 'webhook') {
      await saveEventLog(supabaseAdmin, {
        form_id: resolvedFormId,
        response_id: responseId,
        platform,
        event_name: eventName,
        event_id: eventId,
        trigger_type: triggerType,
        fired_client: firedClient,
        fired_server: serverFired,
        server_response: results,
        source_url: resolvedSourceUrl,
        user_agent: userAgent,
        custom_params: customParams,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
