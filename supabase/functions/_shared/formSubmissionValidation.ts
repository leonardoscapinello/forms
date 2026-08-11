import { resolvePersistedFormRoute } from "./formRouteValidation.ts";

export const PUBLIC_SUBMISSION_MAX_BODY_BYTES = 128 * 1024;
export const PUBLIC_SUBMISSION_MAX_ANSWERS_BYTES = 96 * 1024;
export const PUBLIC_SUBMISSION_MAX_METADATA_BYTES = 16 * 1024;

const MAX_ANSWER_KEYS = 200;
const MAX_DEPTH = 4;
const MAX_ARRAY_LENGTH = 100;
const MAX_STRING_LENGTH = 10_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INPUT_PREFIX = "input_";

const CONTEXT_KEYS = new Set([
  "device",
  "browser",
  "os",
  "language",
  "screenWidth",
  "screenHeight",
  "date",
  "time",
  "datetime",
  "dayOfWeek",
  "timezone",
  "latitude",
  "longitude",
  "geoCity",
  "geoState",
  "geoCountry",
  "geoCountryCode",
  "geoNeighborhood",
  "geoStreet",
  "geoCep",
  "geoSource",
]);

const DEFAULT_TRACKED_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

const PHONE_COUNTRIES: Record<string, { ddi: string; nationalDigits: number }> = {
  AR: { ddi: "+54", nationalDigits: 10 },
  AU: { ddi: "+61", nationalDigits: 10 },
  BR: { ddi: "+55", nationalDigits: 11 },
  CA: { ddi: "+1", nationalDigits: 10 },
  CL: { ddi: "+56", nationalDigits: 9 },
  CN: { ddi: "+86", nationalDigits: 11 },
  CO: { ddi: "+57", nationalDigits: 10 },
  DE: { ddi: "+49", nationalDigits: 11 },
  ES: { ddi: "+34", nationalDigits: 9 },
  FR: { ddi: "+33", nationalDigits: 10 },
  GB: { ddi: "+44", nationalDigits: 10 },
  IN: { ddi: "+91", nationalDigits: 10 },
  IT: { ddi: "+39", nationalDigits: 10 },
  JP: { ddi: "+81", nationalDigits: 10 },
  MX: { ddi: "+52", nationalDigits: 10 },
  PE: { ddi: "+51", nationalDigits: 9 },
  PT: { ddi: "+351", nationalDigits: 9 },
  PY: { ddi: "+595", nationalDigits: 9 },
  US: { ddi: "+1", nationalDigits: 10 },
  UY: { ddi: "+598", nationalDigits: 8 },
};
const ADDRESS_COUNTRIES = new Set([
  "AR",
  "AU",
  "BR",
  "CA",
  "CL",
  "CO",
  "DE",
  "ES",
  "FR",
  "GB",
  "IT",
  "JP",
  "MX",
  "PT",
  "US",
]);
const COMPOUND_SUB_KEYS: Record<string, readonly string[]> = {
  input_address: [
    "country",
    "cep",
    "street",
    "number",
    "complement",
    "neighborhood",
    "city",
    "state",
  ],
  input_company: [
    "cnpj",
    "razao_social",
    "nome_fantasia",
    "natureza_juridica",
    "porte",
    "abertura",
    "situacao",
    "cnae_principal",
    "cnae_descricao",
    "logradouro",
    "numero",
    "complemento",
    "bairro",
    "municipio",
    "uf",
    "cep",
    "telefone",
    "email",
  ],
  input_document: ["documentType", "value"],
  input_height: ["value", "unit"],
  input_phone: ["countryCode", "ddi", "number"],
  input_weight: ["value", "unit"],
};

type PlainObject = Record<string, unknown>;

type SubmissionValidationSuccess = {
  ok: true;
  answers: PlainObject;
  metadata: PlainObject;
  requiredFieldsEnforced: boolean;
};

type SubmissionValidationFailure = {
  ok: false;
  fields: string[];
};

export type SubmissionValidationResult =
  | SubmissionValidationSuccess
  | SubmissionValidationFailure;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Completion is an operation in the public-save protocol, not a client-owned
 * metadata value. Existing published clients mark that operation by sending
 * the final page duration; legacy service-role calls may temporarily retain
 * the old metadata marker while internal callers are migrated.
 */
export function isCompletionSubmissionRequest(
  kind: unknown,
  action: unknown,
  payload: unknown,
  trustedInternal = false,
): boolean {
  if (kind !== "response" || action !== "upsert" || !isPlainObject(payload)) {
    return false;
  }
  if (payload.completion_time_on_page_ms !== undefined) return true;
  if (!trustedInternal || !isPlainObject(payload.metadata)) return false;
  return payload.metadata.status === "complete" ||
    typeof payload.metadata.submitted_at === "string";
}

function encodedJsonBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      ? new TextEncoder().encode(serialized).byteLength
      : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function hasSafeStructure(
  value: unknown,
  depth = 0,
  budget = { keys: 0 },
): boolean {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= MAX_STRING_LENGTH;
  if (Array.isArray(value)) {
    return value.length <= MAX_ARRAY_LENGTH &&
      value.every((entry) => hasSafeStructure(entry, depth + 1, budget));
  }
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  budget.keys += entries.length;
  if (budget.keys > MAX_ANSWER_KEYS) return false;
  return entries.length <= MAX_ANSWER_KEYS && entries.every(([key, entry]) =>
    key.length <= 200 && !DANGEROUS_KEYS.has(key) &&
    hasSafeStructure(entry, depth + 1, budget)
  );
}

function flattenElements(elements: unknown): PlainObject[] {
  if (!Array.isArray(elements)) return [];
  const flattened: PlainObject[] = [];
  for (const candidate of elements) {
    if (!isPlainObject(candidate)) continue;
    flattened.push(candidate);
    if (candidate.type === "columns" && Array.isArray(candidate.columnData)) {
      for (const column of candidate.columnData) {
        if (isPlainObject(column)) {
          flattened.push(...flattenElements(column.elements));
        }
      }
    }
  }
  return flattened;
}

function formPages(formData: PlainObject): PlainObject[] {
  return Array.isArray(formData.pages)
    ? formData.pages.filter(isPlainObject)
    : [];
}

function inputElements(formData: PlainObject): PlainObject[] {
  const pages = formPages(formData);
  const sources: unknown[] = pages.map((page) => page.elements);
  if (formData.showWelcomeScreen === true && isPlainObject(formData.welcomePage)) {
    sources.push(formData.welcomePage.elements);
  }
  return sources.flatMap(flattenElements).filter((element) =>
    typeof element.id === "string" && element.id.length > 0 &&
    typeof element.type === "string" && element.type.startsWith(INPUT_PREFIX)
  );
}

function containsEarlyNavigation(formData: PlainObject, pages: PlainObject[]): boolean {
  return pages.some((page, pageIndex) => flattenElements(page.elements).some((element) => {
    if (element.type === "card" && Array.isArray(element.cardItems)) {
      return element.cardItems.some((item) =>
        isPlainObject(item) && item.actionType === "go_to_page"
      );
    }
    const isLastPage = pageIndex === pages.length - 1;
    if (element.type === "button") {
      return element.buttonAction === "specific" ||
        (element.buttonAction === "finish" && !isLastPage);
    }
    if (element.type === "loading") {
      return element.loadingAction === "specific" ||
        (element.loadingAction === "finish" && !isLastPage);
    }
    return false;
  }));
}

/**
 * Required fields are enforced only when every persisted route has one obvious,
 * ordered page path. Conditional/branching forms still get strict validation of
 * every supplied value, without rejecting a legitimately skipped required page.
 */
export function isInequivocallyLinearForm(formData: PlainObject): boolean {
  const pages = formPages(formData);
  if (
    (Array.isArray(formData.conditions) && formData.conditions.length > 0) ||
    (Array.isArray(formData.abTestNodes) && formData.abTestNodes.length > 0) ||
    (Array.isArray(formData.jumpNodes) && formData.jumpNodes.length > 0) ||
    containsEarlyNavigation(formData, pages)
  ) return false;

  const edges = Array.isArray(formData.flowEdges)
    ? formData.flowEdges.filter(isPlainObject)
    : [];
  if (edges.length === 0) return true;

  const outgoing = new Map<string, string>();
  for (const edge of edges) {
    if (typeof edge.source !== "string" || typeof edge.target !== "string") {
      return false;
    }
    if (outgoing.has(edge.source)) return false;
    outgoing.set(edge.source, edge.target);
  }

  const expectedPages = pages
    .map((page) => typeof page.id === "string" ? page.id : "")
    .filter(Boolean);
  const visitedNodes = new Set<string>();
  const visitedPages: string[] = [];
  let current = "start";
  for (let step = 0; step <= edges.length + 1; step += 1) {
    if (visitedNodes.has(current)) return false;
    visitedNodes.add(current);
    const target = outgoing.get(current);
    if (!target) return false;
    if (target === "end") {
      return visitedNodes.size === edges.length &&
        JSON.stringify(visitedPages) === JSON.stringify(expectedPages);
    }
    if (target.startsWith("p-")) visitedPages.push(target.slice(2));
    current = target;
  }
  return false;
}

function isAllowedParameterKey(value: unknown): value is string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 100 ||
    !/^[A-Za-z0-9_.:\[\]-]+$/.test(value)
  ) return false;
  const segments = value.toLowerCase().split(/[.:[\]]+/).filter(Boolean);
  return !segments.some((segment) => DANGEROUS_KEYS.has(segment));
}

function addParameterKey(keys: Set<string>, value: unknown): void {
  if (keys.size < MAX_ANSWER_KEYS && isAllowedParameterKey(value)) {
    keys.add(value);
  }
}

function collectNestedConditionParamKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNestedConditionParamKeys(entry, keys));
    return;
  }
  if (!isPlainObject(value)) return;
  if (value.subjectType === "param") {
    addParameterKey(keys, value.paramKey);
  }
  Object.values(value).forEach((entry) => collectNestedConditionParamKeys(entry, keys));
}

function collectReferencedParamKeys(
  value: unknown,
  keys: Set<string>,
  state = { nodes: 0 },
  depth = 0,
  seen = new WeakSet<object>(),
): void {
  if (depth > 12 || state.nodes >= 50_000 || keys.size >= MAX_ANSWER_KEYS) return;
  state.nodes += 1;
  if (typeof value === "string") {
    const pattern = /\{\{\s*param\.([^{}]+?)\s*\}\}/g;
    const scannable = value.slice(0, 100_000);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(scannable)) !== null) {
      addParameterKey(keys, match[1].trim());
      if (keys.size >= MAX_ANSWER_KEYS) return;
    }
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 1_000)) {
      collectReferencedParamKeys(entry, keys, state, depth + 1, seen);
    }
    return;
  }
  for (const entry of Object.values(value).slice(0, 1_000)) {
    collectReferencedParamKeys(entry, keys, state, depth + 1, seen);
  }
}

function allowedParameterKeys(formData: PlainObject): Set<string> {
  const paramKeys = new Set(DEFAULT_TRACKED_PARAMS);
  if (Array.isArray(formData.trackedParams)) {
    for (const parameter of formData.trackedParams) {
      if (isPlainObject(parameter) && parameter.enabled !== false) {
        addParameterKey(paramKeys, parameter.key);
      }
    }
  }
  collectNestedConditionParamKeys(formData.conditions, paramKeys);
  for (const page of formPages(formData)) {
    if (!Array.isArray(page.variableAssignments)) continue;
    for (const assignment of page.variableAssignments) {
      if (isPlainObject(assignment) && assignment.sourceType === "param") {
        addParameterKey(paramKeys, assignment.value);
      }
    }
  }
  collectReferencedParamKeys(formData, paramKeys);
  return paramKeys;
}

function allowedAnswerKeys(
  formData: PlainObject,
  fields: PlainObject[],
  paramKeys: Set<string>,
): Set<string> {
  const keys = new Set(fields.map((field) => String(field.id)));
  keys.add("__score");

  const variables = Array.isArray(formData.variables) ? formData.variables : [];
  for (const variable of variables) {
    if (isPlainObject(variable) && typeof variable.name === "string") {
      keys.add(`__var_${variable.name}`);
    }
  }

  const webhookNodes = Array.isArray(formData.integrationNodes)
    ? formData.integrationNodes
    : [];
  for (const node of webhookNodes) {
    if (isPlainObject(node) && typeof node.id === "string") {
      keys.add(`__webhook_${node.id}`);
    }
  }

  for (const key of CONTEXT_KEYS) keys.add(`__ctx_${key}`);

  for (const key of paramKeys) keys.add(`__param_${key}`);
  return keys;
}

function derivedCompoundAnswerKeys(fields: PlainObject[]): Set<string> {
  const keys = new Set<string>();
  for (const field of fields) {
    const id = typeof field.id === "string" ? field.id : "";
    const type = typeof field.type === "string" ? field.type : "";
    if (!id) continue;
    for (const subKey of COMPOUND_SUB_KEYS[type] ?? []) {
      keys.add(`${id}.${subKey}`);
    }
  }
  return keys;
}

function addDerivedCompoundAnswers(
  fields: PlainObject[],
  answers: PlainObject,
): void {
  for (const field of fields) {
    const id = typeof field.id === "string" ? field.id : "";
    const type = typeof field.type === "string" ? field.type : "";
    const value = answers[id];
    if (!id || !isPlainObject(value)) continue;
    for (const subKey of COMPOUND_SUB_KEYS[type] ?? []) {
      const subValue = value[subKey];
      if (subValue !== undefined && subValue !== null) {
        answers[`${id}.${subKey}`] = String(subValue);
      }
    }
  }
}

function boundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length <= maximumLength &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function sanitizeQueryParams(
  value: unknown,
  allowedKeys?: Set<string>,
): PlainObject | null {
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 100) return null;
  const queryParams: PlainObject = Object.create(null);
  for (const [key, parameterValue] of entries) {
    if (allowedKeys && !allowedKeys.has(key)) continue;
    if (
      !isAllowedParameterKey(key) ||
      !boundedText(parameterValue, 2_000)
    ) return null;
    queryParams[key] = parameterValue;
  }
  return queryParams;
}

function normalizeTimestamp(value: unknown): string | null {
  if (!boundedText(value, 80)) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function boundedInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= maximum;
}

function sanitizeSubmissionMetadata(
  metadata: PlainObject,
  paramKeys: Set<string>,
  now: Date,
  serverUserAgent?: unknown,
): PlainObject | null {
  const sanitized: PlainObject = Object.create(null);

  if (metadata.response_hash !== undefined && metadata.response_hash !== null) {
    if (
      !boundedText(metadata.response_hash, 64) ||
      !/^[A-Za-z0-9_-]+$/.test(metadata.response_hash)
    ) return null;
    sanitized.response_hash = metadata.response_hash;
  }
  if (typeof serverUserAgent === "string") {
    const normalizedUserAgent = serverUserAgent
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, 1_024);
    if (normalizedUserAgent) sanitized.user_agent = normalizedUserAgent;
  }
  if (metadata.referrer !== undefined && metadata.referrer !== null) {
    if (!boundedText(metadata.referrer, 4_096)) return null;
    sanitized.referrer = metadata.referrer;
  }
  if (metadata.query_params !== undefined && metadata.query_params !== null) {
    const queryParams = sanitizeQueryParams(metadata.query_params, paramKeys);
    if (!queryParams) return null;
    sanitized.query_params = queryParams;
  }
  if (metadata.landed_at !== undefined && metadata.landed_at !== null) {
    const landedAt = normalizeTimestamp(metadata.landed_at);
    if (!landedAt) return null;
    const landedAtMs = Date.parse(landedAt);
    if (
      landedAtMs < now.getTime() - 25 * 60 * 60 * 1_000 ||
      landedAtMs > now.getTime() + 5 * 60 * 1_000
    ) return null;
    sanitized.landed_at = landedAt;
  }
  if (metadata.last_page_index !== undefined && metadata.last_page_index !== null) {
    if (!boundedInteger(metadata.last_page_index, 100_000)) return null;
    sanitized.last_page_index = metadata.last_page_index;
  }

  // status/submitted_at are deliberately absent: form-public-save derives and
  // writes both values after validation. Every other client metadata key is
  // discarded at the persistence boundary.
  return sanitized;
}

export type PublicTelemetryValidationResult =
  | { ok: true; value: PlainObject }
  | { ok: false };

export function sanitizePublicSessionTelemetry(
  payload: unknown,
  formData: unknown,
  options: {
    action: "insert" | "update";
    trustedInternal?: boolean;
    serverUserAgent?: unknown;
    now?: Date;
  },
): PublicTelemetryValidationResult {
  if (!isPlainObject(payload) || !isPlainObject(formData)) return { ok: false };
  const pages = formPages(formData);
  const pageCount = pages.length;
  const sanitized: PlainObject = Object.create(null);
  const trustedInternal = options.trustedInternal === true;
  const now = options.now ?? new Date();

  if (options.action === "insert" || payload.status !== undefined) {
    if (trustedInternal) {
      if (
        payload.status !== undefined &&
        !["active", "completed", "dropped"].includes(String(payload.status))
      ) return { ok: false };
      sanitized.status = payload.status ?? "active";
    } else {
      sanitized.status = "active";
    }
  }
  if (trustedInternal && payload.completed_at !== undefined && payload.completed_at !== null) {
    const completedAt = normalizeTimestamp(payload.completed_at);
    if (!completedAt) return { ok: false };
    sanitized.completed_at = completedAt;
  }
  if (payload.last_seen_at !== undefined && payload.last_seen_at !== null) {
    const lastSeenAt = normalizeTimestamp(payload.last_seen_at);
    if (!lastSeenAt) return { ok: false };
    const lastSeenAtMs = Date.parse(lastSeenAt);
    if (
      !trustedInternal &&
      (lastSeenAtMs < now.getTime() - 25 * 60 * 60 * 1_000 ||
        lastSeenAtMs > now.getTime() + 5 * 60 * 1_000)
    ) return { ok: false };
    sanitized.last_seen_at = lastSeenAt;
  }
  if (payload.current_page_index !== undefined && payload.current_page_index !== null) {
    if (
      !boundedInteger(payload.current_page_index, Math.max(0, pageCount - 1)) ||
      pageCount === 0
    ) return { ok: false };
    sanitized.current_page_index = payload.current_page_index;
  }
  if (payload.pages_visited !== undefined && payload.pages_visited !== null) {
    if (!boundedInteger(payload.pages_visited, pageCount)) return { ok: false };
    sanitized.pages_visited = payload.pages_visited;
  }
  if (options.action === "insert" || payload.total_pages !== undefined) {
    sanitized.total_pages = pageCount;
  }

  for (const [key, maximum] of [
    ["source_url", 4_096],
    ["referrer", 4_096],
  ] as const) {
    const value = payload[key];
    if (value === undefined) continue;
    if (value === null) {
      sanitized[key] = null;
      continue;
    }
    if (!boundedText(value, maximum)) return { ok: false };
    sanitized[key] = value;
  }
  if (typeof options.serverUserAgent === "string") {
    const normalizedUserAgent = options.serverUserAgent
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, 1_024);
    if (normalizedUserAgent) sanitized.user_agent = normalizedUserAgent;
  }
  if (payload.query_params !== undefined && payload.query_params !== null) {
    const queryParams = sanitizeQueryParams(
      payload.query_params,
      allowedParameterKeys(formData),
    );
    if (!queryParams) return { ok: false };
    sanitized.query_params = queryParams;
  }

  return { ok: true, value: sanitized };
}

export function sanitizePublicPageEventTelemetry(
  payload: unknown,
  formData: unknown,
  trustedInternal = false,
): PublicTelemetryValidationResult {
  if (!isPlainObject(payload) || !isPlainObject(formData)) return { ok: false };
  const eventType = payload.event_type;
  const allowedTypes = trustedInternal
    ? ["form_start", "page_view", "form_complete", "form_drop"]
    : ["form_start", "page_view"];
  if (typeof eventType !== "string" || !allowedTypes.includes(eventType)) {
    return { ok: false };
  }

  const sanitized: PlainObject = Object.create(null);
  sanitized.event_type = eventType;
  if (eventType === "form_start") return { ok: true, value: sanitized };

  const pages = formPages(formData);
  const pageId = payload.page_id;
  const pageIndex = payload.page_index;
  if (eventType === "page_view") {
    if (typeof pageId !== "string" || !boundedText(pageId, 200)) {
      return { ok: false };
    }
    const persistedIndex = pages.findIndex((page) => page.id === pageId);
    if (persistedIndex < 0 || pageIndex !== persistedIndex) return { ok: false };
    sanitized.page_id = pageId;
    sanitized.page_index = persistedIndex;
    const persistedTitle = pages[persistedIndex].title;
    sanitized.page_title = typeof persistedTitle === "string"
      ? persistedTitle.slice(0, 300)
      : null;
  } else if (pageId !== undefined || pageIndex !== undefined) {
    if (typeof pageId !== "string" || !boundedText(pageId, 200)) {
      return { ok: false };
    }
    const persistedIndex = pages.findIndex((page) => page.id === pageId);
    if (persistedIndex < 0 || pageIndex !== persistedIndex) return { ok: false };
    sanitized.page_id = pageId;
    sanitized.page_index = persistedIndex;
    const persistedTitle = pages[persistedIndex].title;
    sanitized.page_title = typeof persistedTitle === "string"
      ? persistedTitle.slice(0, 300)
      : null;
  }

  const boundedCounters: Array<[string, number]> = [
    [
      "time_on_page_ms",
      trustedInternal
        ? 366 * 24 * 60 * 60 * 1_000
        : 25 * 60 * 60 * 1_000,
    ],
    [
      "hesitation_ms",
      trustedInternal
        ? 366 * 24 * 60 * 60 * 1_000
        : 25 * 60 * 60 * 1_000,
    ],
    ["interaction_count", 1_000_000],
    ["answer_char_count", PUBLIC_SUBMISSION_MAX_ANSWERS_BYTES],
  ];
  for (const [key, maximum] of boundedCounters) {
    const value = payload[key];
    if (value === undefined || value === null) {
      if (value === null) sanitized[key] = null;
      continue;
    }
    if (!boundedInteger(value, maximum)) return { ok: false };
    sanitized[key] = value;
  }

  return { ok: true, value: sanitized };
}

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null || value === "" || value === false) {
    return false;
  }
  if (Array.isArray(value)) return value.length > 0;
  if (!isPlainObject(value)) return true;
  return Object.values(value).some((entry) => isPresent(entry));
}

function isFieldPresent(field: PlainObject, value: unknown): boolean {
  // A phone object always contains its selected country and DDI, even when the
  // respondent leaves an optional national number empty. Those structural
  // values must not turn an empty optional answer into an invalid submission.
  if (field.type === "input_phone" && isPlainObject(value)) {
    return value.invalidReason !== undefined || digits(value.number).length > 0;
  }
  return isPresent(value);
}

function validEmail(value: unknown): boolean {
  return typeof value === "string" && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: unknown): boolean {
  if (!isPlainObject(value) || value.invalidReason) return false;
  const countryCode = typeof value.countryCode === "string"
    ? value.countryCode.toUpperCase()
    : "";
  const country = PHONE_COUNTRIES[countryCode];
  return !!country && typeof value.number === "string" &&
    value.ddi === country.ddi &&
    digits(value.number).length === country.nationalDigits;
}

function validCpf(value: unknown): boolean {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const result = 11 - sum % 11;
    return result >= 10 ? 0 : result;
  };
  return checkDigit(9) === Number(cpf[9]) &&
    checkDigit(10) === Number(cpf[10]);
}

function validCnpj(value: unknown): boolean {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (length: number): number => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) => total + Number(cnpj[index]) * weight,
      0,
    );
    return sum % 11 < 2 ? 0 : 11 - sum % 11;
  };
  return calculate(12) === Number(cnpj[12]) &&
    calculate(13) === Number(cnpj[13]);
}

function nonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validAddress(value: unknown): boolean {
  if (!isPlainObject(value) || typeof value.country !== "string") return false;
  if ((COMPOUND_SUB_KEYS.input_address ?? []).some((key) =>
    value[key] !== undefined && typeof value[key] !== "string"
  )) return false;
  const country = value.country.toUpperCase();
  return ADDRESS_COUNTRIES.has(country) &&
    nonEmptyText(value.street) && nonEmptyText(value.number) &&
    nonEmptyText(value.city) && nonEmptyText(value.state) &&
    (country !== "BR" || digits(value.cep).length === 8);
}

function validDocument(value: unknown, field: PlainObject): boolean {
  if (
    !isPlainObject(value) || typeof value.documentType !== "string" ||
    typeof value.value !== "string"
  ) return false;
  const configuredTypes = Array.isArray(field.documentAllowedTypes)
    ? field.documentAllowedTypes.filter((entry) => typeof entry === "string")
    : [];
  const allowedTypes = configuredTypes.length > 0
    ? configuredTypes
    : ["cpf", "cnpj", "passport"];
  if (!allowedTypes.includes(value.documentType)) return false;
  if (value.documentType === "cpf") return validCpf(value.value);
  if (value.documentType === "cnpj") return validCnpj(value.value);
  return typeof value.value === "string" &&
    value.value.trim().length >= 5 && value.value.length <= 20;
}

function validMeasurement(value: unknown, field: PlainObject): boolean {
  if (!isPlainObject(value) || typeof value.unit !== "string") return false;
  const number = numericValue(value.value);
  if (number === null) return false;
  const isHeight = field.type === "input_height";
  const ranges: Record<string, [number, number]> = isHeight
    ? { cm: [100, 250], pol: [39, 98] }
    : { kg: [20, 250], lb: [44, 550] };
  const range = ranges[value.unit];
  if (!range) return false;
  const configuredUnit = typeof field.unit === "string"
    ? field.unit
    : isHeight ? "cm" : "kg";
  const minimum = value.unit === configuredUnit && typeof field.min === "number"
    ? field.min
    : range[0];
  const maximum = value.unit === configuredUnit && typeof field.max === "number"
    ? field.max
    : range[1];
  return number >= minimum && number <= maximum;
}

function validCompany(value: unknown): boolean {
  if (!isPlainObject(value) || typeof value.cnpj !== "string") return false;
  if ((COMPOUND_SUB_KEYS.input_company ?? []).some((key) =>
    value[key] !== undefined && typeof value[key] !== "string"
  )) return false;
  return validCnpj(value.cnpj);
}

function sanitizedFieldValue(field: PlainObject, value: unknown): unknown {
  const type = typeof field.type === "string" ? field.type : "";
  const subKeys = COMPOUND_SUB_KEYS[type];
  if (!subKeys || !isPlainObject(value)) return value;
  const sanitized: PlainObject = Object.create(null);
  for (const subKey of subKeys) {
    if (value[subKey] !== undefined && value[subKey] !== null) {
      sanitized[subKey] = value[subKey];
    }
  }
  return sanitized;
}

function addRelative(base: Date, amount: number, unit: string): Date {
  const next = new Date(base.getTime());
  if (unit === "days") next.setUTCDate(next.getUTCDate() + amount);
  else if (unit === "months") next.setUTCMonth(next.getUTCMonth() + amount);
  else next.setUTCFullYear(next.getUTCFullYear() + amount);
  return next;
}

function resolveDateLimit(
  rawRule: unknown,
  now: Date,
  boundary: "min" | "max",
): Date | null | undefined {
  if (!isPlainObject(rawRule) || rawRule.mode === "none" || !rawRule.mode) {
    return undefined;
  }
  let date: Date;
  if (rawRule.mode === "today") {
    date = new Date(now.getTime());
  } else if (rawRule.mode === "fixed") {
    if (
      typeof rawRule.fixedDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawRule.fixedDate)
    ) return null;
    date = new Date(`${rawRule.fixedDate}T12:00:00.000Z`);
    const [, rawYear, rawMonth, rawDay] =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawRule.fixedDate) ?? [];
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== Number(rawYear) ||
      date.getUTCMonth() !== Number(rawMonth) - 1 ||
      date.getUTCDate() !== Number(rawDay)
    ) return null;
  } else if (rawRule.mode === "relative") {
    const amount = Number(rawRule.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) return null;
    if (
      rawRule.unit !== undefined &&
      !["days", "months", "years"].includes(String(rawRule.unit))
    ) return null;
    if (
      rawRule.direction !== undefined &&
      rawRule.direction !== "past" && rawRule.direction !== "future"
    ) return null;
    const direction = rawRule.direction === "future" ? 1 : -1;
    date = addRelative(
      now,
      direction * Math.trunc(amount),
      typeof rawRule.unit === "string" ? rawRule.unit : "years",
    );
  } else {
    return null;
  }
  if (boundary === "min") date.setUTCHours(0, 0, 0, 0);
  else date.setUTCHours(23, 59, 59, 999);
  return date;
}

function validDate(value: unknown, field: PlainObject, now: Date): boolean {
  if (typeof value !== "string" || value.length > 80) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (field.dateMode === "time") return true;
  const min = resolveDateLimit(field.dateMinRule, now, "min");
  const max = resolveDateLimit(field.dateMaxRule, now, "max");
  if (min === null || max === null || (min && max && min > max)) return false;
  return (!min || date >= min) && (!max || date <= max);
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (isPlainObject(value)) return numericValue(value.value);
  return null;
}

function validNumeric(value: unknown, field: PlainObject): boolean {
  const number = numericValue(value);
  if (number === null) return false;
  return (typeof field.min !== "number" || number >= field.min) &&
    (typeof field.max !== "number" || number <= field.max);
}

function optionIds(field: PlainObject): Set<string> {
  const values = Array.isArray(field.options) ? field.options : [];
  return new Set(values.flatMap((option) =>
    isPlainObject(option) && typeof option.id === "string" ? [option.id] : []
  ));
}

function validFieldValue(field: PlainObject, value: unknown, now: Date): boolean {
  switch (field.type) {
    case "input_email":
      return validEmail(value);
    case "input_phone":
      return validPhone(value);
    case "input_date":
      return validDate(value, field, now);
    case "input_number":
      return validNumeric(value, field);
    case "input_height":
    case "input_weight":
      return validMeasurement(value, field);
    case "input_select":
    case "input_radio":
    case "input_quiz_icon":
    case "input_quiz_image":
      return typeof value === "string" && optionIds(field).has(value);
    case "input_multi_select": {
      if (!Array.isArray(value) || value.length === 0) return false;
      const allowed = optionIds(field);
      return value.every((entry) => typeof entry === "string" && allowed.has(entry)) &&
        new Set(value).size === value.length;
    }
    case "input_checkbox":
      return typeof value === "boolean";
    case "input_yes_no":
      return value === "yes" || value === "no";
    case "input_rating":
    case "input_nps": {
      const score = numericValue(value);
      const minimum = field.type === "input_nps" ? 0 : 1;
      const maximum = typeof field.maxRating === "number"
        ? field.maxRating
        : field.type === "input_nps" ? 10 : 5;
      return score !== null && Number.isInteger(score) &&
        score >= minimum && score <= maximum;
    }
    case "input_text":
    case "input_textarea":
      return typeof value === "string" && value.trim().length > 0;
    case "input_address":
      return validAddress(value);
    case "input_document":
      return validDocument(value, field);
    case "input_company":
      return validCompany(value);
    default:
      return hasSafeStructure(value);
  }
}

export function validateFormSubmission(
  formData: unknown,
  answers: unknown,
  metadata: unknown,
  options: {
    completion: boolean;
    now?: Date;
    serverUserAgent?: unknown;
    responseId?: string;
  },
): SubmissionValidationResult {
  if (!isPlainObject(formData) || !isPlainObject(answers) ||
    !isPlainObject(metadata)) {
    return { ok: false, fields: [] };
  }
  const structuralBudget = { keys: 0 };
  if (
    Object.keys(answers).length > MAX_ANSWER_KEYS ||
    encodedJsonBytes(answers) > PUBLIC_SUBMISSION_MAX_ANSWERS_BYTES ||
    encodedJsonBytes(metadata) > PUBLIC_SUBMISSION_MAX_METADATA_BYTES ||
    !hasSafeStructure(answers, 0, structuralBudget) ||
    !hasSafeStructure(metadata, 0, structuralBudget)
  ) return { ok: false, fields: [] };

  const fields = inputElements(formData);
  const fieldsById = new Map(fields.map((field) => [String(field.id), field]));
  const paramKeys = allowedParameterKeys(formData);
  const allowedKeys = allowedAnswerKeys(formData, fields, paramKeys);
  const derivedKeys = derivedCompoundAnswerKeys(fields);
  const sanitizedAnswers: PlainObject = Object.create(null);
  const invalidFields = new Set<string>();
  const now = options.now ?? new Date();
  const sanitizedMetadata = sanitizeSubmissionMetadata(
    metadata,
    paramKeys,
    now,
    options.serverUserAgent,
  );
  if (!sanitizedMetadata) return { ok: false, fields: [] };

  for (const [key, value] of Object.entries(answers)) {
    // The browser emits these convenience values for interpolation. Rebuild
    // them from the validated compound object so a client cannot forge a value
    // that disagrees with the canonical field answer.
    if (derivedKeys.has(key)) continue;
    if (!allowedKeys.has(key)) {
      // Unknown context/marketing keys are discarded instead of making an
      // otherwise legitimate response fail. Unknown form field IDs are rejected.
      if (!key.startsWith("__")) invalidFields.add(key);
      continue;
    }
    const field = fieldsById.get(key);
    if (field && isFieldPresent(field, value) && !validFieldValue(field, value, now)) {
      invalidFields.add(key);
      continue;
    }
    sanitizedAnswers[key] = field ? sanitizedFieldValue(field, value) : value;
  }

  addDerivedCompoundAnswers(fields, sanitizedAnswers);

  if (invalidFields.size > 0) {
    return { ok: false, fields: [...invalidFields].sort() };
  }

  let enforceRequired = false;
  if (options.completion) {
    const route = resolvePersistedFormRoute(formData, sanitizedAnswers, {
      responseId: options.responseId,
    });
    if (!route.ok) return { ok: false, fields: [] };
    enforceRequired = true;
    for (const fieldId of route.reachedFieldIds) {
      const field = fieldsById.get(fieldId);
      if (field && field.required === true && !isFieldPresent(field, sanitizedAnswers[fieldId])) {
        invalidFields.add(fieldId);
      }
    }
    if (invalidFields.size > 0) {
      return { ok: false, fields: [...invalidFields].sort() };
    }
  }

  if (
    Object.keys(sanitizedAnswers).length > MAX_ANSWER_KEYS ||
    encodedJsonBytes(sanitizedAnswers) > PUBLIC_SUBMISSION_MAX_ANSWERS_BYTES ||
    !hasSafeStructure(sanitizedAnswers)
  ) return { ok: false, fields: [] };
  return {
    ok: true,
    answers: sanitizedAnswers,
    metadata: sanitizedMetadata,
    requiredFieldsEnforced: enforceRequired,
  };
}
