import {
  type FormInterpolationVariable,
  resolveFormVariableValues,
} from "./formInterpolation.ts";

const MAX_VALUE_DEPTH = 12;
const MAX_ARRAY_ITEMS = 250;
const MAX_OBJECT_KEYS = 250;
const MAX_TOTAL_KEYS = 3_000;
const MAX_STRING_BYTES = 50_000;
const MAX_TOTAL_STRING_BYTES = 160_000;
const MAX_PAYLOAD_BYTES = 220_000;

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const encoder = new TextEncoder();

export class WebhookRequestPayloadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "WebhookRequestPayloadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SanitizeBudget = { keys: number; stringBytes: number };

function sanitizeJsonValue(
  value: unknown,
  budget: SanitizeBudget,
  depth = 0,
): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new WebhookRequestPayloadError("webhook_payload_invalid_number");
    }
    return value;
  }
  if (typeof value === "string") {
    const bytes = encoder.encode(value).byteLength;
    if (bytes > MAX_STRING_BYTES) {
      throw new WebhookRequestPayloadError("webhook_payload_string_too_large");
    }
    budget.stringBytes += bytes;
    if (budget.stringBytes > MAX_TOTAL_STRING_BYTES) {
      throw new WebhookRequestPayloadError("webhook_payload_strings_too_large");
    }
    return value;
  }
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") {
    throw new WebhookRequestPayloadError("webhook_payload_invalid_value");
  }
  if (depth >= MAX_VALUE_DEPTH) {
    throw new WebhookRequestPayloadError("webhook_payload_too_deep");
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw new WebhookRequestPayloadError("webhook_payload_array_too_large");
    }
    return value.map((item) => {
      const sanitized = sanitizeJsonValue(item, budget, depth + 1);
      return sanitized === undefined ? null : sanitized;
    });
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    throw new WebhookRequestPayloadError("webhook_payload_object_too_large");
  }
  const sanitized: Record<string, unknown> = Object.create(null);
  for (const [key, nested] of entries) {
    if (DANGEROUS_KEYS.has(key.toLowerCase())) continue;
    budget.keys += 1;
    if (budget.keys > MAX_TOTAL_KEYS) {
      throw new WebhookRequestPayloadError("webhook_payload_too_many_keys");
    }
    const safeValue = sanitizeJsonValue(nested, budget, depth + 1);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }
  return sanitized;
}

function sanitizeRecord(
  value: unknown,
  budget: SanitizeBudget,
): Record<string, unknown> {
  return isRecord(value)
    ? sanitizeJsonValue(value, budget) as Record<string, unknown>
    : Object.create(null);
}

function safeText(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, maxLength)
    : null;
}

function safeLandedAt(value: unknown, nowMs: number): string {
  if (typeof value !== "string") return new Date(nowMs).toISOString();
  const parsed = Date.parse(value);
  const earliest = nowMs - 24 * 60 * 60 * 1_000;
  const latest = nowMs + 5 * 60 * 1_000;
  return Number.isFinite(parsed) && parsed >= earliest && parsed <= latest
    ? new Date(parsed).toISOString()
    : new Date(nowMs).toISOString();
}

function collectInputElements(form: Record<string, unknown>): Record<string, unknown>[] {
  const collected: Record<string, unknown>[] = [];
  const visitElements = (value: unknown, depth: number): void => {
    if (!Array.isArray(value) || depth > 8 || collected.length >= 500) return;
    for (const candidate of value.slice(0, 500 - collected.length)) {
      if (!isRecord(candidate)) continue;
      if (
        typeof candidate.id === "string" && candidate.id.length <= 256 &&
        typeof candidate.type === "string" && candidate.type.startsWith("input_") &&
        !DANGEROUS_KEYS.has(candidate.id.toLowerCase())
      ) collected.push(candidate);
      if (candidate.type === "columns" && Array.isArray(candidate.columnData)) {
        for (const column of candidate.columnData.slice(0, 20)) {
          if (isRecord(column)) visitElements(column.elements, depth + 1);
        }
      }
    }
  };
  const pages = Array.isArray(form.pages) ? form.pages.slice(0, 250) : [];
  for (const page of pages) {
    if (isRecord(page)) visitElements(page.elements, 0);
  }
  for (const specialPage of [form.welcomePage, form.thankYouPage]) {
    if (isRecord(specialPage)) visitElements(specialPage.elements, 0);
  }
  return collected;
}

function buildFieldNameMap(
  elements: Record<string, unknown>[],
): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  for (const element of elements) {
    const id = String(element.id);
    const configuredName = typeof element.fieldName === "string"
      ? element.fieldName.trim()
      : "";
    const base = configuredName && configuredName.length <= 256
      ? configuredName
      : id;
    if (DANGEROUS_KEYS.has(base.toLowerCase())) continue;
    let candidate = base;
    let suffix = nextSuffix.get(base) ?? 2;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    nextSuffix.set(base, suffix);
    used.add(candidate);
    result.set(id, candidate);
  }
  return result;
}

function optionList(element: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(element.options)) return [];
  return element.options.slice(0, 100).filter(isRecord);
}

function resolveTypedAnswer(
  element: Record<string, unknown>,
  rawValue: unknown,
): unknown {
  const type = String(element.type || "");
  if (rawValue === undefined || rawValue === null) return null;
  if (type === "input_address" && isRecord(rawValue)) {
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
      ].filter((part) => typeof part === "string" && part.length > 0).join(", "),
    };
  }
  if (type === "input_phone" && isRecord(rawValue)) {
    const ddi = String(rawValue.ddi ?? "").replace(/\D/g, "");
    const number = String(rawValue.number ?? "").replace(/\D/g, "");
    return {
      country_code: rawValue.countryCode ?? null,
      ddi: rawValue.ddi ?? null,
      number: rawValue.number ?? null,
      full_number: number ? `${ddi ? `+${ddi}` : ""}${number}` : null,
    };
  }
  const options = optionList(element);
  if (type === "input_multi_select" && Array.isArray(rawValue)) {
    return rawValue.map((id) => {
      const option = options.find((candidate) => candidate.id === id);
      return option
        ? { id: option.id, label: option.label ?? null }
        : { id };
    });
  }
  if (
    ["input_select", "input_radio", "input_quiz_icon", "input_quiz_image"]
      .includes(type)
  ) {
    const option = options.find((candidate) => candidate.id === rawValue);
    return option
      ? { id: option.id, label: option.label ?? null }
      : rawValue;
  }
  if (type === "input_yes_no") {
    return rawValue === "yes" ? true : rawValue === "no" ? false : rawValue;
  }
  if (["input_rating", "input_nps", "input_number"].includes(type)) {
    const numeric = typeof rawValue === "string" ? Number(rawValue) : rawValue;
    return typeof numeric === "number" && Number.isFinite(numeric)
      ? numeric
      : rawValue;
  }
  if (["input_height", "input_weight"].includes(type) && isRecord(rawValue)) {
    return { value: rawValue.value ?? null, unit: rawValue.unit ?? null };
  }
  return rawValue;
}

function buildFilteredAnswers(
  form: Record<string, unknown>,
  candidate: unknown,
  budget: SanitizeBudget,
): {
  rawAnswers: Record<string, unknown>;
  typedAnswers: Record<string, unknown>;
  fields: Record<string, unknown>[];
} {
  const source = isRecord(candidate) ? candidate : {};
  const elements = collectInputElements(form);
  const fieldNames = buildFieldNameMap(elements);
  const rawAnswers: Record<string, unknown> = Object.create(null);
  const typedAnswers: Record<string, unknown> = Object.create(null);
  const fields: Record<string, unknown>[] = [];

  for (const element of elements) {
    const id = String(element.id);
    if (!fieldNames.has(id) || !Object.prototype.hasOwnProperty.call(source, id)) {
      continue;
    }
    const rawValue = sanitizeJsonValue(source[id], budget, 1);
    if (rawValue === undefined) continue;
    const fieldName = fieldNames.get(id) as string;
    const typedValue = resolveTypedAnswer(element, rawValue);
    rawAnswers[id] = rawValue;
    typedAnswers[fieldName] = typedValue;
    const options = optionList(element).map((option) => ({
      id: option.id ?? null,
      label: option.label ?? null,
    }));
    fields.push({
      field_id: id,
      field_name: fieldName,
      type: String(element.type).replace(/^input_/, ""),
      label: safeText(element.label, 1_000) || safeText(element.placeholder, 1_000),
      answer: typedValue,
      answer_raw: rawValue,
      required: element.required === true,
      ...(options.length > 0 ? { options } : {}),
    });
  }
  return { rawAnswers, typedAnswers, fields };
}

function configuredFormVariables(
  form: Record<string, unknown>,
): FormInterpolationVariable[] {
  const configured = Array.isArray(form.variables)
    ? form.variables.slice(0, 250)
    : [];
  return configured.flatMap((variable): FormInterpolationVariable[] => {
    if (!isRecord(variable)) return [];
    const id = typeof variable.id === "string" ? variable.id : "";
    const name = typeof variable.name === "string" ? variable.name : "";
    if (
      !name || name.length > 256 || DANGEROUS_KEYS.has(name.toLowerCase()) ||
      id.length > 256
    ) return [];
    return [{
      id,
      name,
      type: typeof variable.type === "string" ? variable.type : undefined,
      defaultValue: variable.defaultValue,
      sourceElementId: typeof variable.sourceElementId === "string"
        ? variable.sourceElementId
        : undefined,
    }];
  });
}

function buildVariableRuntimeAnswers(
  form: Record<string, unknown>,
  rawAnswers: Record<string, unknown>,
  fallbackAnswers: unknown,
  legacyVariables: unknown,
  queryParams: Record<string, unknown>,
  budget: SanitizeBudget,
): Record<string, unknown> {
  const runtime: Record<string, unknown> = Object.assign(
    Object.create(null),
    rawAnswers,
  );
  const source = isRecord(fallbackAnswers) ? fallbackAnswers : {};
  const hasRuntimeEnvelope = isRecord(fallbackAnswers);
  const legacy = isRecord(legacyVariables) ? legacyVariables : {};
  const variables = configuredFormVariables(form);

  for (const [key, value] of Object.entries(queryParams).slice(0, 250)) {
    if (!key || key.length > 256 || DANGEROUS_KEYS.has(key.toLowerCase())) {
      continue;
    }
    runtime[`__param_${key}`] = value;
  }

  const webhookNodeIds = new Set(
    (Array.isArray(form.integrationNodes) ? form.integrationNodes : [])
      .slice(0, 250)
      .flatMap((node) =>
        isRecord(node) && typeof node.id === "string" ? [node.id] : []
      ),
  );
  for (const [key, candidate] of Object.entries(source).slice(0, 1_000)) {
    const isContext = /^__ctx_[A-Za-z0-9_.-]{1,128}$/.test(key);
    const isParam = /^__param_[A-Za-z0-9_.-]{1,256}$/.test(key);
    const webhookId = key.startsWith("__webhook_")
      ? key.slice("__webhook_".length)
      : "";
    if (!isContext && !isParam && !webhookNodeIds.has(webhookId)) continue;
    const value = sanitizeJsonValue(candidate, budget, 1);
    if (value !== undefined) runtime[key] = value;
  }

  for (const variable of variables) {
    const overrideKey = `__var_${variable.name}`;
    if (Object.prototype.hasOwnProperty.call(source, overrideKey)) {
      const value = sanitizeJsonValue(source[overrideKey], budget, 1);
      runtime[overrideKey] = value === undefined ? "" : value;
      continue;
    }

    // Backward compatibility for clients released before runtime answers were
    // sent separately. Response variables are always recalculated from their
    // allowlisted source field; other legacy entries remain configured-name
    // scoped and are fed through the canonical resolver as explicit values.
    if (hasRuntimeEnvelope || variable.type === "response") continue;
    const legacyKey = Object.prototype.hasOwnProperty.call(
        legacy,
        variable.name || "",
      )
      ? variable.name || ""
      : variable.id && Object.prototype.hasOwnProperty.call(legacy, variable.id)
      ? variable.id
      : "";
    if (!legacyKey) continue;
    const value = sanitizeJsonValue(legacy[legacyKey], budget, 1);
    runtime[overrideKey] = value === undefined ? "" : value;
  }
  return runtime;
}

function buildFilteredVariables(
  form: Record<string, unknown>,
  runtimeAnswers: Record<string, unknown>,
  budget: SanitizeBudget,
): Record<string, unknown> {
  const resolved = resolveFormVariableValues(
    configuredFormVariables(form),
    runtimeAnswers,
  );
  const result: Record<string, unknown> = Object.create(null);
  for (const [name, candidate] of Object.entries(resolved)) {
    const value = sanitizeJsonValue(candidate, budget, 1);
    result[name] = value === undefined ? "" : value;
  }
  return result;
}

export type AuthoritativeWebhookPayloadOptions = {
  formData: unknown;
  formId: string;
  responseId?: string;
  eventId?: string;
  clientPayload?: unknown;
  fallbackAnswers?: unknown;
  fallbackVariables?: unknown;
  queryParams?: unknown;
  configuredMeta?: unknown;
  sourceUrl?: unknown;
  requestIp?: string | null;
  requestUserAgent?: string | null;
  nowMs?: number;
};

/**
 * Rebuilds the outbound body from a fixed server-owned schema. The browser may
 * supply respondent values, but cannot inject destination/config fields,
 * replace event identity, override `meta`, or add arbitrary top-level keys.
 */
export function buildAuthoritativeWebhookPayload({
  formData,
  formId,
  responseId,
  eventId,
  clientPayload,
  fallbackAnswers,
  fallbackVariables,
  queryParams,
  configuredMeta,
  sourceUrl,
  requestIp = null,
  requestUserAgent = null,
  nowMs = Date.now(),
}: AuthoritativeWebhookPayloadOptions): Record<string, unknown> {
  const form = isRecord(formData) ? formData : {};
  const client = isRecord(clientPayload) ? clientPayload : {};
  const clientEvent = isRecord(client.event) ? client.event : {};
  const clientNavigation = isRecord(client.navigation) ? client.navigation : {};
  const budget: SanitizeBudget = { keys: 0, stringBytes: 0 };

  const answerSource = isRecord(client.answers_raw)
    ? client.answers_raw
    : fallbackAnswers;
  const { rawAnswers, typedAnswers, fields } = buildFilteredAnswers(
    form,
    answerSource,
    budget,
  );
  const resolvedQueryParams = sanitizeRecord(
    isRecord(queryParams) ? queryParams : clientNavigation.query_params,
    budget,
  );
  const runtimeAnswers = buildVariableRuntimeAnswers(
    form,
    rawAnswers,
    fallbackAnswers,
    isRecord(client.variables) ? client.variables : fallbackVariables,
    resolvedQueryParams,
    budget,
  );
  const resolvedVariables = buildFilteredVariables(
    form,
    runtimeAnswers,
    budget,
  );
  const meta = sanitizeRecord(configuredMeta, budget);

  const submittedAt = new Date(nowMs).toISOString();
  const landedAt = safeLandedAt(clientEvent.landed_at, nowMs);
  const elapsedMs = Math.max(0, nowMs - Date.parse(landedAt));
  const payload: Record<string, unknown> = {
    event: {
      id: safeText(responseId, 256) || safeText(eventId, 256) || formId,
      form_id: formId,
      form_name: safeText(form.title, 300) || "",
      form_status: safeText(form.status, 40) || "",
      total_pages: Array.isArray(form.pages) ? form.pages.length : 0,
      landed_at: landedAt,
      submitted_at: submittedAt,
      total_time_ms: elapsedMs || null,
      total_time_seconds: elapsedMs ? Math.round(elapsedMs / 1_000) : null,
    },
    respondent: {
      ip: safeText(requestIp, 128),
      user_agent: safeText(requestUserAgent, 1_000),
      geolocation: null,
    },
    navigation: {
      source_url: safeText(sourceUrl, 4_096),
      referrer: safeText(clientNavigation.referrer, 4_096),
      query_params: resolvedQueryParams,
    },
    fields,
    answers: typedAnswers,
    answers_raw: rawAnswers,
    variables: resolvedVariables,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };

  const serializedBytes = encoder.encode(JSON.stringify(payload)).byteLength;
  if (serializedBytes > MAX_PAYLOAD_BYTES) {
    throw new WebhookRequestPayloadError("webhook_payload_too_large");
  }
  return payload;
}
