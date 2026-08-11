import { assertEquals } from "jsr:@std/assert@1";
import {
  interpolateFormHtml,
  interpolateFormText,
  readFormAnswerValue,
  resolveFormTemplateValue,
  resolveFormVariableValues,
} from "./formInterpolation.ts";

Deno.test("Edge interpolation resolves every supported source consistently", () => {
  const variables = [
    {
      id: "campaign-id",
      name: "campaign",
      type: "text",
      defaultValue: "{{param.utm}}",
    },
    {
      id: "city-id",
      name: "city",
      type: "response",
      sourceElementId: "address.city",
    },
  ];
  const answers = {
    address: { city: "São Paulo", street: "Paulista", number: "1000" },
    __param_utm: "meta",
    __ctx_device: "mobile",
    __webhook_hook: { items: [{ status: "approved" }] },
  };
  assertEquals(
    interpolateFormText(
      "{{campaign}}/{{campaign-id}}/{{city}}/{{field:address.city}}/{{param.utm}}/{{ctx.device}}/{{webhook:hook:items[0].status}}",
      answers,
      variables,
    ),
    "meta/meta/São Paulo/São Paulo/meta/mobile/approved",
  );
});

Deno.test("Edge interpolation preserves exact compound types and formats mixed values", () => {
  const phone = { countryCode: "BR", ddi: "+55", number: "(11) 99999-0000" };
  assertEquals(
    resolveFormTemplateValue("{{field:phone}}", { phone }, []),
    phone,
  );
  assertEquals(
    interpolateFormText("Telefone {{field:phone}}", { phone }, []),
    "Telefone +5511999990000",
  );
});

Deno.test("Edge interpolation honors overrides and terminates recursive cycles", () => {
  const variables = [
    { id: "active", name: "active", type: "boolean", defaultValue: "true" },
    { id: "a", name: "a", type: "text", defaultValue: "{{b}}" },
    { id: "b", name: "b", type: "text", defaultValue: "{{a}}" },
  ];
  assertEquals(
    interpolateFormText(
      "{{active}}/{{a}}/{{unknown}}",
      { __var_active: false },
      variables,
    ),
    "false//",
  );
});

Deno.test("Edge variable snapshots preserve types and include configured response/default values", () => {
  const variables = [
    { id: "name-var", name: "name", type: "response", sourceElementId: "name-id" },
    {
      id: "city-var",
      name: "city",
      type: "response",
      sourceElementId: "address-id.city",
    },
    { id: "default-var", name: "defaulted", type: "text", defaultValue: "fallback" },
    { id: "zero-var", name: "zero", type: "number", defaultValue: "1" },
    { id: "false-var", name: "disabled", type: "boolean", defaultValue: "true" },
    { id: "empty-var", name: "empty", type: "text", defaultValue: "fallback" },
    { id: "param-var", name: "campaign", type: "text", defaultValue: "{{param.utm}}" },
    { id: "context-var", name: "device", type: "text", defaultValue: "{{ctx.device}}" },
  ];
  assertEquals(resolveFormVariableValues(variables, {
    "name-id": "Leonardo",
    "address-id": { city: "São Paulo", state: "SP" },
    __var_zero: 0,
    __var_disabled: false,
    __var_empty: "",
    __param_utm: "meta",
    __ctx_device: "mobile",
    __var_unconfigured: "must-not-leak",
  }), {
    name: "Leonardo",
    city: "São Paulo",
    defaulted: "fallback",
    zero: 0,
    disabled: false,
    empty: "",
    campaign: "meta",
    device: "mobile",
  });
});

Deno.test("Edge interpolation blocks prototype traversal", () => {
  const answers = { address: { city: "Recife" }, __webhook_hook: {} };
  assertEquals(
    readFormAnswerValue(answers, "address.__proto__.polluted"),
    undefined,
  );
  assertEquals(
    interpolateFormText(
      "{{field:address.constructor.name}}/{{webhook:hook:__proto__.polluted}}",
      answers,
      [],
    ),
    "/",
  );
  assertEquals(({} as Record<string, unknown>).polluted, undefined);
});

Deno.test("HTML interpolation escapes runtime values and preserves configured markup", () => {
  assertEquals(
    interpolateFormHtml(
      '<p class="lead">Olá {{field:name}}, {{param.source}}</p>',
      {
        name: '<img src=x onerror="alert(1)">',
        __param_source: "<script>meta</script>",
      },
      [],
    ),
    '<p class="lead">Olá &lt;img src=x onerror=&quot;alert(1)&quot;&gt;, &lt;script&gt;meta&lt;/script&gt;</p>',
  );
});
