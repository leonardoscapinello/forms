import {
  buildGoogleSheetsResponseRow,
  buildGoogleSheetsSchema,
  chunkGoogleSheetsRows,
} from "./googleSheetsSchema.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

function assertThrows(
  operation: () => unknown,
  expectedMessage: string,
): void {
  try {
    operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedMessage)) return;
    throw new Error(`expected ${expectedMessage}, received ${message}`);
  }
  throw new Error(`expected operation to throw ${expectedMessage}`);
}

Deno.test("Google Sheets uses one canonical header for fields, variables and GET parameters", () => {
  const schema = buildGoogleSheetsSchema({
    pages: [{
      elements: [{
        id: "layout",
        type: "columns",
        columnData: [{
          elements: [{ id: "email", type: "input_email", label: "E-mail" }],
        }],
      }, { id: "name", type: "input_text", placeholder: "Nome" }],
    }],
    variables: [{ name: "score" }],
    trackedParams: [
      { key: "campaign", label: "Campanha", enabled: true },
      { key: "ignored", label: "Ignorado", enabled: false },
    ],
  });

  assertEquals(schema.inputElements, [
    { id: "email", label: "E-mail" },
    { id: "name", label: "Nome" },
  ]);
  assertEquals(schema.variables, [{ name: "score" }]);
  assertEquals(schema.trackedParams, [
    { key: "campaign", label: "Campanha" },
  ]);
  assertEquals(schema.headers, [
    "#",
    "ID",
    "Status",
    "Entrada",
    "Envio",
    "Duração",
    "E-mail",
    "Nome",
    "⚡ score",
    "🔗 Campanha",
  ]);
});

Deno.test("Google Sheets supplies the default UTM schema only when no custom list exists", () => {
  const defaults = buildGoogleSheetsSchema({ pages: [] });
  assertEquals(defaults.trackedParams.map((parameter) => parameter.key), [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]);

  const explicitEmpty = buildGoogleSheetsSchema({
    pages: [],
    trackedParams: [],
  });
  assertEquals(explicitEmpty.trackedParams, []);
});

Deno.test("Google Sheets refuses a form wider than the supported server contract", () => {
  const elements = Array.from({ length: 495 }, (_, index) => ({
    id: `field-${index}`,
    type: "input_text",
    label: `Campo ${index}`,
  }));
  assertThrows(
    () => buildGoogleSheetsSchema({ pages: [{ elements }] }),
    "google_sheet_schema_too_wide",
  );
});

Deno.test("Google Sheets expands compound answers with the same canonical order used by the builder", () => {
  const schema = buildGoogleSheetsSchema({
    pages: [{
      elements: [
        { id: "phone", type: "input_phone", label: "Telefone" },
        { id: "height", type: "input_height", label: "Altura" },
      ],
    }],
  });

  assertEquals(schema.inputElements, [
    { id: "phone", subKey: "ddi", label: "Telefone — DDI" },
    { id: "phone", subKey: "number", label: "Telefone — Número" },
    {
      id: "phone",
      subKey: "countryCode",
      label: "Telefone — Código do país",
    },
    { id: "height", subKey: "value", label: "Altura — Valor" },
    { id: "height", subKey: "unit", label: "Altura — Unidade" },
  ]);
  const row = buildGoogleSheetsResponseRow(schema, {
    sequence: 3,
    responseId: "response-3",
    answers: {
      phone: { ddi: "+55", number: "11999999999", countryCode: "BR" },
      height: { value: 1.82, unit: "m" },
    },
    metadata: {},
    completedAt: "2026-08-10T20:00:00.000Z",
  });
  assertEquals(row.slice(6, 11), ["+55", "11999999999", "BR", 1.82, "m"]);
});

Deno.test("Google Sheets rows use completed_at as authoritative status and serialize structured variables safely", () => {
  const schema = buildGoogleSheetsSchema({
    pages: [{
      elements: [{ id: "name", type: "input_text", label: "Nome" }],
    }],
    variables: [{ name: "profile" }],
    trackedParams: [{ key: "campaign", label: "Campanha", enabled: true }],
  });
  const partial = buildGoogleSheetsResponseRow(schema, {
    sequence: 1,
    responseId: "partial-id",
    answers: {
      name: "Leo",
      __var_profile: { tier: "pro" },
      __param_campaign: "launch",
    },
    metadata: {
      status: "complete",
      submitted_at: "2026-08-10T20:00:00.000Z",
      landed_at: "not-a-date",
    },
    completedAt: null,
  });
  assertEquals(partial[2], "Parcial");
  assertEquals(partial[3], "");
  assertEquals(partial.slice(-2), ['{"tier":"pro"}', "launch"]);

  const complete = buildGoogleSheetsResponseRow(schema, {
    sequence: 2,
    responseId: "complete-id",
    answers: {},
    metadata: { status: "partial" },
    completedAt: "2026-08-10T20:00:00.000Z",
  });
  assertEquals(complete[2], "Completa");
  if (complete[4] === "") throw new Error("completed_at must populate Envio");
});

Deno.test("Google Sheets schema removes duplicate field, variable and GET identities", () => {
  const schema = buildGoogleSheetsSchema({
    pages: [{
      elements: [
        { id: "name", type: "input_text", label: "Nome" },
        { id: "name", type: "input_text", label: "Nome repetido" },
      ],
    }],
    variables: [{ name: "score" }, { name: "score" }],
    trackedParams: [
      { key: "campaign", label: "Campanha", enabled: true },
      { key: "campaign", label: "Campanha repetida", enabled: true },
    ],
  });
  assertEquals(schema.inputElements.length, 1);
  assertEquals(schema.variables.length, 1);
  assertEquals(schema.trackedParams.length, 1);
});

Deno.test("Google Sheets resolves every configured variable source canonically", () => {
  const schema = buildGoogleSheetsSchema({
    pages: [],
    trackedParams: [],
    variables: [
      {
        id: "response",
        name: "city",
        type: "response",
        sourceElementId: "address.city",
      },
      {
        id: "fallback",
        name: "fallback",
        type: "response",
        sourceElementId: "missing",
        defaultValue: "padrão",
      },
      {
        id: "param",
        name: "campaign",
        type: "text",
        defaultValue: "{{param.utm_source}}",
      },
      {
        id: "context",
        name: "device",
        type: "text",
        defaultValue: "{{ctx.device}}",
      },
      { id: "zero", name: "zero", type: "number", defaultValue: 99 },
      { id: "false", name: "false_value", type: "boolean", defaultValue: true },
      { id: "empty", name: "empty", type: "text", defaultValue: "fallback" },
    ],
  });
  const row = buildGoogleSheetsResponseRow(schema, {
    sequence: 1,
    responseId: "response-variables",
    answers: {
      address: { city: "São Paulo" },
      __param_utm_source: "campanha",
      __ctx_device: "mobile",
      __var_zero: 0,
      __var_false_value: false,
      __var_empty: "",
    },
  });

  assertEquals(row.slice(6), [
    "São Paulo",
    "padrão",
    "campanha",
    "mobile",
    0,
    "Não",
    "",
  ]);
});

Deno.test("Google Sheets refuses variable contracts beyond the canonical resolver limit", () => {
  assertThrows(
    () =>
      buildGoogleSheetsSchema({
        pages: [],
        trackedParams: [],
        variables: Array.from({ length: 251 }, (_, index) => ({
          name: `variable-${index}`,
        })),
      }),
    "google_sheet_variable_limit_exceeded",
  );
});

Deno.test("Google Sheets write batches obey row and UTF-8 byte ceilings without truncation", () => {
  const rows = [
    [1, "á".repeat(20)],
    [2, "b".repeat(20)],
    [3, "c".repeat(20)],
  ];
  const batches = chunkGoogleSheetsRows(rows, 2, 100);
  assertEquals(batches.flat(), rows);
  if (batches.some((batch) => batch.length > 2)) {
    throw new Error("row ceiling exceeded");
  }
  const encoder = new TextEncoder();
  if (
    batches.some((batch) =>
      encoder.encode(JSON.stringify({ values: batch })).byteLength > 100
    )
  ) throw new Error("byte ceiling exceeded");

  assertThrows(
    () => chunkGoogleSheetsRows([[1, "x".repeat(200)]], 500, 100),
    "google_sheet_row_too_large",
  );
});
