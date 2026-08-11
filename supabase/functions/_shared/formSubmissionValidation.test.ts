import {
  isCompletionSubmissionRequest,
  isInequivocallyLinearForm,
  sanitizePublicPageEventTelemetry,
  sanitizePublicSessionTelemetry,
  validateFormSubmission,
} from "./formSubmissionValidation.ts";
import { deterministicWorkflowFraction } from "./workflowPathAuthorization.ts";

function assert(condition: unknown, message = "assertion_failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

const NOW = new Date("2026-08-11T12:00:00.000Z");

const LINEAR_FORM = {
  pages: [
    {
      id: "identity",
      elements: [
        { id: "email", type: "input_email", required: true },
        { id: "phone", type: "input_phone" },
        {
          id: "choice",
          type: "input_select",
          options: [{ id: "allowed", label: "Permitida" }],
        },
        {
          id: "birthday",
          type: "input_date",
          dateMode: "date",
          dateMaxRule: { mode: "today" },
        },
        { id: "quantity", type: "input_number", min: 1, max: 10 },
      ],
    },
    {
      id: "details",
      elements: [{ id: "details", type: "input_textarea", required: true }],
    },
  ],
  flowEdges: [
    { source: "start", target: "p-identity" },
    { source: "p-identity", target: "p-details" },
    { source: "p-details", target: "end" },
  ],
  variables: [{ id: "var-score", name: "score" }],
  trackedParams: [{ key: "campaign_id", enabled: true }],
  integrationNodes: [{ id: "hook" }],
};

Deno.test("public completion ignores forged metadata and uses the final-operation marker", () => {
  assert(!isCompletionSubmissionRequest("response", "upsert", {
    metadata: { status: "complete", submitted_at: "1999-01-01T00:00:00.000Z" },
  }));
  assert(isCompletionSubmissionRequest("response", "upsert", {
    metadata: { status: "partial" },
    completion_time_on_page_ms: 1,
  }));
  assert(isCompletionSubmissionRequest("response", "upsert", {
    metadata: { status: "complete" },
  }, true));
  assert(!isCompletionSubmissionRequest("session", "update", {
    completion_time_on_page_ms: 1,
  }, true));
});

Deno.test("completion reproduces the same stable A/B branch from the signed response identity", () => {
  const responseId = "20000000-0000-4000-8000-000000000001";
  const firstSelected = deterministicWorkflowFraction(`${responseId}:experiment`) < 0.5;
  const form = {
    pages: [
      { id: "first", elements: [{ id: "first-field", type: "input_text", required: true }] },
      { id: "second", elements: [{ id: "second-field", type: "input_text", required: true }] },
    ],
    abTestNodes: [{
      id: "experiment",
      variants: [{ id: "first", weight: 50 }, { id: "second", weight: 50 }],
    }],
    flowEdges: [
      { source: "start", target: "ab-experiment" },
      { source: "ab-experiment", sourceHandle: "ab-first", target: "p-first" },
      { source: "ab-experiment", sourceHandle: "ab-second", target: "p-second" },
      { source: "p-first", target: "end" },
      { source: "p-second", target: "end" },
    ],
  };
  const selectedField = firstSelected ? "first-field" : "second-field";
  const accepted = validateFormSubmission(
    form,
    { [selectedField]: "ok" },
    {},
    { completion: true, responseId },
  );
  assert(accepted.ok);
  const missing = validateFormSubmission(form, {}, {}, { completion: true, responseId });
  assert(!missing.ok);
  assertEquals(missing.fields, [selectedField]);
});

Deno.test("linear completion enforces required fields and validates typed values", () => {
  assert(isInequivocallyLinearForm(LINEAR_FORM));
  const valid = validateFormSubmission(LINEAR_FORM, {
    email: "lead@example.com",
    phone: { countryCode: "BR", ddi: "+55", number: "(11) 99999-9999" },
    choice: "allowed",
    birthday: "2000-02-29T12:00:00.000Z",
    quantity: 7,
    details: "Quero conversar",
    __var_score: 7,
    __param_campaign_id: "campaign-1",
    __ctx_device: "desktop",
    __webhook_hook: { lead: { id: "lead-1" } },
    __ctx_notPersisted: "discard-me",
    "phone.number": "00000000000",
  }, { status: "complete" }, { completion: true, now: NOW });

  assert(valid.ok);
  assert(valid.requiredFieldsEnforced);
  assertEquals(valid.answers.__ctx_notPersisted, undefined);
  assertEquals(valid.answers.choice, "allowed");
  assertEquals(valid.answers["phone.number"], "(11) 99999-9999");

  const missing = validateFormSubmission(LINEAR_FORM, {
    email: "lead@example.com",
  }, {}, { completion: true, now: NOW });
  assert(!missing.ok);
  assertEquals(missing.fields, ["details"]);

  const invalidTypedValues = validateFormSubmission(LINEAR_FORM, {
    email: "not-an-email",
    phone: { countryCode: "BR", ddi: "+55", number: "119999" },
    choice: "forged-option",
    birthday: "2027-01-01T12:00:00.000Z",
    quantity: 11,
    details: "ok",
  }, {}, { completion: true, now: NOW });
  assert(!invalidTypedValues.ok);
  assertEquals(invalidTypedValues.fields, [
    "birthday",
    "choice",
    "email",
    "phone",
    "quantity",
  ]);
});

Deno.test("optional empty phone state is accepted while required empty phone fails", () => {
  const optionalForm = {
    pages: [{
      id: "contact",
      elements: [{ id: "phone", type: "input_phone", required: false }],
    }],
    flowEdges: [
      { source: "start", target: "p-contact" },
      { source: "p-contact", target: "end" },
    ],
  };
  const selectedCountryWithoutNumber = {
    countryCode: "US",
    ddi: "+1",
    number: "",
  };

  const optional = validateFormSubmission(
    optionalForm,
    { phone: selectedCountryWithoutNumber },
    {},
    { completion: true, now: NOW },
  );
  assert(optional.ok);
  assertEquals(optional.answers.phone, selectedCountryWithoutNumber);

  const requiredForm = {
    ...optionalForm,
    pages: [{
      id: "contact",
      elements: [{ id: "phone", type: "input_phone", required: true }],
    }],
  };
  const required = validateFormSubmission(
    requiredForm,
    { phone: selectedCountryWithoutNumber },
    {},
    { completion: true, now: NOW },
  );
  assert(!required.ok);
  assertEquals(required.fields, ["phone"]);
});

Deno.test("conditional completion enforces only required fields on the resolved branch", () => {
  const conditional = {
    pages: [
      {
        id: "qualifier",
        elements: [{
          id: "audience",
          type: "input_radio",
          required: true,
          options: [
            { id: "adult", label: "Maior de idade" },
            { id: "minor", label: "Menor de idade" },
          ],
        }],
      },
      {
        id: "adult",
        elements: [{ id: "adult_name", type: "input_text", required: true }],
      },
      {
        id: "minor",
        elements: [{ id: "guardian", type: "input_text", required: true }],
      },
    ],
    conditions: [{
      id: "audience-route",
      branches: [{
        id: "adult",
        conditionGroup: {
          id: "adult-group",
          logic: "and",
          rules: [{
            id: "adult-rule",
            questionId: "audience",
            operator: "equals",
            value: "adult",
          }],
          groups: [],
        },
      }],
    }],
    flowEdges: [
      { source: "start", target: "p-qualifier" },
      { source: "p-qualifier", target: "c-audience-route" },
      {
        source: "c-audience-route",
        sourceHandle: "branch-adult",
        target: "p-adult",
      },
      {
        source: "c-audience-route",
        sourceHandle: "branch-default",
        target: "p-minor",
      },
      { source: "p-adult", target: "end" },
      { source: "p-minor", target: "end" },
    ],
  };
  assert(!isInequivocallyLinearForm(conditional));

  const missingReached = validateFormSubmission(
    conditional,
    { audience: "adult" },
    {},
    { completion: true, now: NOW },
  );
  assert(!missingReached.ok);
  assertEquals(missingReached.fields, ["adult_name"]);

  const adult = validateFormSubmission(
    conditional,
    { audience: "adult", adult_name: "Leonardo" },
    {},
    { completion: true, now: NOW },
  );
  assert(adult.ok);
  assert(adult.requiredFieldsEnforced);

  const missingDefaultBranch = validateFormSubmission(
    conditional,
    { audience: "minor" },
    {},
    { completion: true, now: NOW },
  );
  assert(!missingDefaultBranch.ok);
  assertEquals(missingDefaultBranch.fields, ["guardian"]);
});

Deno.test("conditional routing rejects forged future inputs, cycles and ambiguous edges", () => {
  const forgedFuture = {
    pages: [
      { id: "first", elements: [{ id: "first_value", type: "input_text" }] },
      { id: "future", elements: [{ id: "future_value", type: "input_text" }] },
    ],
    conditions: [{
      id: "route",
      branches: [{
        id: "forged",
        conditionGroup: {
          id: "group",
          logic: "and",
          rules: [{
            id: "rule",
            questionId: "future_value",
            operator: "equals",
            value: "open",
          }],
          groups: [],
        },
      }],
    }],
    flowEdges: [
      { source: "start", target: "p-first" },
      { source: "p-first", target: "c-route" },
      { source: "c-route", sourceHandle: "branch-forged", target: "end" },
      { source: "c-route", sourceHandle: "branch-default", target: "p-future" },
      { source: "p-future", target: "end" },
    ],
  };
  const forged = validateFormSubmission(
    forgedFuture,
    { first_value: "ok", future_value: "open" },
    {},
    { completion: true, now: NOW },
  );
  assert(!forged.ok);
  assertEquals(forged.fields, []);

  const cycle = validateFormSubmission({
    pages: [{ id: "loop", elements: [{ id: "value", type: "input_text" }] }],
    flowEdges: [
      { source: "start", target: "p-loop" },
      { source: "p-loop", target: "p-loop" },
    ],
  }, { value: "ok" }, {}, { completion: true, now: NOW });
  assert(!cycle.ok);

  const ambiguous = validateFormSubmission({
    pages: [
      { id: "one", elements: [{ id: "one", type: "input_text" }] },
      { id: "two", elements: [{ id: "two", type: "input_text" }] },
    ],
    flowEdges: [
      { source: "start", target: "p-one" },
      { source: "start", target: "p-two" },
      { source: "p-one", target: "end" },
      { source: "p-two", target: "end" },
    ],
  }, { one: "ok" }, {}, { completion: true, now: NOW });
  assert(!ambiguous.ok);
});

Deno.test("jump nodes skip required fields only on pages outside the persisted route", () => {
  const jumped = validateFormSubmission({
    pages: [
      { id: "start", elements: [{ id: "source", type: "input_text", required: true }] },
      { id: "skipped", elements: [{ id: "skipped", type: "input_text", required: true }] },
      { id: "destination", elements: [{ id: "destination", type: "input_text", required: true }] },
    ],
    jumpNodes: [{ id: "jump", destinationType: "page", targetPageId: "destination" }],
    flowEdges: [
      { source: "start", target: "p-start" },
      { source: "p-start", target: "jp-jump" },
      { source: "p-destination", target: "end" },
    ],
  }, {
    source: "origem",
    destination: "destino",
  }, {}, { completion: true, now: NOW });
  assert(jumped.ok);
  assert(jumped.requiredFieldsEnforced);
});

Deno.test("response metadata is allowlisted, typed and stripped of client authority", () => {
  const result = validateFormSubmission(
    LINEAR_FORM,
    {},
    {
      response_hash: "ABC123",
      user_agent: "Mozilla/5.0",
      referrer: "https://example.com/origin",
      query_params: { utm_source: "meta" },
      landed_at: "2026-08-11T10:00:00-02:00",
      last_page_index: 1,
      status: "complete",
      submitted_at: "1999-01-01T00:00:00.000Z",
      execution_mode: "forged",
      arbitrary: { secret: true },
    },
    { completion: false, now: NOW, serverUserAgent: "Edge-UA/1.0" },
  );
  assert(result.ok);
  assertEquals(result.metadata, {
    response_hash: "ABC123",
    user_agent: "Edge-UA/1.0",
    referrer: "https://example.com/origin",
    query_params: { utm_source: "meta" },
    landed_at: "2026-08-11T12:00:00.000Z",
    last_page_index: 1,
  });

  const invalid = validateFormSubmission(
    LINEAR_FORM,
    {},
    { query_params: { utm_source: { nested: "not persisted" } } },
    { completion: false, now: NOW },
  );
  assert(!invalid.ok);

  const forgedTiming = validateFormSubmission(
    LINEAR_FORM,
    {},
    { landed_at: "2020-01-01T00:00:00.000Z" },
    { completion: false, now: NOW },
  );
  assert(!forgedTiming.ok);
});

Deno.test("param references across defaults, redirects and integrations extend only the exact allowlist", () => {
  const form = {
    pages: [{
      id: "page",
      elements: [{
        id: "birth",
        type: "input_text",
        defaultValue: "{{param.birth_date}}",
      }],
    }],
    variables: [{
      id: "variable",
      name: "source",
      defaultValue: "{{param.variable_source}}",
    }],
    completionRedirectUrl: "https://example.com/?to={{param.destination}}",
    emailNodes: [{ bodyText: "Campanha {{param.email_campaign}}" }],
    whatsappNodes: [{ messageText: "Origem {{param.whatsapp_source}}" }],
    aiNodes: [{ prompt: "Segmento {{param.ai_segment}}" }],
    integrationNodes: [{ id: "hook", webhookUrl: "https://example.com/{{param.webhook_key}}" }],
    trackedParams: [],
  };
  const allowedValues = {
    __param_birth_date: "2000-01-01",
    __param_variable_source: "landing",
    __param_destination: "checkout",
    __param_email_campaign: "mail",
    __param_whatsapp_source: "wa",
    __param_ai_segment: "hot",
    __param_webhook_key: "hook-key",
  };
  const result = validateFormSubmission(
    form,
    {
      ...allowedValues,
      __param_arbitrary: "discard",
      __param___proto__: "discard",
    },
    {
      query_params: {
        birth_date: "2000-01-01",
        email_campaign: "mail",
        arbitrary: "discard",
      },
    },
    { completion: false, now: NOW },
  );
  assert(result.ok);
  for (const [key, value] of Object.entries(allowedValues)) {
    assertEquals(result.answers[key], value);
  }
  assertEquals(result.answers.__param_arbitrary, undefined);
  assertEquals(result.answers.__param___proto__, undefined);
  assertEquals(result.metadata.query_params, {
    birth_date: "2000-01-01",
    email_campaign: "mail",
  });
});

Deno.test("submission allowlist rejects unknown field ids and caps structural abuse", () => {
  const unknown = validateFormSubmission(
    LINEAR_FORM,
    { email: "lead@example.com", details: "ok", stolen_email: "victim@example.com" },
    {},
    { completion: true, now: NOW },
  );
  assert(!unknown.ok);

  const tooDeep = validateFormSubmission(
    LINEAR_FORM,
    { email: "lead@example.com", details: "ok", __webhook_hook: { a: { b: { c: { d: 1 } } } } },
    {},
    { completion: true, now: NOW },
  );
  assert(!tooDeep.ok);

  const tooManyNestedKeys = validateFormSubmission(
    LINEAR_FORM,
    {
      __webhook_hook: {
        first: Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [`a${index}`, index]),
        ),
        second: Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [`b${index}`, index]),
        ),
      },
    },
    {},
    { completion: false, now: NOW },
  );
  assert(!tooManyNestedKeys.ok);

  const largeElements = Array.from({ length: 10 }, (_, index) => ({
    id: `large-${index}`,
    type: "input_text",
  }));
  const oversizedAnswers = Object.fromEntries(
    largeElements.map((element) => [element.id, "x".repeat(10_000)]),
  );
  const oversized = validateFormSubmission(
    { pages: [{ id: "large", elements: largeElements }] },
    oversizedAnswers,
    {},
    { completion: false, now: NOW },
  );
  assert(!oversized.ok);
});

Deno.test("fixed date rules reject impossible calendar dates", () => {
  const impossibleRule = {
    pages: [{
      id: "date",
      elements: [{
        id: "date",
        type: "input_date",
        dateMinRule: { mode: "fixed", fixedDate: "2026-02-31" },
      }],
    }],
  };
  const result = validateFormSubmission(
    impossibleRule,
    { date: "2026-03-01T12:00:00.000Z" },
    {},
    { completion: false, now: NOW },
  );
  assert(!result.ok);
});

Deno.test("compound fields accept their persisted shape and reject forged values", () => {
  const compoundForm = {
    pages: [{
      id: "compound",
      elements: [
        { id: "address", type: "input_address" },
        {
          id: "document",
          type: "input_document",
          documentAllowedTypes: ["cpf"],
        },
        { id: "company", type: "input_company" },
        { id: "height", type: "input_height", unit: "cm", min: 100, max: 250 },
      ],
    }],
  };
  const valid = validateFormSubmission(compoundForm, {
    address: {
      country: "BR",
      cep: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      city: "São Paulo",
      state: "SP",
    },
    document: { documentType: "cpf", value: "529.982.247-25" },
    company: { cnpj: "04.252.011/0001-10", internal_role: "admin" },
    height: { value: 180, unit: "cm" },
    "address.city": "Cidade forjada",
    "company.cnpj": "00.000.000/0000-00",
    "height.value": "999",
  }, {}, { completion: false, now: NOW });
  assert(valid.ok);
  assertEquals(valid.answers["height.value"], "180");
  assertEquals(valid.answers["document.documentType"], "cpf");
  assertEquals(valid.answers["address.city"], "São Paulo");
  assertEquals(valid.answers["company.cnpj"], "04.252.011/0001-10");
  assertEquals(
    (valid.answers.company as Record<string, unknown>).internal_role,
    undefined,
  );

  const invalid = validateFormSubmission(compoundForm, {
    address: { country: "BR", street: "x" },
    document: { documentType: "passport", value: "ABC123" },
    company: { cnpj: "00.000.000/0000-00" },
    height: { value: 180, unit: "kg" },
  }, {}, { completion: false, now: NOW });
  assert(!invalid.ok);
  assertEquals(invalid.fields, ["address", "company", "document", "height"]);
});

Deno.test("session telemetry is bounded and derives public status/page totals", () => {
  const form = {
    pages: [{ id: "first", title: "Primeira" }, { id: "second", title: "Segunda" }],
  };
  const valid = sanitizePublicSessionTelemetry({
    status: "completed",
    completed_at: "1999-01-01T00:00:00.000Z",
    last_seen_at: "2026-08-11T10:00:00-02:00",
    current_page_index: 1,
    pages_visited: 2,
    total_pages: 999,
    source_url: "https://forms.example/f/form",
    referrer: null,
    user_agent: "Mozilla/5.0",
    query_params: { utm_source: "meta" },
  }, form, {
    action: "insert",
    serverUserAgent: "Edge-UA/2.0",
    now: NOW,
  });
  assert(valid.ok);
  assertEquals(valid.value, {
    status: "active",
    last_seen_at: "2026-08-11T12:00:00.000Z",
    current_page_index: 1,
    pages_visited: 2,
    total_pages: 2,
    source_url: "https://forms.example/f/form",
    referrer: null,
    user_agent: "Edge-UA/2.0",
    query_params: { utm_source: "meta" },
  });

  assert(!sanitizePublicSessionTelemetry(
    { current_page_index: 2 },
    form,
    { action: "update" },
  ).ok);
  assert(!sanitizePublicSessionTelemetry(
    { referrer: "x".repeat(4_097) },
    form,
    { action: "update" },
  ).ok);
});

Deno.test("page event telemetry binds page identity/title to persisted form data", () => {
  const form = {
    pages: [{ id: "first", title: "Título oficial" }, { id: "second", title: "Fim" }],
  };
  const valid = sanitizePublicPageEventTelemetry({
    event_type: "page_view",
    page_id: "first",
    page_index: 0,
    page_title: "Título forjado",
    time_on_page_ms: 1_500,
    hesitation_ms: 250,
    interaction_count: 3,
    answer_char_count: 20,
  }, form);
  assert(valid.ok);
  assertEquals(valid.value, {
    event_type: "page_view",
    page_id: "first",
    page_index: 0,
    page_title: "Título oficial",
    time_on_page_ms: 1_500,
    hesitation_ms: 250,
    interaction_count: 3,
    answer_char_count: 20,
  });

  assert(!sanitizePublicPageEventTelemetry({
    event_type: "page_view",
    page_id: "first",
    page_index: 1,
  }, form).ok);
  assert(!sanitizePublicPageEventTelemetry({ event_type: "form_complete" }, form).ok);
  assert(sanitizePublicPageEventTelemetry(
    { event_type: "form_complete" },
    form,
    true,
  ).ok);

  const start = sanitizePublicPageEventTelemetry({
    event_type: "form_start",
    page_title: "forged",
    interaction_count: 999,
  }, form);
  assert(start.ok);
  assertEquals(start.value, { event_type: "form_start" });
});
