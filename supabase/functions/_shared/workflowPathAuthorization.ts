import {
  interpolateFormText,
  readFormAnswerValue,
  resolveFormTemplateValue,
  stringifyFormValue,
} from "./formInterpolation.ts";
import { isWorkflowNodeDisabled } from "./workflowNodeAuthorization.ts";

const SIDE_EFFECT_PREFIXES = ["int-", "an-", "wa-", "em-", "ai-"];
const OPTION_FIELD_TYPES = new Set([
  "input_select",
  "input_radio",
  "input_quiz_icon",
  "input_quiz_image",
  "input_multi_select",
]);

export type WorkflowPathTargetKind = "side_effect" | "wait" | "page";

export type WorkflowPathEvaluation =
  | { ok: true; answers: Record<string, unknown> }
  | { ok: false; error: string };

/** Load events are outside the canvas; the signed submission token is their
 * entry checkpoint, while this allowlist binds the exact persisted event. */
export function isAuthorizedWorkflowLoadEvent(
  formData: Record<string, unknown>,
  rawNodeId: unknown,
  platform: unknown,
): boolean {
  if (typeof rawNodeId !== "string" || typeof platform !== "string") return false;
  if (isWorkflowNodeDisabled(formData, rawNodeId, ["px", "pixel"])) return false;
  return (Array.isArray(formData.pixelLoadEvents)
    ? formData.pixelLoadEvents
    : []).some((event) =>
      isRecord(event) && event.id === rawNodeId && event.platform === platform
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function allElements(formData: Record<string, unknown>): Record<string, unknown>[] {
  const flatten = (elements: unknown[]): Record<string, unknown>[] =>
    elements.flatMap((element) => {
      if (!isRecord(element)) return [];
      const nested = element.type === "columns" && Array.isArray(element.columnData)
        ? element.columnData.flatMap((column) =>
          isRecord(column) && Array.isArray(column.elements)
            ? flatten(column.elements)
            : []
        )
        : [];
      return [element, ...nested];
    });
  return (Array.isArray(formData.pages) ? formData.pages : []).flatMap((page) =>
    isRecord(page) && Array.isArray(page.elements) ? flatten(page.elements) : []
  );
}

function optionLabel(
  element: Record<string, unknown> | undefined,
  rawValue: unknown,
): string {
  if (!element || !OPTION_FIELD_TYPES.has(String(element.type || ""))) {
    return stringifyFormValue(rawValue);
  }
  const options = Array.isArray(element.options) ? element.options : [];
  if (element.type === "input_multi_select" && Array.isArray(rawValue)) {
    return rawValue.map((id) => {
      const option = options.find((candidate) =>
        isRecord(candidate) && candidate.id === id
      );
      return isRecord(option) ? stringifyFormValue(option.label) : String(id);
    }).join(", ");
  }
  const option = options.find((candidate) =>
    isRecord(candidate) && candidate.id === rawValue
  );
  return isRecord(option)
    ? stringifyFormValue(option.label)
    : stringifyFormValue(rawValue);
}

function resolveRuleSubject(
  rule: Record<string, unknown>,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>[],
  elements: Record<string, unknown>[],
): { raw: string; label: string } {
  let value: unknown;
  if (rule.subjectType === "context" && typeof rule.contextKey === "string") {
    value = readFormAnswerValue(answers, `__ctx_${rule.contextKey}`);
  } else if (
    rule.subjectType === "param" && typeof rule.paramKey === "string"
  ) {
    value = readFormAnswerValue(answers, `__param_${rule.paramKey}`);
  } else if (
    rule.subjectType === "webhook_response" &&
    typeof rule.webhookNodeId === "string" &&
    typeof rule.webhookResponsePath === "string"
  ) {
    value = resolveFormTemplateValue(
      `{{webhook:${rule.webhookNodeId}:${rule.webhookResponsePath}}}`,
      answers,
      variables,
    );
  } else if (
    rule.subjectType === "variable" && typeof rule.variableId === "string"
  ) {
    const variable = variables.find((candidate) =>
      candidate.id === rule.variableId
    );
    value = variable
      ? resolveFormTemplateValue(`{{${String(variable.name || variable.id)}}}`, answers, variables)
      : undefined;
  } else {
    const questionId = typeof rule.questionId === "string"
      ? rule.questionId
      : "";
    value = readFormAnswerValue(answers, questionId);
    const raw = stringifyFormValue(value);
    const element = elements.find((candidate) => candidate.id === questionId);
    return { raw, label: optionLabel(element, value) };
  }
  const resolved = stringifyFormValue(value);
  return { raw: resolved, label: resolved };
}

function evaluateRule(
  rule: Record<string, unknown>,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>[],
  elements: Record<string, unknown>[],
): boolean {
  const { raw, label } = resolveRuleSubject(rule, answers, variables, elements);
  const expected = interpolateFormText(rule.value ?? "", answers, variables);
  const matchesEither = (predicate: (value: string) => boolean) =>
    predicate(raw) || (label !== raw && predicate(label));

  switch (rule.operator) {
    case "equals":
      return matchesEither((value) => value === expected);
    case "not_equals":
      return raw !== expected && label !== expected;
    case "contains":
      return matchesEither((value) =>
        value.toLowerCase().includes(expected.toLowerCase())
      );
    case "not_contains":
      return !raw.toLowerCase().includes(expected.toLowerCase()) &&
        !label.toLowerCase().includes(expected.toLowerCase());
    case "greater_than":
      return Number.parseFloat(raw) > Number.parseFloat(expected);
    case "less_than":
      return Number.parseFloat(raw) < Number.parseFloat(expected);
    case "is_empty":
      return raw === "";
    case "is_not_empty":
      return raw !== "";
    default:
      return false;
  }
}

function evaluateGroup(
  group: unknown,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>[],
  elements: Record<string, unknown>[],
): boolean {
  if (!isRecord(group)) return false;
  const items: { result: boolean; logic: "and" | "or" }[] = [];
  for (const rawRule of Array.isArray(group.rules) ? group.rules : []) {
    if (!isRecord(rawRule)) continue;
    items.push({
      result: evaluateRule(rawRule, answers, variables, elements),
      logic: rawRule.logicWithPrev === "or" ? "or" : "and",
    });
  }
  for (const subgroup of Array.isArray(group.groups) ? group.groups : []) {
    if (!isRecord(subgroup)) continue;
    items.push({
      result: evaluateGroup(subgroup, answers, variables, elements),
      logic: subgroup.logic === "or" ? "or" : "and",
    });
  }
  if (items.length === 0) return true;
  return items.slice(1).reduce(
    (combined, item) =>
      item.logic === "or"
        ? combined || item.result
        : combined && item.result,
    items[0].result,
  );
}

function resolveConditionBranch(
  condition: Record<string, unknown>,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>[],
  elements: Record<string, unknown>[],
): string {
  for (const rawBranch of Array.isArray(condition.branches)
    ? condition.branches
    : []) {
    if (!isRecord(rawBranch) || typeof rawBranch.id !== "string") continue;
    const matches = rawBranch.conditionGroup
      ? evaluateGroup(rawBranch.conditionGroup, answers, variables, elements)
      : typeof rawBranch.questionId === "string" &&
          typeof rawBranch.operator === "string"
      ? evaluateRule({
        questionId: rawBranch.questionId,
        operator: rawBranch.operator,
        value: rawBranch.value ?? "",
      }, answers, variables, elements)
      : false;
    if (matches) return rawBranch.id;
  }
  return "default";
}

/** Stable A/B choice shared with the browser implementation. */
export function deterministicWorkflowFraction(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function applyVariableOperations(
  node: Record<string, unknown>,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>[],
): Record<string, unknown> {
  const updated = { ...answers };
  for (const rawOperation of Array.isArray(node.operations)
    ? node.operations
    : []) {
    if (!isRecord(rawOperation) || typeof rawOperation.variableId !== "string") {
      continue;
    }
    const variable = variables.find((candidate) =>
      candidate.id === rawOperation.variableId
    );
    if (!variable || typeof variable.name !== "string" || !variable.name) {
      continue;
    }

    let operand: string;
    if ((rawOperation.operandType ?? "literal") === "field") {
      if (typeof rawOperation.operandFieldId !== "string") continue;
      const value = readFormAnswerValue(updated, rawOperation.operandFieldId);
      if (value === undefined || value === null || value === "") continue;
      operand = stringifyFormValue(value);
    } else {
      const resolved = resolveFormTemplateValue(
        rawOperation.operand ?? "",
        updated,
        variables,
      );
      if (typeof resolved === "string" && /\{\{[^{}]+\}\}/.test(resolved)) {
        continue;
      }
      operand = stringifyFormValue(resolved);
      if (
        rawOperation.op === "set" && operand === "" &&
        (rawOperation.operand ?? "") === ""
      ) continue;
    }

    const key = `__var_${variable.name}`;
    if (rawOperation.op === "set") {
      updated[key] = operand;
      continue;
    }
    const current = Number.parseFloat(interpolateFormText(
      `{{${variable.name}}}`,
      updated,
      variables,
    )) || 0;
    const value = Number.parseFloat(operand) || 0;
    switch (rawOperation.op) {
      case "add":
        updated[key] = String(current + value);
        break;
      case "subtract":
        updated[key] = String(current - value);
        break;
      case "multiply":
        updated[key] = String(current * value);
        break;
      case "divide":
        updated[key] = value !== 0 ? String(current / value) : String(current);
        break;
    }
  }
  return updated;
}

function nodeCollectionForPrefix(prefix: string): string | null {
  return ({
    "c-": "conditions",
    "vo-": "variableOpNodes",
    "int-": "integrationNodes",
    "an-": "analyticsNodes",
    "wa-": "whatsappNodes",
    "em-": "emailNodes",
    "ab-": "abTestNodes",
    "wt-": "waitNodes",
    "jp-": "jumpNodes",
    "ai-": "aiNodes",
    "ig-": "imageGenNodes",
  } as Record<string, string>)[prefix] ?? null;
}

export function isPersistedWorkflowGraphNode(
  formData: Record<string, unknown>,
  graphNodeId: string,
): boolean {
  if (graphNodeId === "start" || graphNodeId === "end") return true;
  if (graphNodeId.startsWith("p-")) {
    return (Array.isArray(formData.pages) ? formData.pages : []).some((page) =>
      isRecord(page) && `p-${String(page.id || "")}` === graphNodeId
    );
  }
  const prefix = Object.keys({
    "c-": 1,
    "vo-": 1,
    "int-": 1,
    "an-": 1,
    "wa-": 1,
    "em-": 1,
    "ab-": 1,
    "wt-": 1,
    "jp-": 1,
    "ai-": 1,
    "ig-": 1,
  }).find((candidate) => graphNodeId.startsWith(candidate));
  if (!prefix) return false;
  const collection = nodeCollectionForPrefix(prefix);
  return !!collection && (Array.isArray(formData[collection])
    ? formData[collection]
    : []).some((node) =>
      isRecord(node) && `${prefix}${String(node.id || "")}` === graphNodeId
    );
}

function findNode(
  formData: Record<string, unknown>,
  graphNodeId: string,
): Record<string, unknown> | null {
  const prefix = ["int-", "vo-", "an-", "wa-", "em-", "ab-", "wt-", "jp-", "ai-", "ig-", "c-"]
    .find((candidate) => graphNodeId.startsWith(candidate));
  if (!prefix) return null;
  const collection = nodeCollectionForPrefix(prefix);
  if (!collection) return null;
  return ((Array.isArray(formData[collection]) ? formData[collection] : []) as unknown[])
    .find((node) => isRecord(node) && `${prefix}${String(node.id || "")}` === graphNodeId) as Record<string, unknown> | undefined ?? null;
}

function isSideEffectNode(nodeId: string): boolean {
  return SIDE_EFFECT_PREFIXES.some((prefix) => nodeId.startsWith(prefix));
}

/**
 * Replays the persisted workflow graph from a trusted checkpoint and accepts
 * only the first externally observable node (or requested wait/page checkpoint)
 * on the canonical branch. Unknown/ambiguous/cyclic graph shapes fail closed.
 */
export function evaluateAuthorizedWorkflowPath(options: {
  formData: Record<string, unknown>;
  responseId: string;
  sourceNodeId: string;
  targetNodeId: string;
  targetKind: WorkflowPathTargetKind;
  answers: Record<string, unknown>;
}): WorkflowPathEvaluation {
  const { formData, responseId, sourceNodeId, targetNodeId, targetKind } = options;
  if (
    !isPersistedWorkflowGraphNode(formData, sourceNodeId) ||
    !isPersistedWorkflowGraphNode(formData, targetNodeId)
  ) return { ok: false, error: "workflow_node_not_persisted" };
  if (
    sourceNodeId !== "start" && !sourceNodeId.startsWith("p-") &&
    isWorkflowNodeDisabled(formData, sourceNodeId)
  ) return { ok: false, error: "workflow_source_disabled" };
  if (
    targetKind === "side_effect" && !isSideEffectNode(targetNodeId) ||
    targetKind === "wait" && !targetNodeId.startsWith("wt-") ||
    targetKind === "page" && !targetNodeId.startsWith("p-")
  ) return { ok: false, error: "workflow_target_type_mismatch" };
  if (isWorkflowNodeDisabled(formData, targetNodeId)) {
    return { ok: false, error: "workflow_node_disabled" };
  }

  const edges = (Array.isArray(formData.flowEdges) ? formData.flowEdges : [])
    .filter(isRecord);
  if (edges.length === 0) return { ok: false, error: "workflow_graph_missing" };
  const variables = (Array.isArray(formData.variables) ? formData.variables : [])
    .filter(isRecord);
  const elements = allElements(formData);
  let answers = { ...options.answers };
  let current = sourceNodeId;
  const visited = new Set<string>();

  for (let step = 0; step < 200; step += 1) {
    if (visited.has(current)) return { ok: false, error: "workflow_cycle_detected" };
    visited.add(current);
    const outgoing = edges.filter((edge) => edge.source === current);
    if (outgoing.length === 0) return { ok: false, error: "workflow_node_not_reached" };

    let edge: Record<string, unknown> | undefined;
    if (current.startsWith("c-")) {
      const condition = findNode(formData, current);
      if (!condition) return { ok: false, error: "workflow_condition_missing" };
      const branch = resolveConditionBranch(condition, answers, variables, elements);
      const matches = outgoing.filter((candidate) =>
        candidate.sourceHandle === `branch-${branch}`
      );
      if (matches.length !== 1) {
        return { ok: false, error: "workflow_condition_branch_invalid" };
      }
      edge = matches[0];
    } else if (current.startsWith("ab-")) {
      const abNode = findNode(formData, current);
      const variants = (abNode && Array.isArray(abNode.variants)
        ? abNode.variants
        : []).filter((variant) =>
          isRecord(variant) && typeof variant.id === "string" &&
          Number.isFinite(variant.weight) && Number(variant.weight) > 0
        ) as Record<string, unknown>[];
      const total = variants.reduce((sum, variant) => sum + Number(variant.weight), 0);
      if (variants.length === 0 || total <= 0) {
        return { ok: false, error: "workflow_ab_test_invalid" };
      }
      let cursor = deterministicWorkflowFraction(`${responseId}:${current.slice(3)}`) * total;
      let selected = variants[variants.length - 1];
      for (const variant of variants) {
        cursor -= Number(variant.weight);
        if (cursor <= 0) {
          selected = variant;
          break;
        }
      }
      const matches = outgoing.filter((candidate) =>
        candidate.sourceHandle === `ab-${selected.id}`
      );
      if (matches.length !== 1) {
        return { ok: false, error: "workflow_ab_branch_invalid" };
      }
      edge = matches[0];
    } else {
      if (outgoing.length !== 1) {
        return { ok: false, error: "workflow_graph_ambiguous" };
      }
      edge = outgoing[0];
    }

    const target = typeof edge.target === "string" ? edge.target : "";
    if (!target || !isPersistedWorkflowGraphNode(formData, target)) {
      return { ok: false, error: "workflow_edge_target_invalid" };
    }
    if (isWorkflowNodeDisabled(formData, target)) {
      current = target;
      continue;
    }
    if (target === targetNodeId) return { ok: true, answers };
    if (isSideEffectNode(target)) {
      return { ok: false, error: "workflow_node_not_next" };
    }
    if (target.startsWith("wt-")) {
      return { ok: false, error: "workflow_wait_checkpoint_required" };
    }
    if (target.startsWith("p-") || target === "end") {
      return { ok: false, error: "workflow_node_not_reached" };
    }
    if (target.startsWith("vo-")) {
      const variableNode = findNode(formData, target);
      if (!variableNode) return { ok: false, error: "workflow_variable_node_missing" };
      answers = applyVariableOperations(variableNode, answers, variables);
    } else if (target.startsWith("ig-")) {
      const imageNode = findNode(formData, target);
      if (!imageNode) return { ok: false, error: "workflow_image_node_missing" };
      if (typeof imageNode.outputVariableId === "string") {
        const variable = variables.find((candidate) =>
          candidate.id === imageNode.outputVariableId
        );
        if (variable && typeof variable.name === "string") {
          answers[`__var_${variable.name}`] = "__imagegen_pending__";
        }
      }
    } else if (target.startsWith("jp-")) {
      return { ok: false, error: "workflow_jump_is_terminal" };
    } else if (!target.startsWith("c-") && !target.startsWith("ab-")) {
      return { ok: false, error: "workflow_node_type_unknown" };
    }
    current = target;
  }
  return { ok: false, error: "workflow_path_limit_exceeded" };
}
