const MAX_ALLOWED_PATHS = 64;
const MAX_PATH_LENGTH = 512;
const MAX_PATH_SEGMENTS = 16;
const MAX_PATH_SEGMENT_LENGTH = 128;
const MAX_ARRAY_INDEX = 49;
const MAX_GRAPH_EDGES = 2_000;
const MAX_DOWNSTREAM_NODES = 256;
const MAX_SCAN_DEPTH = 12;
const MAX_SCANNED_VALUES = 4_096;
const MAX_SCAN_ARRAY_ITEMS = 200;
const MAX_SCAN_OBJECT_KEYS = 200;
const MAX_SCANNED_STRING_LENGTH = 32_768;
const MAX_CONDITION_DEPTH = 8;
const MAX_CONDITION_RULES = 512;

const MAX_PROJECTED_DEPTH = 12;
const MAX_PROJECTED_OBJECT_KEYS = 100;
const MAX_PROJECTED_TOTAL_KEYS = 512;
const MAX_PROJECTED_ARRAY_ITEMS = 50;
const MAX_PROJECTED_TOTAL_NODES = 1_024;
const MAX_PROJECTED_STRING_BYTES = 16_384;
const MAX_PROJECTED_TOTAL_STRING_BYTES = 32_768;
const MAX_PROJECTED_JSON_BYTES = 64 * 1_024;

const DANGEROUS_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

export type WebhookResponsePathSegment = string | number;

export class WebhookResponseProjectionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "WebhookResponseProjectionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDangerousSegment(value: string): boolean {
  return DANGEROUS_PATH_SEGMENTS.has(value.toLowerCase());
}

/**
 * Parses the same dot/numeric-bracket paths understood by the public runtime,
 * but rejects prototype-pollution primitives and deliberately caps complexity.
 */
export function parseWebhookResponsePath(
  value: unknown,
): WebhookResponsePathSegment[] | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.length > MAX_PATH_LENGTH) return null;

  const bracketNormalized = path.replace(/\[(\d+)\]/g, ".$1");
  const normalized = path.startsWith("[") && bracketNormalized.startsWith(".")
    ? bracketNormalized.slice(1)
    : bracketNormalized;
  if (normalized.includes("[") || normalized.includes("]")) return null;
  const rawSegments = normalized.split(".");
  if (
    rawSegments.length === 0 || rawSegments.length > MAX_PATH_SEGMENTS ||
    rawSegments.some((segment) => !segment)
  ) return null;

  const segments: WebhookResponsePathSegment[] = [];
  for (const rawSegment of rawSegments) {
    if (rawSegment.length > MAX_PATH_SEGMENT_LENGTH) return null;
    if (/^(?:0|[1-9]\d*)$/.test(rawSegment)) {
      const index = Number(rawSegment);
      if (!Number.isSafeInteger(index) || index > MAX_ARRAY_INDEX) return null;
      segments.push(index);
      continue;
    }
    if (!/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(rawSegment)) return null;
    if (isDangerousSegment(rawSegment)) return null;
    segments.push(rawSegment);
  }

  return segments;
}

function canonicalPath(segments: WebhookResponsePathSegment[]): string {
  return segments.map((segment, index) =>
    typeof segment === "number"
      ? `[${segment}]`
      : `${index === 0 ? "" : "."}${segment}`
  ).join("");
}

type PathCollector = (path: unknown) => void;

function collectConfiguredMappingPaths(
  formData: Record<string, unknown>,
  nodeId: string,
  addPath: PathCollector,
): void {
  const nodes = Array.isArray(formData.integrationNodes)
    ? formData.integrationNodes
    : [];
  const node = nodes.slice(0, MAX_DOWNSTREAM_NODES).find((candidate) =>
    isRecord(candidate) && candidate.id === nodeId
  );
  if (!isRecord(node) || !Array.isArray(node.responseMappings)) return;
  for (const mapping of node.responseMappings.slice(0, MAX_ALLOWED_PATHS)) {
    if (isRecord(mapping)) addPath(mapping.responsePath);
  }
}

function collectConditionResponsePaths(
  formData: Record<string, unknown>,
  nodeId: string,
  addPath: PathCollector,
): void {
  const conditions = Array.isArray(formData.conditions)
    ? formData.conditions.slice(0, MAX_DOWNSTREAM_NODES)
    : [];
  let rulesVisited = 0;
  let groupsVisited = 0;

  const visitGroup = (group: unknown, depth: number): void => {
    if (
      !isRecord(group) || depth > MAX_CONDITION_DEPTH ||
      rulesVisited >= MAX_CONDITION_RULES ||
      groupsVisited >= MAX_CONDITION_RULES
    ) return;
    groupsVisited += 1;
    const rules = Array.isArray(group.rules)
      ? group.rules.slice(0, MAX_CONDITION_RULES - rulesVisited)
      : [];
    for (const rule of rules) {
      rulesVisited += 1;
      if (
        isRecord(rule) && rule.subjectType === "webhook_response" &&
        rule.webhookNodeId === nodeId
      ) addPath(rule.webhookResponsePath);
      if (rulesVisited >= MAX_CONDITION_RULES) return;
    }
    const groups = Array.isArray(group.groups)
      ? group.groups.slice(0, MAX_CONDITION_RULES - rulesVisited)
      : [];
    for (const nested of groups) {
      visitGroup(nested, depth + 1);
      if (
        rulesVisited >= MAX_CONDITION_RULES ||
        groupsVisited >= MAX_CONDITION_RULES
      ) return;
    }
  };

  for (const condition of conditions) {
    if (!isRecord(condition) || !Array.isArray(condition.branches)) continue;
    for (const branch of condition.branches.slice(0, MAX_CONDITION_RULES)) {
      if (isRecord(branch)) visitGroup(branch.conditionGroup, 0);
      if (
        rulesVisited >= MAX_CONDITION_RULES ||
        groupsVisited >= MAX_CONDITION_RULES
      ) return;
    }
  }
}

function findNodeById(
  formData: Record<string, unknown>,
  collection: string,
  id: string,
): unknown {
  const values = formData[collection];
  if (!Array.isArray(values)) return null;
  return values.slice(0, MAX_DOWNSTREAM_NODES).find((candidate) =>
    isRecord(candidate) && candidate.id === id
  ) ?? null;
}

function integrationTokenConfig(value: unknown): unknown {
  if (!isRecord(value)) return null;
  return {
    webhookUrl: value.webhookUrl,
    webhookParams: value.webhookParams,
    webhookHeaders: value.webhookHeaders,
    webhookQueryParams: value.webhookQueryParams,
    webhookBodyParams: value.webhookBodyParams,
  };
}

function configForGraphNode(
  formData: Record<string, unknown>,
  graphNodeId: string,
): unknown {
  if (graphNodeId === "start") {
    return {
      welcomeTitle: formData.welcomeTitle,
      welcomeDescription: formData.welcomeDescription,
      welcomePage: formData.welcomePage,
    };
  }
  if (graphNodeId === "end") {
    return {
      thankYouTitle: formData.thankYouTitle,
      thankYouDescription: formData.thankYouDescription,
      thankYouPage: formData.thankYouPage,
      completionAction: formData.completionAction,
      completionRedirectUrl: formData.completionRedirectUrl,
    };
  }

  const prefixMappings: Array<[string, string]> = [
    ["p-", "pages"],
    ["c-", "conditions"],
    ["vo-", "variableOpNodes"],
    ["an-", "analyticsNodes"],
    ["wa-", "whatsappNodes"],
    ["em-", "emailNodes"],
    ["ab-", "abTestNodes"],
    ["wt-", "waitNodes"],
    ["jp-", "jumpNodes"],
    ["ai-", "aiNodes"],
    ["ig-", "imageGenNodes"],
  ];
  if (graphNodeId.startsWith("int-")) {
    return integrationTokenConfig(
      findNodeById(formData, "integrationNodes", graphNodeId.slice(4)),
    );
  }
  for (const [prefix, collection] of prefixMappings) {
    if (graphNodeId.startsWith(prefix)) {
      return findNodeById(
        formData,
        collection,
        graphNodeId.slice(prefix.length),
      );
    }
  }

  // Legacy graphs occasionally stored a raw page id instead of `p-${id}`.
  return findNodeById(formData, "pages", graphNodeId);
}

function scanWebhookTokens(
  config: unknown,
  nodeId: string,
  addPath: PathCollector,
): void {
  let visitedValues = 0;
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth: number): void => {
    if (visitedValues >= MAX_SCANNED_VALUES || depth > MAX_SCAN_DEPTH) return;
    visitedValues += 1;
    if (typeof value === "string") {
      const source = value.slice(0, MAX_SCANNED_STRING_LENGTH);
      const tokenPattern = /\{\{webhook:([^:}\s]+):([^}]+)\}\}/g;
      for (const match of source.matchAll(tokenPattern)) {
        if (match[1] === nodeId) addPath(match[2]);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, MAX_SCAN_ARRAY_ITEMS)) {
        visit(item, depth + 1);
        if (visitedValues >= MAX_SCANNED_VALUES) return;
      }
      return;
    }
    for (
      const [key, nested] of Object.entries(value).slice(
        0,
        MAX_SCAN_OBJECT_KEYS,
      )
    ) {
      if (
        isDangerousSegment(key) || key === "lastTestResponse" ||
        key === "responseFields"
      ) continue;
      visit(nested, depth + 1);
      if (visitedValues >= MAX_SCANNED_VALUES) return;
    }
  };
  visit(config, 0);
}

function collectDownstreamTokenPaths(
  formData: Record<string, unknown>,
  nodeId: string,
  addPath: PathCollector,
): void {
  const edges = Array.isArray(formData.flowEdges)
    ? formData.flowEdges.slice(0, MAX_GRAPH_EDGES)
    : [];
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!isRecord(edge)) continue;
    const source = typeof edge.source === "string" ? edge.source : "";
    const target = typeof edge.target === "string" ? edge.target : "";
    if (!source || !target || source.length > 256 || target.length > 256) {
      continue;
    }
    const targets = adjacency.get(source) ?? [];
    if (targets.length < MAX_DOWNSTREAM_NODES) targets.push(target);
    adjacency.set(source, targets);
  }

  const sourceId = `int-${nodeId}`;
  const queue = [...(adjacency.get(sourceId) ?? [])];
  const visited = new Set<string>([sourceId]);
  const disabled = new Set(
    (Array.isArray(formData.disabledNodes) ? formData.disabledNodes : [])
      .filter((value): value is string => typeof value === "string")
      .slice(0, MAX_DOWNSTREAM_NODES),
  );

  while (queue.length > 0 && visited.size < MAX_DOWNSTREAM_NODES) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (!disabled.has(current)) {
      scanWebhookTokens(configForGraphNode(formData, current), nodeId, addPath);
    }
    for (const target of adjacency.get(current) ?? []) {
      if (!visited.has(target) && queue.length < MAX_DOWNSTREAM_NODES) {
        queue.push(target);
      }
    }
  }
}

/**
 * Computes the only webhook response paths that the persisted form can consume.
 * Client-supplied response fields and editor test samples are never consulted.
 */
export function collectAllowedWebhookResponsePaths(
  formDataValue: unknown,
  nodeId: string,
): string[] {
  if (!isRecord(formDataValue) || !nodeId || nodeId.length > 256) return [];
  const paths = new Map<string, string>();
  const addPath: PathCollector = (candidate) => {
    if (paths.size >= MAX_ALLOWED_PATHS) return;
    const segments = parseWebhookResponsePath(candidate);
    if (!segments) return;
    const canonical = canonicalPath(segments);
    paths.set(canonical, canonical);
  };

  collectConfiguredMappingPaths(formDataValue, nodeId, addPath);
  collectConditionResponsePaths(formDataValue, nodeId, addPath);
  collectDownstreamTokenPaths(formDataValue, nodeId, addPath);
  return [...paths.values()];
}

type ProjectionBudget = {
  totalNodes: number;
  totalKeys: number;
  totalStringBytes: number;
};

const encoder = new TextEncoder();

function cloneSelectedValue(
  value: unknown,
  depth: number,
  budget: ProjectionBudget,
): unknown {
  budget.totalNodes += 1;
  if (budget.totalNodes > MAX_PROJECTED_TOTAL_NODES) {
    throw new WebhookResponseProjectionError(
      "webhook_response_too_many_values",
    );
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new WebhookResponseProjectionError(
        "webhook_response_invalid_number",
      );
    }
    return value;
  }
  if (typeof value === "string") {
    const bytes = encoder.encode(value).byteLength;
    if (bytes > MAX_PROJECTED_STRING_BYTES) {
      throw new WebhookResponseProjectionError(
        "webhook_response_string_too_large",
      );
    }
    budget.totalStringBytes += bytes;
    if (budget.totalStringBytes > MAX_PROJECTED_TOTAL_STRING_BYTES) {
      throw new WebhookResponseProjectionError(
        "webhook_response_strings_too_large",
      );
    }
    return value;
  }
  if (!value || typeof value !== "object") {
    throw new WebhookResponseProjectionError("webhook_response_invalid_value");
  }
  if (depth >= MAX_PROJECTED_DEPTH) {
    throw new WebhookResponseProjectionError("webhook_response_too_deep");
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_PROJECTED_ARRAY_ITEMS) {
      throw new WebhookResponseProjectionError(
        "webhook_response_array_too_large",
      );
    }
    return value.map((item) => cloneSelectedValue(item, depth + 1, budget));
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_PROJECTED_OBJECT_KEYS) {
    throw new WebhookResponseProjectionError(
      "webhook_response_object_too_large",
    );
  }
  const cloned: Record<string, unknown> = Object.create(null);
  for (const [key, nested] of entries) {
    if (isDangerousSegment(key)) continue;
    budget.totalKeys += 1;
    if (budget.totalKeys > MAX_PROJECTED_TOTAL_KEYS) {
      throw new WebhookResponseProjectionError(
        "webhook_response_too_many_keys",
      );
    }
    cloned[key] = cloneSelectedValue(nested, depth + 1, budget);
  }
  return cloned;
}

function getOwnPathValue(
  value: unknown,
  segments: WebhookResponsePathSegment[],
): { found: boolean; value?: unknown } {
  let current = value;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return { found: false };
    }
    const key = String(segment);
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false };
    }
    current = (current as Record<string, unknown>)[key];
  }
  return { found: true, value: current };
}

function assignProjectedValue(
  root: Record<string, unknown> | unknown[],
  segments: WebhookResponsePathSegment[],
  value: unknown,
): void {
  let current: Record<string, unknown> | unknown[] = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const key = String(segment);
    const writable = current as unknown as Record<string, unknown>;
    if (index === segments.length - 1) {
      writable[key] = value;
      return;
    }
    const nextSegment = segments[index + 1];
    const existing = writable[key];
    const needsArray = typeof nextSegment === "number";
    if (
      !existing || typeof existing !== "object" ||
      (needsArray ? !Array.isArray(existing) : Array.isArray(existing))
    ) {
      writable[key] = needsArray ? [] : Object.create(null);
    }
    current = writable[key] as
      | Record<string, unknown>
      | unknown[];
  }
}

/**
 * Returns a nested JSON-compatible object containing only explicitly allowed
 * response paths. It never returns the complete upstream payload by default.
 */
export function projectWebhookResponse(
  responseBody: unknown,
  allowedPaths: readonly string[],
): Record<string, unknown> | unknown[] {
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return Object.create(null);
  }

  const budget: ProjectionBudget = {
    totalNodes: 0,
    totalKeys: 0,
    totalStringBytes: 0,
  };
  const canonicalSeen = new Set<string>();
  let projected: Record<string, unknown> | unknown[] | null = null;
  for (const path of allowedPaths.slice(0, MAX_ALLOWED_PATHS)) {
    const segments = parseWebhookResponsePath(path);
    if (!segments) continue;
    const canonical = canonicalPath(segments);
    if (canonicalSeen.has(canonical)) continue;
    canonicalSeen.add(canonical);
    const selected = getOwnPathValue(responseBody, segments);
    if (!selected.found) continue;
    const needsRootArray = typeof segments[0] === "number";
    if (projected === null) {
      projected = needsRootArray ? [] : Object.create(null);
    } else if (needsRootArray !== Array.isArray(projected)) {
      continue;
    }
    const cloned = cloneSelectedValue(selected.value, segments.length, budget);
    const projectionRoot = projected;
    if (projectionRoot === null) continue;
    assignProjectedValue(projectionRoot, segments, cloned);
  }

  const result = projected ?? Object.create(null);
  const serialized = JSON.stringify(result);
  if (encoder.encode(serialized).byteLength > MAX_PROJECTED_JSON_BYTES) {
    throw new WebhookResponseProjectionError(
      "webhook_response_projection_too_large",
    );
  }
  return result;
}
