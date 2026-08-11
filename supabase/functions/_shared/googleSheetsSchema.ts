import { flattenFormElements } from "./publicFormAuth.ts";
import {
  type FormInterpolationVariable,
  resolveFormVariableValues,
} from "./formInterpolation.ts";

export const MAX_GOOGLE_SHEET_COLUMNS = 500;
export const MAX_GOOGLE_SHEETS_WRITE_ROWS = 500;
export const MAX_GOOGLE_SHEET_VARIABLES = 250;
// Google accepts larger HTTP requests, but keeping a conservative ceiling gives
// the Edge runtime and provider enough headroom for UTF-8/JSON overhead.
export const MAX_GOOGLE_SHEETS_WRITE_BYTES = 4_000_000;

type SheetField = { id: string; label: string; subKey?: string };
type SheetVariable = FormInterpolationVariable & { name: string };
type SheetParameter = { key: string; label: string };

export type GoogleSheetsSchema = {
  inputElements: SheetField[];
  variables: SheetVariable[];
  trackedParams: SheetParameter[];
  headers: string[];
};

export type GoogleSheetsResponseRow = {
  sequence: number;
  responseId: string;
  answers: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  totalTimeMs?: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
};

const DEFAULT_TRACKED_PARAMS = [
  { key: "utm_source", label: "UTM Source", enabled: true },
  { key: "utm_medium", label: "UTM Medium", enabled: true },
  { key: "utm_campaign", label: "UTM Campaign", enabled: true },
  { key: "utm_content", label: "UTM Content", enabled: true },
  { key: "utm_term", label: "UTM Term", enabled: true },
] as const;

/** Must remain aligned with the builder's COMPOUND_FIELD_SUB_KEYS contract. */
const COMPOUND_FIELD_SUB_KEYS: Record<
  string,
  ReadonlyArray<{ key: string; label: string }>
> = {
  input_address: [
    { key: "country", label: "País" },
    { key: "cep", label: "CEP" },
    { key: "street", label: "Rua" },
    { key: "number", label: "Número" },
    { key: "complement", label: "Complemento" },
    { key: "neighborhood", label: "Bairro" },
    { key: "city", label: "Cidade" },
    { key: "state", label: "Estado" },
  ],
  input_company: [
    { key: "cnpj", label: "CNPJ" },
    { key: "razao_social", label: "Razão Social" },
    { key: "nome_fantasia", label: "Nome Fantasia" },
    { key: "situacao", label: "Situação" },
    { key: "porte", label: "Porte" },
    { key: "natureza_juridica", label: "Natureza Jurídica" },
    { key: "cnae_principal", label: "CNAE" },
    { key: "logradouro", label: "Logradouro" },
    { key: "numero", label: "Número" },
    { key: "municipio", label: "Município" },
    { key: "uf", label: "UF" },
    { key: "cep", label: "CEP" },
    { key: "telefone", label: "Telefone" },
    { key: "email", label: "E-mail" },
  ],
  input_phone: [
    { key: "ddi", label: "DDI" },
    { key: "number", label: "Número" },
    { key: "countryCode", label: "Código do país" },
  ],
  input_height: [
    { key: "value", label: "Valor" },
    { key: "unit", label: "Unidade" },
  ],
  input_weight: [
    { key: "value", label: "Valor" },
    { key: "unit", label: "Unidade" },
  ],
};

function boundedLabel(value: unknown, fallback: string): string {
  const label = typeof value === "string" ? value.trim() : "";
  return (label || fallback).slice(0, 500);
}

function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = identity(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sheetValue(value: unknown): string | number {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" || typeof item === "number"
        ? String(item)
        : JSON.stringify(item)
    ).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function resolveCellValue(
  answers: Record<string, unknown>,
  field: SheetField,
): string | number {
  const parent = answers[field.id];
  if (!field.subKey) {
    if (parent && typeof parent === "object" && !Array.isArray(parent)) {
      const fullNumber = (parent as Record<string, unknown>).full_number;
      if (fullNumber !== undefined && fullNumber !== null) {
        return sheetValue(fullNumber);
      }
    }
    return sheetValue(parent);
  }
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) return "";
  return sheetValue((parent as Record<string, unknown>)[field.subKey]);
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${
    date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
  } ${
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  }`;
}

function formatDuration(milliseconds: number | null | undefined): string {
  if (
    typeof milliseconds !== "number" || !Number.isFinite(milliseconds) ||
    milliseconds <= 0
  ) return "";
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Canonical column contract shared by sheet creation, manual replacement and
 * the durable per-response worker. Keeping it server-side prevents a browser
 * payload or a future UI change from creating a sheet the worker cannot use.
 */
export function buildGoogleSheetsSchema(formData: unknown): GoogleSheetsSchema {
  const data = formData && typeof formData === "object" &&
      !Array.isArray(formData)
    ? formData as Record<string, unknown>
    : {};
  const inputElements: SheetField[] = [];
  const pages = Array.isArray(data.pages) ? data.pages : [];
  for (const page of pages) {
    if (!page || typeof page !== "object" || Array.isArray(page)) continue;
    const elements = Array.isArray((page as Record<string, unknown>).elements)
      ? (page as Record<string, unknown>).elements as any[]
      : [];
    for (const element of flattenFormElements(elements)) {
      if (
        typeof element?.id !== "string" || !element.id ||
        typeof element?.type !== "string" ||
        !element.type.startsWith("input_")
      ) continue;
      const baseLabel = boundedLabel(
        element.label || element.placeholder,
        element.type.replace("input_", "").replace(/_/g, " "),
      );
      const subFields = COMPOUND_FIELD_SUB_KEYS[element.type];
      if (subFields?.length) {
        for (const subField of subFields) {
          inputElements.push({
            id: element.id,
            subKey: subField.key,
            label: boundedLabel(
              `${baseLabel} — ${subField.label}`,
              `${element.id}.${subField.key}`,
            ),
          });
        }
      } else {
        inputElements.push({ id: element.id, label: baseLabel });
      }
    }
  }

  const variables = (Array.isArray(data.variables) ? data.variables : [])
    .flatMap((candidate): SheetVariable[] => {
      if (
        !candidate || typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) return [];
      const configured = candidate as Record<string, unknown>;
      const name = configured.name;
      if (typeof name !== "string" || !name.trim()) return [];
      const variable: SheetVariable = { name: name.trim().slice(0, 200) };
      if (typeof configured.id === "string" && configured.id) {
        variable.id = configured.id.slice(0, 256);
      }
      if (typeof configured.type === "string" && configured.type) {
        variable.type = configured.type.slice(0, 64);
      }
      if (typeof configured.sourceElementId === "string") {
        variable.sourceElementId = configured.sourceElementId.slice(0, 512);
      }
      if (Object.prototype.hasOwnProperty.call(configured, "defaultValue")) {
        variable.defaultValue = configured.defaultValue;
      }
      return [variable];
    });

  const configuredParams = Array.isArray(data.trackedParams)
    ? data.trackedParams
    : DEFAULT_TRACKED_PARAMS;
  const trackedParams = configuredParams.flatMap(
    (candidate): SheetParameter[] => {
      if (
        !candidate || typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) return [];
      const parameter = candidate as Record<string, unknown>;
      if (
        parameter.enabled !== true || typeof parameter.key !== "string" ||
        !parameter.key.trim()
      ) return [];
      const key = parameter.key.trim().slice(0, 200);
      return [{ key, label: boundedLabel(parameter.label, key) }];
    },
  );

  const canonicalInputs = uniqueBy(
    inputElements,
    (field) => `${field.id}\u0000${field.subKey || ""}`,
  );
  const canonicalVariables = uniqueBy(variables, (variable) => variable.name);
  if (canonicalVariables.length > MAX_GOOGLE_SHEET_VARIABLES) {
    throw new Error("google_sheet_variable_limit_exceeded");
  }
  const canonicalParams = uniqueBy(trackedParams, (parameter) => parameter.key);
  const headers = [
    "#",
    "ID",
    "Status",
    "Entrada",
    "Envio",
    "Duração",
    ...canonicalInputs.map((field) => field.label),
    ...canonicalVariables.map((variable) => `⚡ ${variable.name}`),
    ...canonicalParams.map((parameter) => `🔗 ${parameter.label}`),
  ];
  if (headers.length > MAX_GOOGLE_SHEET_COLUMNS) {
    throw new Error("google_sheet_schema_too_wide");
  }
  return {
    inputElements: canonicalInputs,
    variables: canonicalVariables,
    trackedParams: canonicalParams,
    headers,
  };
}

/** Builds the exact row contract used by manual sync and durable delivery. */
export function buildGoogleSheetsResponseRow(
  schema: GoogleSheetsSchema,
  response: GoogleSheetsResponseRow,
): Array<string | number> {
  const metadata = response.metadata || {};
  const landedAt = metadata.landed_at || response.createdAt;
  const submittedAt = response.completedAt || metadata.submitted_at;
  const resolvedVariables = resolveFormVariableValues(
    schema.variables,
    response.answers,
  );
  return [
    response.sequence,
    response.responseId,
    response.completedAt ? "Completa" : "Parcial",
    formatDate(landedAt),
    formatDate(submittedAt),
    formatDuration(response.totalTimeMs),
    ...schema.inputElements.map((field) =>
      resolveCellValue(response.answers, field)
    ),
    ...schema.variables.map((variable) =>
      sheetValue(resolvedVariables[variable.name])
    ),
    ...schema.trackedParams.map((parameter) =>
      sheetValue(response.answers[`__param_${parameter.key}`])
    ),
  ];
}

/**
 * Splits values by both row count and encoded JSON body size. A single row that
 * exceeds the provider-safe ceiling is rejected instead of being truncated.
 */
export function chunkGoogleSheetsRows(
  rows: Array<Array<string | number>>,
  maxRows = MAX_GOOGLE_SHEETS_WRITE_ROWS,
  maxBytes = MAX_GOOGLE_SHEETS_WRITE_BYTES,
): Array<Array<Array<string | number>>> {
  const boundedRows = Math.max(1, Math.floor(maxRows));
  const boundedBytes = Math.max(64, Math.floor(maxBytes));
  const encoder = new TextEncoder();
  const batches: Array<Array<Array<string | number>>> = [];
  let current: Array<Array<string | number>> = [];
  let currentBytes = encoder.encode('{"values":[]}').byteLength;

  for (const row of rows) {
    const encodedRowBytes = encoder.encode(JSON.stringify(row)).byteLength;
    const rowPayloadBytes = encodedRowBytes + (current.length > 0 ? 1 : 0);
    if (
      encoder.encode(`{"values":[${JSON.stringify(row)}]}`).byteLength >
        boundedBytes
    ) {
      throw new Error("google_sheet_row_too_large");
    }
    if (
      current.length >= boundedRows ||
      (current.length > 0 && currentBytes + rowPayloadBytes > boundedBytes)
    ) {
      batches.push(current);
      current = [];
      currentBytes = encoder.encode('{"values":[]}').byteLength;
    }
    current.push(row);
    currentBytes += encodedRowBytes + (current.length > 1 ? 1 : 0);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
