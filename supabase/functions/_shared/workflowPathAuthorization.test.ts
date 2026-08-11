import {
  deterministicWorkflowFraction,
  evaluateAuthorizedWorkflowPath,
  isAuthorizedWorkflowLoadEvent,
} from "./workflowPathAuthorization.ts";

function assert(condition: unknown, message = "assertion_failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

const responseId = "20000000-0000-4000-8000-000000000001";
const baseForm = {
  pages: [
    { id: "one", elements: [{ id: "choice", type: "input_radio", options: [
      { id: "yes", label: "Sim" },
      { id: "no", label: "Não" },
    ] }] },
    { id: "two", elements: [] },
  ],
  conditions: [{
    id: "branch",
    branches: [{
      id: "yes",
      conditionGroup: {
        id: "group",
        logic: "and",
        rules: [{ id: "rule", questionId: "choice", operator: "equals", value: "Sim" }],
        groups: [],
      },
    }],
  }],
  variableOpNodes: [{
    id: "score",
    operations: [{ id: "op", variableId: "score-var", op: "set", operand: "7" }],
  }],
  variables: [{ id: "score-var", name: "score", defaultValue: "0" }],
  integrationNodes: [{ id: "allowed", platform: "webhook" }, { id: "wrong", platform: "webhook" }],
  emailNodes: [{ id: "after" }],
  flowEdges: [
    { source: "p-one", target: "vo-score" },
    { source: "vo-score", target: "c-branch" },
    { source: "c-branch", sourceHandle: "branch-yes", target: "int-allowed" },
    { source: "c-branch", sourceHandle: "branch-default", target: "int-wrong" },
    { source: "int-allowed", target: "em-after" },
    { source: "int-wrong", target: "p-two" },
    { source: "em-after", target: "p-two" },
  ],
};

Deno.test("valid canonical branch authorizes its first side effect and applies variable operations", () => {
  const result = evaluateAuthorizedWorkflowPath({
    formData: baseForm,
    responseId,
    sourceNodeId: "p-one",
    targetNodeId: "int-allowed",
    targetKind: "side_effect",
    answers: { choice: "yes" },
  });
  assert(result.ok);
  assertEquals(result.answers.__var_score, "7");
});

Deno.test("condition branch rejects a persisted node on the branch not taken", () => {
  const result = evaluateAuthorizedWorkflowPath({
    formData: baseForm,
    responseId,
    sourceNodeId: "p-one",
    targetNodeId: "int-wrong",
    targetKind: "side_effect",
    answers: { choice: "yes" },
  });
  assert(!result.ok);
  assertEquals(result.error, "workflow_node_not_next");
});

Deno.test("cannot skip an earlier side effect even when the later node is persisted", () => {
  const result = evaluateAuthorizedWorkflowPath({
    formData: baseForm,
    responseId,
    sourceNodeId: "p-one",
    targetNodeId: "em-after",
    targetKind: "side_effect",
    answers: { choice: "yes" },
  });
  assert(!result.ok);
  assertEquals(result.error, "workflow_node_not_next");
});

Deno.test("disabled requested node and forged ids fail closed", () => {
  const disabled = evaluateAuthorizedWorkflowPath({
    formData: { ...baseForm, disabledNodes: ["int-allowed"] },
    responseId,
    sourceNodeId: "p-one",
    targetNodeId: "int-allowed",
    targetKind: "side_effect",
    answers: { choice: "yes" },
  });
  assert(!disabled.ok);
  assertEquals(disabled.error, "workflow_node_disabled");

  const forged = evaluateAuthorizedWorkflowPath({
    formData: baseForm,
    responseId,
    sourceNodeId: "p-one",
    targetNodeId: "em-forged",
    targetKind: "side_effect",
    answers: { choice: "yes" },
  });
  assert(!forged.ok);
  assertEquals(forged.error, "workflow_node_not_persisted");
});

Deno.test("a proof checkpoint can continue only after its own graph node", () => {
  const valid = evaluateAuthorizedWorkflowPath({
    formData: baseForm,
    responseId,
    sourceNodeId: "int-allowed",
    targetNodeId: "em-after",
    targetKind: "side_effect",
    answers: { choice: "yes", __var_score: "7" },
  });
  assert(valid.ok);

  const replayAtSameNode = evaluateAuthorizedWorkflowPath({
    formData: baseForm,
    responseId,
    sourceNodeId: "int-allowed",
    targetNodeId: "int-allowed",
    targetKind: "side_effect",
    answers: { choice: "yes", __var_score: "7" },
  });
  assert(!replayAtSameNode.ok);
});

Deno.test("A/B selection is stable for retries and resumes", () => {
  const first = deterministicWorkflowFraction(`${responseId}:experiment`);
  const retry = deterministicWorkflowFraction(`${responseId}:experiment`);
  const other = deterministicWorkflowFraction(`${responseId}:another`);
  assertEquals(first, retry);
  assert(first >= 0 && first < 1);
  assert(other >= 0 && other < 1);
  assert(first !== other);
});

Deno.test("load events accept only the exact enabled persisted id/platform pair", () => {
  const form = {
    pixelLoadEvents: [{ id: "load", platform: "meta_pixel" }],
    disabledNodes: [],
  };
  assert(isAuthorizedWorkflowLoadEvent(form, "load", "meta_pixel"));
  assert(!isAuthorizedWorkflowLoadEvent(form, "forged", "meta_pixel"));
  assert(!isAuthorizedWorkflowLoadEvent(form, "load", "tiktok_pixel"));
  assert(!isAuthorizedWorkflowLoadEvent(
    { ...form, disabledNodes: ["px-load"] },
    "load",
    "meta_pixel",
  ));
});
