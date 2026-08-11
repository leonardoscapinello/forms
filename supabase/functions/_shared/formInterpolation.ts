export type FormInterpolationVariable = {
  id?: string;
  name?: string;
  type?: string;
  defaultValue?: unknown;
  sourceElementId?: string;
};

const TOKEN_PATTERN = /\{\{([^{}]+)\}\}/g;
const EXACT_TOKEN_PATTERN = /^\s*\{\{([^{}]+)\}\}\s*$/;
const DANGEROUS_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);
const MAX_VARIABLE_DEPTH = 32;

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nestedValue(value: unknown, path: string): unknown {
  if (!path) return value;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  if (parts.some((part) => DANGEROUS_PATH_SEGMENTS.has(part.toLowerCase()))) {
    return undefined;
  }
  return parts.reduce<unknown>(
    (current, part) =>
      current !== null && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined,
    value,
  );
}

export function readFormAnswerValue(
  answers: Record<string, unknown>,
  keyOrPath: string,
): unknown {
  const parts = keyOrPath.replace(/\[(\d+)\]/g, ".$1").split(".").filter(
    Boolean,
  );
  if (parts.some((part) => DANGEROUS_PATH_SEGMENTS.has(part.toLowerCase()))) {
    return undefined;
  }
  if (hasOwn(answers, keyOrPath)) return answers[keyOrPath];
  for (let prefixLength = parts.length - 1; prefixLength > 0; prefixLength--) {
    const prefix = parts.slice(0, prefixLength).join(".");
    if (!hasOwn(answers, prefix)) continue;
    return nestedValue(answers[prefix], parts.slice(prefixLength).join("."));
  }
  return undefined;
}

export function stringifyFormValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" || typeof value === "boolean" ||
    typeof value === "bigint"
  ) return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyFormValue).filter((part) => part !== "").join(
      ", ",
    );
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  if (record.ddi !== undefined && record.number !== undefined) {
    return `${String(record.ddi ?? "")}${
      String(record.number ?? "").replace(/\D/g, "")
    }`;
  }
  if (record.street !== undefined || record.city !== undefined) {
    return [
      record.street,
      record.number,
      record.complement,
      record.neighborhood,
      record.city,
      record.state,
      record.cep ?? record.zip,
      record.country,
    ].filter((part) => part !== undefined && part !== null && part !== "")
      .map(String).join(", ");
  }
  if (record.value !== undefined && record.unit !== undefined) {
    return `${stringifyFormValue(record.value)}${String(record.unit)}`;
  }
  if (record.height !== undefined || record.weight !== undefined) {
    return [
      record.height !== undefined
        ? `${stringifyFormValue(record.height)}cm`
        : "",
      record.weight !== undefined
        ? `${stringifyFormValue(record.weight)}kg`
        : "",
    ].filter(Boolean).join(" / ");
  }
  if (record.first !== undefined || record.last !== undefined) {
    return [record.first, record.last].filter(Boolean).map(String).join(" ");
  }
  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

type TokenResolution = { recognized: boolean; value: unknown };

function resolveVariable(
  variable: FormInterpolationVariable,
  answers: Record<string, unknown>,
  variables: FormInterpolationVariable[],
  stack: Set<string>,
  depth: number,
): unknown {
  const identity = variable.name || variable.id || "";
  if (!identity || stack.has(identity) || depth >= MAX_VARIABLE_DEPTH) {
    return "";
  }
  const nextStack = new Set(stack).add(identity);
  const overrideKey = `__var_${variable.name || ""}`;
  let raw: unknown;
  if (hasOwn(answers, overrideKey)) {
    raw = answers[overrideKey];
  } else if (variable.type === "response" && variable.sourceElementId) {
    raw = readFormAnswerValue(answers, variable.sourceElementId);
    if (raw === undefined || raw === null || raw === "") {
      raw = variable.defaultValue ?? "";
    }
  } else {
    raw = variable.defaultValue ?? "";
  }

  if (typeof raw !== "string" || !raw.includes("{{")) return raw;
  return resolveTemplateInternal(raw, answers, variables, nextStack, depth + 1);
}

function resolveToken(
  rawToken: string,
  answers: Record<string, unknown>,
  variables: FormInterpolationVariable[],
  stack: Set<string>,
  depth: number,
): TokenResolution {
  const token = rawToken.trim();
  if (token.startsWith("webhook:")) {
    const separatorIndex = token.indexOf(":", "webhook:".length);
    if (separatorIndex < 0) return { recognized: false, value: undefined };
    const nodeId = token.slice("webhook:".length, separatorIndex);
    const path = token.slice(separatorIndex + 1);
    const storageKey = `__webhook_${nodeId}`;
    return {
      recognized: true,
      value: hasOwn(answers, storageKey)
        ? nestedValue(answers[storageKey], path)
        : undefined,
    };
  }
  if (token.startsWith("ctx.")) {
    return {
      recognized: true,
      value: readFormAnswerValue(answers, `__ctx_${token.slice(4)}`),
    };
  }
  if (token.startsWith("param.")) {
    return {
      recognized: true,
      value: readFormAnswerValue(answers, `__param_${token.slice(6)}`),
    };
  }
  if (token.startsWith("field:")) {
    return {
      recognized: true,
      value: readFormAnswerValue(answers, token.slice(6)),
    };
  }

  const variable = variables.find((candidate) =>
    candidate.name === token || candidate.id === token
  );
  if (variable) {
    return {
      recognized: true,
      value: resolveVariable(variable, answers, variables, stack, depth),
    };
  }
  const direct = readFormAnswerValue(answers, token);
  return direct !== undefined || hasOwn(answers, token)
    ? { recognized: true, value: direct }
    : { recognized: false, value: undefined };
}

function resolveTemplateInternal(
  value: unknown,
  answers: Record<string, unknown>,
  variables: FormInterpolationVariable[],
  stack: Set<string>,
  depth: number,
): unknown {
  if (typeof value !== "string" || !value.includes("{{")) return value;
  const exact = EXACT_TOKEN_PATTERN.exec(value);
  if (exact) {
    const resolved = resolveToken(exact[1], answers, variables, stack, depth);
    return resolved.recognized ? resolved.value ?? "" : "";
  }
  TOKEN_PATTERN.lastIndex = 0;
  const result = value.replace(TOKEN_PATTERN, (_full, token: string) => {
    const resolved = resolveToken(token, answers, variables, stack, depth);
    return resolved.recognized ? stringifyFormValue(resolved.value) : "";
  });
  TOKEN_PATTERN.lastIndex = 0;
  return result;
}

/**
 * Canonical Edge interpolation contract used by e-mail, WhatsApp, AI, pixels,
 * webhooks and the disabled legacy workflow executor. Unknown/missing tokens
 * become empty strings so raw template syntax is never delivered externally.
 */
export function interpolateFormText(
  value: unknown,
  answers: Record<string, unknown>,
  variables: FormInterpolationVariable[],
): string {
  return stringifyFormValue(
    resolveTemplateInternal(value ?? "", answers, variables, new Set(), 0),
  );
}

export function resolveFormTemplateValue(
  value: unknown,
  answers: Record<string, unknown>,
  variables: FormInterpolationVariable[],
): unknown {
  return resolveTemplateInternal(value, answers, variables, new Set(), 0);
}

/**
 * Build the typed variable snapshot used by Edge integration payloads.
 * Only persisted variable names are emitted; explicit overrides still win,
 * including `false`, `0` and the empty string.
 */
export function resolveFormVariableValues(
  variables: FormInterpolationVariable[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const safeVariables = variables.slice(0, 250).filter((variable) => {
    if (!variable || typeof variable !== "object") return false;
    const name = variable.name || "";
    return Boolean(name) && name.length <= 256 &&
      !DANGEROUS_PATH_SEGMENTS.has(name.toLowerCase());
  });
  return Object.fromEntries(safeVariables.map((variable) => {
    const resolved = resolveVariable(
      variable,
      answers,
      safeVariables,
      new Set(),
      0,
    );
    return [variable.name || "", resolved === undefined ? "" : resolved];
  }));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Preserve trusted configured e-mail markup while escaping all runtime values. */
export function interpolateFormHtml(
  value: unknown,
  answers: Record<string, unknown>,
  variables: FormInterpolationVariable[],
): string {
  const template = String(value ?? "");
  TOKEN_PATTERN.lastIndex = 0;
  const result = template.replace(TOKEN_PATTERN, (_full, token: string) => {
    const resolved = resolveToken(token, answers, variables, new Set(), 0);
    return resolved.recognized
      ? escapeHtml(stringifyFormValue(resolved.value))
      : "";
  });
  TOKEN_PATTERN.lastIndex = 0;
  return result;
}
