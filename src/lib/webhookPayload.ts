/**
 * Builds the structured webhook payload sent by the form engine.
 *
 * Shape:
 * {
 *   event: { id, form_id, form_name, response_id, landed_at, submitted_at },
 *   respondent: { ip, user_agent, geolocation },
 *   answers: { [fieldName]: <typed value> },
 *   answers_raw: { [elementId]: <raw value> },  // always present as fallback
 *   variables: { [varName]: value },
 *   query_params: { [key]: value },
 *   meta: { [key]: value }   // static extra params configured on the node
 * }
 */

import { PageElement } from '@/types/pageElements';
import { FormData as AppFormData } from '@/types/form';

export interface WebhookRespondentInfo {
  ip?: string;
  user_agent?: string;
  geolocation?: {
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
}

/** Build a map: elementId → fieldName (falling back to elementId) */
export function buildFieldNameMap(form: AppFormData): Record<string, string> {
  const map: Record<string, string> = {};
  const allElements: PageElement[] = [];

  for (const page of form.pages || []) {
    allElements.push(...(page.elements || []));
  }
  if (form.welcomePage) allElements.push(...(form.welcomePage.elements || []));
  if (form.thankYouPage) allElements.push(...(form.thankYouPage.elements || []));

  for (const el of allElements) {
    map[el.id] = el.fieldName || el.id;
  }
  return map;
}

/** Resolve the typed value for a given element from its raw answer */
function resolveTypedAnswer(
  element: PageElement,
  rawValue: any,
): any {
  if (rawValue === undefined || rawValue === null) return null;

  switch (element.type) {
    case 'input_address': {
      // AddressValue: { country, cep, street, number, complement, neighborhood, city, state }
      if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        return {
          country: rawValue.country ?? null,
          postal_code: rawValue.cep ?? null,
          street: rawValue.street ?? null,
          number: rawValue.number ?? null,
          complement: rawValue.complement ?? null,
          neighborhood: rawValue.neighborhood ?? null,
          city: rawValue.city ?? null,
          state: rawValue.state ?? null,
          formatted: [
            rawValue.street,
            rawValue.number,
            rawValue.complement,
            rawValue.neighborhood,
            rawValue.city,
            rawValue.state,
            rawValue.country,
          ].filter(Boolean).join(', '),
        };
      }
      return rawValue;
    }

    case 'input_phone': {
      // PhoneValue: { countryCode, ddi, number }
      if (typeof rawValue === 'object' && !Array.isArray(rawValue) && rawValue.number !== undefined) {
        return {
          country_code: rawValue.countryCode ?? null,
          ddi: rawValue.ddi ?? null,
          number: rawValue.number ?? null,
          full_number: rawValue.ddi && rawValue.number
            ? `+${rawValue.ddi}${rawValue.number.replace(/\D/g, '')}`
            : rawValue.number ?? null,
        };
      }
      return rawValue;
    }

    case 'input_multi_select': {
      // Array of option IDs → resolve to labels if possible
      if (Array.isArray(rawValue)) {
        const opts = element.options || [];
        return rawValue.map((id: string) => {
          const opt = opts.find(o => o.id === id);
          return opt ? { id: opt.id, label: opt.label } : { id };
        });
      }
      return rawValue;
    }

    case 'input_select':
    case 'input_radio':
    case 'input_quiz_icon':
    case 'input_quiz_image': {
      // Single option ID → resolve to { id, label }
      const opts = element.options || [];
      const opt = opts.find(o => o.id === rawValue);
      return opt ? { id: opt.id, label: opt.label } : rawValue;
    }

    case 'input_yes_no':
      return rawValue === 'yes' ? true : rawValue === 'no' ? false : rawValue;

    case 'input_rating':
    case 'input_nps':
    case 'input_number':
      return typeof rawValue === 'string' ? Number(rawValue) : rawValue;

    case 'input_height':
    case 'input_weight': {
      // HeightWeightValue: { value: number, unit: string }
      if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        return { value: rawValue.value ?? null, unit: rawValue.unit ?? null };
      }
      return rawValue;
    }

    default:
      return rawValue;
  }
}

export interface PixelEventRecord {
  platform: string;
  event_name: string;
  event_id: string;
  trigger_type: string;
  fired_client: boolean;
  fired_server: boolean;
  fired_at: string;
  custom_params?: Record<string, any>;
}

export interface WhatsAppMessageRecord {
  /** Unique ID for this message dispatch */
  id: string;
  /** Evolution API instance used */
  instance_id: string;
  instance_name: string;
  /** Recipient phone (cleaned) */
  recipient: string;
  /** Message content sent */
  message: string;
  /** Whether media was attached */
  has_media: boolean;
  media_type?: 'image' | 'document' | 'video' | 'audio' | null;
  media_url?: string | null;
  /** Delivery status: 'sent' | 'failed' | 'pending' */
  status: 'sent' | 'failed' | 'pending';
  /** Error message if failed */
  error?: string | null;
  /** ISO timestamp of when the message was dispatched */
  sent_at: string;
  /** Node ID in the workflow that triggered this message */
  node_id?: string | null;
}

export interface BuildWebhookPayloadOptions {
  form: AppFormData;
  answers: Record<string, any>;
  respondent?: WebhookRespondentInfo;
  responseId?: string;
  responseHash?: string;
  landedAt?: string;
  submittedAt?: string;
  extraParams?: Record<string, any>;
  queryParams?: Record<string, string>;
  sourceUrl?: string;
  referrer?: string;
  pixelEvents?: PixelEventRecord[];
  whatsappMessages?: WhatsAppMessageRecord[];
}

export function buildWebhookPayload(opts: BuildWebhookPayloadOptions) {
  const {
    form,
    answers,
    respondent = {},
    responseId,
    landedAt,
    submittedAt,
    extraParams = {},
    queryParams = {},
    sourceUrl,
    referrer,
  } = opts;

  // Build element lookup
  const elementMap: Record<string, PageElement> = {};
  for (const page of form.pages || []) {
    for (const el of page.elements || []) elementMap[el.id] = el;
  }
  if (form.welcomePage) {
    for (const el of form.welcomePage.elements || []) elementMap[el.id] = el;
  }
  if (form.thankYouPage) {
    for (const el of form.thankYouPage.elements || []) elementMap[el.id] = el;
  }

  // Typed answers keyed by fieldName
  const typedAnswers: Record<string, any> = {};
  // Raw answers keyed by elementId (fallback / debugging)
  const rawAnswers: Record<string, any> = {};
  // User data extracted for PII hashing (email, phone)
  const userData: { email?: string; phone?: string } = {};

  // Rich fields array with question metadata + answer
  const fields: any[] = [];

  for (const [elementId, rawValue] of Object.entries(answers)) {
    if (elementId.startsWith('__var_') || elementId.startsWith('__webhook_')) continue;
    if (elementId.includes('.')) continue;

    const element = elementMap[elementId];
    if (!element) continue;
    if (!element.type.startsWith('input_')) continue;

    const key = element.fieldName || elementId;
    const typed = resolveTypedAnswer(element, rawValue);

    typedAnswers[key] = typed;
    rawAnswers[elementId] = rawValue;

    // Build rich field entry with label + answer together
    fields.push({
      field_id: elementId,
      field_name: key,
      type: element.type.replace('input_', ''),
      label: element.label || element.placeholder || null,
      answer: typed,
      answer_raw: rawValue,
      required: element.required ?? false,
      options: element.options?.map(o => ({ id: o.id, label: o.label })) || undefined,
    });

    // Extract PII for pixel/CAPI
    if (element.type === 'input_email' && typeof rawValue === 'string') {
      userData.email = rawValue;
    }
    if (element.type === 'input_phone') {
      if (typeof rawValue === 'object' && rawValue?.number) {
        userData.phone = rawValue.full_number ?? String(rawValue.number);
      } else if (typeof rawValue === 'string') {
        userData.phone = rawValue;
      }
    }
  }

  // Variables (exclude internal __var_ prefix)
  const variables: Record<string, any> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (k.startsWith('__var_')) {
      variables[k.replace('__var_', '')] = v;
    }
  }

  const now = new Date().toISOString();
  const landedAtTs = landedAt || now;
  const submittedAtTs = submittedAt || now;
  const totalTimeMs = new Date(submittedAtTs).getTime() - new Date(landedAtTs).getTime();

  return {
    payload: {
      /** Event & form metadata */
      event: {
        id: responseId || crypto.randomUUID(),
        hash: opts.responseHash || null,
        form_id: form.id,
        form_name: form.title,
        form_status: form.status,
        total_pages: (form.pages || []).length,
        landed_at: landedAtTs,
        submitted_at: submittedAtTs,
        total_time_ms: totalTimeMs > 0 ? totalTimeMs : null,
        total_time_seconds: totalTimeMs > 0 ? Math.round(totalTimeMs / 1000) : null,
      },

      /** Respondent context */
      respondent: {
        ip: respondent.ip ?? null,
        user_agent: respondent.user_agent ?? null,
        geolocation: respondent.geolocation ?? null,
      },

      /** Navigation & source */
      navigation: {
        source_url: sourceUrl || null,
        referrer: referrer || null,
        query_params: queryParams,
      },

      /** Rich fields with question metadata + answer */
      fields,

      /** Typed & named answers (flat) */
      answers: typedAnswers,

      /** Raw answers keyed by element ID */
      answers_raw: rawAnswers,

      /** Form variables at submission time */
      variables,

      /** Pixel/analytics events fired during this session */
      pixel_events: opts.pixelEvents && opts.pixelEvents.length > 0 ? {
        total_fired: opts.pixelEvents.length,
        events: opts.pixelEvents.map(pe => ({
          platform: pe.platform,
          event_name: pe.event_name,
          event_id: pe.event_id,
          trigger_type: pe.trigger_type,
          fired_client: pe.fired_client,
          fired_server: pe.fired_server,
          fired_at: pe.fired_at,
          custom_params: pe.custom_params || undefined,
        })),
      } : undefined,

      /** WhatsApp messages dispatched during this workflow */
      whatsapp_messages: opts.whatsappMessages && opts.whatsappMessages.length > 0 ? {
        total_sent: opts.whatsappMessages.filter(m => m.status === 'sent').length,
        total_failed: opts.whatsappMessages.filter(m => m.status === 'failed').length,
        messages: opts.whatsappMessages.map(wm => ({
          id: wm.id,
          instance_id: wm.instance_id,
          instance_name: wm.instance_name,
          recipient: wm.recipient,
          message: wm.message,
          has_media: wm.has_media,
          media_type: wm.media_type || undefined,
          media_url: wm.media_url || undefined,
          status: wm.status,
          error: wm.error || undefined,
          sent_at: wm.sent_at,
          node_id: wm.node_id || undefined,
        })),
      } : undefined,

      /** Static extra params configured on the webhook node */
      meta: Object.keys(extraParams).length > 0 ? extraParams : undefined,
    },
    userData,
  };
}
