import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SHA-256 hash helper (for PII hashing required by Conversions APIs)
async function sha256(value: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      platform,
      eventName,
      eventId,       // deduplication ID (same as client-side)
      formId,
      answers,       // { [elementId]: value }
      variables,     // { [varName]: value }
      userData,      // { email?, phone? } — raw, will be hashed
      sourceUrl,
      customParams,  // { [key]: value } — extra params per platform
    } = body;

    const results: Record<string, any> = {};

    // ── Meta Conversions API ──────────────────────────────────────────────────
    if (platform === 'meta_pixel') {
      const pixelId = Deno.env.get('META_PIXEL_ID');
      const accessToken = Deno.env.get('META_CAPI_TOKEN');

      if (!pixelId || !accessToken) {
        results.meta = { skipped: true, reason: 'META_PIXEL_ID or META_CAPI_TOKEN not configured' };
      } else {
        const userData_hashed: Record<string, string> = {};
        if (userData?.email) userData_hashed.em = await sha256(userData.email);
        if (userData?.phone) {
          const phoneClean = userData.phone.replace(/\D/g, '');
          userData_hashed.ph = await sha256(phoneClean);
        }

        const payload = {
          data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            event_source_url: sourceUrl || '',
            action_source: 'website',
            user_data: userData_hashed,
            custom_data: {
              form_id: formId,
              ...(customParams || {}),
              ...Object.fromEntries(
                Object.entries(variables || {}).map(([k, v]) => [`var_${k}`, v])
              ),
            },
          }],
        };

        const res = await fetch(
          `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        const data = await res.json();
        results.meta = { ok: res.ok, data };
      }
    }

    // ── Google Analytics 4 Measurement Protocol ───────────────────────────────
    if (platform === 'google_analytics') {
      const measurementId = Deno.env.get('GA4_MEASUREMENT_ID');
      const apiSecret = Deno.env.get('GA4_API_SECRET');

      if (!measurementId || !apiSecret) {
        results.ga4 = { skipped: true, reason: 'GA4_MEASUREMENT_ID or GA4_API_SECRET not configured' };
      } else {
        const payload = {
          client_id: eventId,
          events: [{
            name: eventName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            params: {
              engagement_time_msec: 1,
              form_id: formId,
              event_dedup_id: eventId,
              ...(customParams || {}),
              ...Object.fromEntries(
                Object.entries(variables || {}).map(([k, v]) => [`var_${k}`, v])
              ),
            },
          }],
        };

        const res = await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        results.ga4 = { ok: res.ok, status: res.status };
      }
    }

    // ── TikTok Events API ─────────────────────────────────────────────────────
    if (platform === 'tiktok_pixel') {
      const pixelId = Deno.env.get('TIKTOK_PIXEL_ID');
      const accessToken = Deno.env.get('TIKTOK_ACCESS_TOKEN');

      if (!pixelId || !accessToken) {
        results.tiktok = { skipped: true, reason: 'TIKTOK_PIXEL_ID or TIKTOK_ACCESS_TOKEN not configured' };
      } else {
        const userData_hashed: Record<string, string> = {};
        if (userData?.email) userData_hashed.email = await sha256(userData.email);
        if (userData?.phone) {
          const phoneClean = userData.phone.replace(/\D/g, '');
          userData_hashed.phone_number = await sha256(phoneClean);
        }

        const payload = {
          pixel_code: pixelId,
          event: eventName,
          event_id: eventId,
          timestamp: new Date().toISOString(),
          context: {
            page: { url: sourceUrl || '' },
            user: userData_hashed,
          },
          properties: {
            contents: [{ content_id: formId }],
            ...(customParams || {}),
            ...Object.fromEntries(
              Object.entries(variables || {}).map(([k, v]) => [`var_${k}`, v])
            ),
          },
        };

        const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': accessToken,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        results.tiktok = { ok: res.ok, data };
      }
    }

    // ── LinkedIn Conversions API ───────────────────────────────────────────────
    if (platform === 'linkedin_pixel') {
      const partnerId = Deno.env.get('LINKEDIN_PARTNER_ID');
      const accessToken = Deno.env.get('LINKEDIN_ACCESS_TOKEN');
      const conversionId = Deno.env.get('LINKEDIN_CONVERSION_ID');

      if (!partnerId || !accessToken || !conversionId) {
        results.linkedin = { skipped: true, reason: 'LINKEDIN_PARTNER_ID, LINKEDIN_ACCESS_TOKEN or LINKEDIN_CONVERSION_ID not configured' };
      } else {
        const userData_hashed: Record<string, any> = {};
        if (userData?.email) userData_hashed.email = await sha256(userData.email);

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
      }
    }

    // ── Webhook ───────────────────────────────────────────────────────────────
    if (platform === 'webhook') {
      const url = body.webhookUrl;
      const method = body.webhookMethod || 'POST';
      const extraParams = body.webhookParams || {}; // { key: value } flat object

      if (!url) {
        results.webhook = { skipped: true, reason: 'No URL configured on the node' };
      } else {
        const payload = {
          event_id: eventId,
          form_id: formId,
          timestamp: new Date().toISOString(),
          answers,
          variables,
          source_url: sourceUrl,
          ...extraParams,
        };
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method !== 'GET' ? JSON.stringify(payload) : undefined,
        });
        results.webhook = { ok: res.ok, status: res.status };
      }
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
