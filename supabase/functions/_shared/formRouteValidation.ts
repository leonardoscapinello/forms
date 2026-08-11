import {
  type FormInterpolationVariable,
  readFormAnswerValue,
  resolveFormTemplateValue,
  stringifyFormValue,
} from "./formInterpolation.ts";
import { deterministicWorkflowFraction } from "./workflowPathAuthorization.ts";

type PlainObject = Record<string, unknown>;

export type PersistedFormRouteResult =
  | {
    ok: true;
    reachedPageIds: string[];
    reachedFieldIds: string[];
  }
  | {
    ok: false;
    reason: string;
  };

type RouteState = {
  answers: PlainObject;
  visibleFieldIds: Set<string>;
  unsafeVariableIds: Set<string>;
  reachedPageIds: string[];
  reachedFieldIds: Set<string>;
  scoredElements: PlainObject[];
  score: number;
};

type EvaluationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function isEvaluationFailure<T>(
  result: EvaluationResult<T>,
): result is { ok: false; reason: string } {
  return result.ok === false;
}

const INPUT_PREFIX = "input_";
const MAX_ROUTE_STEPS = 2_000;
const MAX_CONDITION_DEPTH = 12;
const MAX_CONDITION_ITEMS = 1_000;
const TOKEN_PATTERN = /\{\{([^{}]+)\}\}/g;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9_.:\[\]-]+$/;
const DANGEROUS_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const CONDITION_OPERATORS = new Set([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "greater_than",
  "less_than",
  "is_empty",
  "is_not_empty",
]);
const OPTION_FIELD_TYPES = new Set([
  "input_select",
  "input_radio",
  "input_quiz_icon",
  "input_quiz_image",
  "input_multi_select",
]);
const SCORE_VARIABLE_NAMES = new Set([
  "pontuacao",
  "score",
  "nota",
  "points",
  "pontos",
]);

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeRuntimeKey(value: unknown): value is string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 200 ||
    !SAFE_KEY_PATTERN.test(value)
  ) return false;
  return !value.toLowerCase().split(/[.:\[\]]+/).filter(Boolean).some((part) =>
    DANGEROUS_SEGMENTS.has(part)
  );
}

function flattenElements(elements: unknown): PlainObject[] {
  if (!Array.isArray(elements)) return [];
  const result: PlainObject[] = [];
  for (const candidate of elements) {
    if (!isPlainObject(candidate)) continue;
    result.push(candidate);
    if (candidate.type === "columns" && Array.isArray(candidate.columnData)) {
      for (const column of candidate.columnData) {
        if (isPlainObject(column)) {
          result.push(...flattenElements(column.elements));
        }
      }
    }
  }
  return result;
}

function inputElements(elements: unknown): PlainObject[] {
  return flattenElements(elements).filter((element) =>
    typeof element.id === "string" && element.id.length > 0 &&
    typeof element.type === "string" && element.type.startsWith(INPUT_PREFIX)
  );
}

function formPages(formData: PlainObject): PlainObject[] {
  return Array.isArray(formData.pages)
    ? formData.pages.filter(isPlainObject)
    : [];
}

function formVariables(formData: PlainObject): FormInterpolationVariable[] {
  return Array.isArray(formData.variables)
    ? formData.variables.filter(isPlainObject).map((variable) => ({
      id: typeof variable.id === "string" ? variable.id : undefined,
      name: typeof variable.name === "string" ? variable.name : undefined,
      type: typeof variable.type === "string" ? variable.type : undefined,
      defaultValue: variable.defaultValue,
      sourceElementId: typeof variable.sourceElementId === "string"
        ? variable.sourceElementId
        : undefined,
    }))
    : [];
}

function variableById(
  variables: FormInterpolationVariable[],
  id: unknown,
): FormInterpolationVariable | undefined {
  return typeof id === "string"
    ? variables.find((variable) => variable.id === id)
    : undefined;
}

function variableStorageKey(
  variable: FormInterpolationVariable,
): string | null {
  return typeof variable.name === "string" && variable.name.length > 0
    ? `__var_${variable.name}`
    : null;
}

function validateVariableDefinitions(
  variables: FormInterpolationVariable[],
): EvaluationResult<true> {
  if (variables.length > 250) {
    return { ok: false, reason: "route_variables_limit_exceeded" };
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const variable of variables) {
    if (
      typeof variable.id !== "string" || variable.id.length === 0 ||
      typeof variable.name !== "string" || variable.name.length === 0 ||
      variable.name.length > 256 ||
      DANGEROUS_SEGMENTS.has(variable.name.toLowerCase()) ||
      ids.has(variable.id) || names.has(variable.name)
    ) return { ok: false, reason: "route_variable_definition_invalid" };
    ids.add(variable.id);
    names.add(variable.name);
  }
  return { ok: true, value: true };
}

function templateTokens(value: unknown): EvaluationResult<string[]> {
  if (typeof value !== "string") {
    return { ok: false, reason: "route_template_not_string" };
  }
  const tokens: string[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(value)) !== null) {
    tokens.push(match[1].trim());
  }
  TOKEN_PATTERN.lastIndex = 0;
  const withoutTokens = value.replace(TOKEN_PATTERN, "");
  TOKEN_PATTERN.lastIndex = 0;
  if (withoutTokens.includes("{{") || withoutTokens.includes("}}")) {
    return { ok: false, reason: "route_template_malformed" };
  }
  return { ok: true, value: tokens };
}

function variableIsDeterministic(
  variable: FormInterpolationVariable,
  variables: FormInterpolationVariable[],
  state: RouteState,
  stack = new Set<string>(),
): EvaluationResult<true> {
  if (!variable.id || !variable.name) {
    return { ok: false, reason: "route_variable_definition_invalid" };
  }
  if (state.unsafeVariableIds.has(variable.id)) {
    return { ok: false, reason: `route_variable_unverifiable:${variable.id}` };
  }
  const storageKey = variableStorageKey(variable);
  if (storageKey && hasOwn(state.answers, storageKey)) {
    return { ok: true, value: true };
  }
  if (stack.has(variable.id)) {
    return { ok: false, reason: `route_variable_cycle:${variable.id}` };
  }
  const nextStack = new Set(stack).add(variable.id);
  if (variable.type === "response" && variable.sourceElementId) {
    const baseFieldId = variable.sourceElementId.split(".")[0];
    if (!state.visibleFieldIds.has(baseFieldId)) {
      return {
        ok: false,
        reason: `route_variable_source_not_reached:${variable.id}`,
      };
    }
  }
  if (
    typeof variable.defaultValue === "string" &&
    variable.defaultValue.includes("{{")
  ) {
    return validateTemplateDependencies(
      variable.defaultValue,
      variables,
      state,
      nextStack,
    );
  }
  return { ok: true, value: true };
}

function validateTemplateDependencies(
  value: unknown,
  variables: FormInterpolationVariable[],
  state: RouteState,
  stack = new Set<string>(),
): EvaluationResult<true> {
  const parsed = templateTokens(value);
  if (isEvaluationFailure(parsed)) return { ok: false, reason: parsed.reason };
  for (const token of parsed.value) {
    if (!token || token.startsWith("webhook:")) {
      return { ok: false, reason: "route_template_unverifiable" };
    }
    if (token.startsWith("ctx.")) {
      if (!safeRuntimeKey(token.slice(4))) {
        return { ok: false, reason: "route_context_reference_invalid" };
      }
      continue;
    }
    if (token.startsWith("param.")) {
      if (!safeRuntimeKey(token.slice(6))) {
        return { ok: false, reason: "route_param_reference_invalid" };
      }
      continue;
    }
    if (token.startsWith("field:")) {
      const fieldPath = token.slice(6);
      const baseFieldId = fieldPath.split(".")[0];
      if (
        !safeRuntimeKey(fieldPath) || !state.visibleFieldIds.has(baseFieldId)
      ) {
        return { ok: false, reason: `route_field_not_reached:${baseFieldId}` };
      }
      continue;
    }
    const variable = variables.find((candidate) =>
      candidate.name === token || candidate.id === token
    );
    if (variable) {
      const deterministic = variableIsDeterministic(
        variable,
        variables,
        state,
        stack,
      );
      if (!deterministic.ok) return deterministic;
      continue;
    }
    const baseFieldId = token.split(".")[0];
    if (
      state.visibleFieldIds.has(baseFieldId) ||
      (safeRuntimeKey(token) && hasOwn(state.answers, token) &&
        !token.startsWith("__webhook_"))
    ) continue;
    return { ok: false, reason: `route_template_reference_unknown:${token}` };
  }
  return { ok: true, value: true };
}

function optionLabel(field: PlainObject | undefined, value: unknown): string {
  const raw = stringifyFormValue(value);
  if (!field || !OPTION_FIELD_TYPES.has(String(field.type))) return raw;
  const options = Array.isArray(field.options)
    ? field.options.filter(isPlainObject)
    : [];
  if (field.type === "input_multi_select" && Array.isArray(value)) {
    return value.map((entry) => {
      const option = options.find((candidate) => candidate.id === entry);
      return option && typeof option.label === "string"
        ? option.label
        : String(entry);
    }).join(", ");
  }
  const option = options.find((candidate) => candidate.id === value);
  return option && typeof option.label === "string" ? option.label : raw;
}

function evaluateRule(
  rule: PlainObject,
  variables: FormInterpolationVariable[],
  state: RouteState,
  fieldsById: Map<string, PlainObject>,
): EvaluationResult<boolean> {
  const operator = rule.operator;
  if (typeof operator !== "string" || !CONDITION_OPERATORS.has(operator)) {
    return { ok: false, reason: "route_condition_operator_invalid" };
  }

  let rawValue: unknown;
  let field: PlainObject | undefined;
  const subjectType = typeof rule.subjectType === "string"
    ? rule.subjectType
    : "question";
  if (subjectType === "context") {
    if (!safeRuntimeKey(rule.contextKey)) {
      return { ok: false, reason: "route_condition_context_invalid" };
    }
    rawValue = state.answers[`__ctx_${rule.contextKey}`];
  } else if (subjectType === "param") {
    if (!safeRuntimeKey(rule.paramKey)) {
      return { ok: false, reason: "route_condition_param_invalid" };
    }
    rawValue = state.answers[`__param_${rule.paramKey}`];
  } else if (subjectType === "webhook_response") {
    return { ok: false, reason: "route_condition_webhook_unverifiable" };
  } else if (subjectType === "variable") {
    const variable = variableById(variables, rule.variableId);
    if (!variable) {
      return { ok: false, reason: "route_condition_variable_missing" };
    }
    const deterministic = variableIsDeterministic(variable, variables, state);
    if (!deterministic.ok) return deterministic;
    rawValue = resolveFormTemplateValue(
      `{{${variable.name}}}`,
      state.answers,
      variables,
    );
  } else if (subjectType === "question") {
    if (typeof rule.questionId !== "string" || rule.questionId.length === 0) {
      return { ok: false, reason: "route_condition_question_missing" };
    }
    if (rule.questionId !== "__score") {
      const baseFieldId = rule.questionId.split(".")[0];
      if (!state.visibleFieldIds.has(baseFieldId)) {
        return {
          ok: false,
          reason: `route_condition_field_not_reached:${baseFieldId}`,
        };
      }
      field = fieldsById.get(baseFieldId);
      if (!field) return { ok: false, reason: "route_condition_field_missing" };
    }
    rawValue = readFormAnswerValue(state.answers, rule.questionId);
  } else {
    return { ok: false, reason: "route_condition_subject_invalid" };
  }

  const raw = stringifyFormValue(rawValue);
  const label = optionLabel(field, rawValue);
  let expected = "";
  if (operator !== "is_empty" && operator !== "is_not_empty") {
    const template = validateTemplateDependencies(rule.value, variables, state);
    if (!template.ok) return template;
    expected = stringifyFormValue(
      resolveFormTemplateValue(rule.value, state.answers, variables),
    );
  } else if (rule.value !== undefined && typeof rule.value !== "string") {
    return { ok: false, reason: "route_condition_value_invalid" };
  }

  const matchAny = (predicate: (value: string) => boolean) =>
    predicate(raw) || (label !== raw && predicate(label));
  switch (operator) {
    case "equals":
      return { ok: true, value: matchAny((value) => value === expected) };
    case "not_equals":
      return { ok: true, value: raw !== expected && label !== expected };
    case "contains":
      return {
        ok: true,
        value: matchAny((value) =>
          value.toLowerCase().includes(expected.toLowerCase())
        ),
      };
    case "not_contains":
      return {
        ok: true,
        value: !raw.toLowerCase().includes(expected.toLowerCase()) &&
          !label.toLowerCase().includes(expected.toLowerCase()),
      };
    case "greater_than":
      return {
        ok: true,
        value: Number.parseFloat(raw) > Number.parseFloat(expected),
      };
    case "less_than":
      return {
        ok: true,
        value: Number.parseFloat(raw) < Number.parseFloat(expected),
      };
    case "is_empty":
      return { ok: true, value: raw === "" };
    case "is_not_empty":
      return { ok: true, value: raw !== "" };
    default:
      return { ok: false, reason: "route_condition_operator_invalid" };
  }
}

function evaluateGroup(
  group: PlainObject,
  variables: FormInterpolationVariable[],
  state: RouteState,
  fieldsById: Map<string, PlainObject>,
  budget: { items: number },
  depth = 0,
): EvaluationResult<boolean> {
  if (depth > MAX_CONDITION_DEPTH) {
    return { ok: false, reason: "route_condition_depth_exceeded" };
  }
  if (!Array.isArray(group.rules) || !Array.isArray(group.groups)) {
    return { ok: false, reason: "route_condition_group_invalid" };
  }
  const items: Array<{ result: boolean; logic: "and" | "or" }> = [];
  for (const candidate of group.rules) {
    budget.items += 1;
    if (budget.items > MAX_CONDITION_ITEMS || !isPlainObject(candidate)) {
      return { ok: false, reason: "route_condition_group_invalid" };
    }
    const evaluated = evaluateRule(candidate, variables, state, fieldsById);
    if (!evaluated.ok) return evaluated;
    const logic = candidate.logicWithPrev ?? "and";
    if (logic !== "and" && logic !== "or") {
      return { ok: false, reason: "route_condition_logic_invalid" };
    }
    items.push({ result: evaluated.value, logic });
  }
  for (const candidate of group.groups) {
    budget.items += 1;
    if (budget.items > MAX_CONDITION_ITEMS || !isPlainObject(candidate)) {
      return { ok: false, reason: "route_condition_group_invalid" };
    }
    const evaluated = evaluateGroup(
      candidate,
      variables,
      state,
      fieldsById,
      budget,
      depth + 1,
    );
    if (!evaluated.ok) return evaluated;
    const logic = candidate.logic ?? "and";
    if (logic !== "and" && logic !== "or") {
      return { ok: false, reason: "route_condition_logic_invalid" };
    }
    items.push({ result: evaluated.value, logic });
  }
  if (items.length === 0) return { ok: true, value: true };
  let combined = items[0].result;
  for (let index = 1; index < items.length; index += 1) {
    combined = items[index].logic === "and"
      ? combined && items[index].result
      : combined || items[index].result;
  }
  return { ok: true, value: combined };
}

function evaluateBranch(
  branch: PlainObject,
  variables: FormInterpolationVariable[],
  state: RouteState,
  fieldsById: Map<string, PlainObject>,
): EvaluationResult<boolean> {
  if (isPlainObject(branch.conditionGroup)) {
    return evaluateGroup(
      branch.conditionGroup,
      variables,
      state,
      fieldsById,
      { items: 0 },
    );
  }
  if (
    typeof branch.questionId === "string" && typeof branch.operator === "string"
  ) {
    return evaluateRule(
      {
        questionId: branch.questionId,
        operator: branch.operator,
        value: typeof branch.value === "string" ? branch.value : "",
      },
      variables,
      state,
      fieldsById,
    );
  }
  return { ok: false, reason: "route_condition_branch_invalid" };
}

function applyVariableOperations(
  node: PlainObject,
  variables: FormInterpolationVariable[],
  state: RouteState,
): EvaluationResult<true> {
  if (!Array.isArray(node.operations)) {
    return { ok: false, reason: "route_variable_operations_invalid" };
  }
  for (const candidate of node.operations) {
    if (!isPlainObject(candidate)) {
      return { ok: false, reason: "route_variable_operation_invalid" };
    }
    const variable = variableById(variables, candidate.variableId);
    const storageKey = variable ? variableStorageKey(variable) : null;
    if (!variable?.id || !storageKey) {
      return { ok: false, reason: "route_variable_operation_target_missing" };
    }
    const op = candidate.op;
    if (
      !["set", "add", "subtract", "multiply", "divide"].includes(String(op))
    ) {
      return { ok: false, reason: "route_variable_operation_type_invalid" };
    }

    let operand: string;
    if ((candidate.operandType ?? "literal") === "field") {
      if (typeof candidate.operandFieldId !== "string") {
        return { ok: false, reason: "route_variable_operand_field_missing" };
      }
      const baseFieldId = candidate.operandFieldId.split(".")[0];
      if (!state.visibleFieldIds.has(baseFieldId)) {
        return {
          ok: false,
          reason: `route_variable_operand_not_reached:${baseFieldId}`,
        };
      }
      const fieldValue = readFormAnswerValue(
        state.answers,
        candidate.operandFieldId,
      );
      if (
        fieldValue === undefined || fieldValue === null || fieldValue === ""
      ) continue;
      operand = stringifyFormValue(fieldValue);
    } else if ((candidate.operandType ?? "literal") === "literal") {
      const deterministic = validateTemplateDependencies(
        candidate.operand ?? "",
        variables,
        state,
      );
      if (!deterministic.ok) return deterministic;
      operand = stringifyFormValue(resolveFormTemplateValue(
        candidate.operand ?? "",
        state.answers,
        variables,
      ));
      if (op === "set" && operand === "" && (candidate.operand ?? "") === "") {
        continue;
      }
    } else {
      return { ok: false, reason: "route_variable_operand_type_invalid" };
    }

    if (op === "set") {
      state.answers[storageKey] = operand;
      state.unsafeVariableIds.delete(variable.id);
      continue;
    }
    const currentSafe = variableIsDeterministic(variable, variables, state);
    if (!currentSafe.ok) return currentSafe;
    const currentValue = resolveFormTemplateValue(
      `{{${variable.name}}}`,
      state.answers,
      variables,
    );
    const currentNumber = Number.parseFloat(stringifyFormValue(currentValue)) ||
      0;
    const operandNumber = Number.parseFloat(operand) || 0;
    if (op === "add") {
      state.answers[storageKey] = String(currentNumber + operandNumber);
    } else if (op === "subtract") {
      state.answers[storageKey] = String(currentNumber - operandNumber);
    } else if (op === "multiply") {
      state.answers[storageKey] = String(currentNumber * operandNumber);
    } else {
      state.answers[storageKey] = operandNumber !== 0
        ? String(currentNumber / operandNumber)
        : String(currentNumber);
    }
    state.unsafeVariableIds.delete(variable.id);
  }
  return { ok: true, value: true };
}

function applyPageAssignments(
  page: PlainObject,
  variables: FormInterpolationVariable[],
  state: RouteState,
): EvaluationResult<true> {
  if (page.variableAssignments === undefined) return { ok: true, value: true };
  if (!Array.isArray(page.variableAssignments)) {
    return { ok: false, reason: "route_page_assignments_invalid" };
  }
  for (const candidate of page.variableAssignments) {
    if (!isPlainObject(candidate)) {
      return { ok: false, reason: "route_page_assignment_invalid" };
    }
    const variable = variableById(variables, candidate.variableId);
    const storageKey = variable ? variableStorageKey(variable) : null;
    if (!variable?.id || !storageKey) {
      return { ok: false, reason: "route_page_assignment_target_missing" };
    }
    let value: unknown;
    if (candidate.sourceType === "field") {
      if (typeof candidate.sourceElementId !== "string") {
        return { ok: false, reason: "route_page_assignment_field_missing" };
      }
      const baseFieldId = candidate.sourceElementId.split(".")[0];
      if (!state.visibleFieldIds.has(baseFieldId)) {
        return {
          ok: false,
          reason: `route_page_assignment_field_not_reached:${baseFieldId}`,
        };
      }
      value = readFormAnswerValue(state.answers, candidate.sourceElementId);
    } else if (candidate.sourceType === "context") {
      if (!safeRuntimeKey(candidate.value)) {
        return { ok: false, reason: "route_page_assignment_context_invalid" };
      }
      value = state.answers[`__ctx_${candidate.value}`];
    } else if (candidate.sourceType === "param") {
      if (!safeRuntimeKey(candidate.value)) {
        return { ok: false, reason: "route_page_assignment_param_invalid" };
      }
      value = state.answers[`__param_${candidate.value}`];
    } else if (candidate.sourceType === "free") {
      const deterministic = validateTemplateDependencies(
        candidate.value ?? "",
        variables,
        state,
      );
      if (!deterministic.ok) return deterministic;
      value = resolveFormTemplateValue(
        candidate.value ?? "",
        state.answers,
        variables,
      );
    } else {
      return { ok: false, reason: "route_page_assignment_source_invalid" };
    }
    if (value !== undefined && value !== null) {
      state.answers[storageKey] = value;
      state.unsafeVariableIds.delete(variable.id);
    }
  }
  return { ok: true, value: true };
}

function scoreContribution(element: PlainObject, value: unknown): number {
  if (element.type === "input_yes_no") {
    const score = value === "yes"
      ? element.yesScore
      : value === "no"
      ? element.noScore
      : 0;
    return typeof score === "number" && Number.isFinite(score) ? score : 0;
  }
  const options = Array.isArray(element.options)
    ? element.options.filter(isPlainObject)
    : [];
  if (
    ["input_select", "input_radio", "input_quiz_icon", "input_quiz_image"]
      .includes(String(element.type))
  ) {
    const score = options.find((option) => option.id === value)?.score;
    return typeof score === "number" && Number.isFinite(score) ? score : 0;
  }
  if (element.type === "input_multi_select" && Array.isArray(value)) {
    return value.reduce((total, optionId) => {
      const score = options.find((option) => option.id === optionId)?.score;
      return total +
        (typeof score === "number" && Number.isFinite(score) ? score : 0);
    }, 0);
  }
  return 0;
}

function synchronizeScoreVariables(
  variables: FormInterpolationVariable[],
  state: RouteState,
): void {
  state.score = state.scoredElements.reduce(
    (total, element) =>
      total + scoreContribution(element, state.answers[String(element.id)]),
    0,
  );
  state.answers.__score = state.score;
  for (const variable of variables) {
    if (!variable.id || !variable.name) continue;
    const normalizedName = variable.name.toLowerCase();
    if (
      SCORE_VARIABLE_NAMES.has(normalizedName) ||
      normalizedName.includes("score") ||
      normalizedName.includes("pontuac")
    ) {
      state.answers[`__var_${variable.name}`] = String(state.score);
      state.unsafeVariableIds.delete(variable.id);
    }
  }
}

function hasUnverifiablePageJump(page: PlainObject): boolean {
  return flattenElements(page.elements).some((element) => {
    if (element.type === "card" && Array.isArray(element.cardItems)) {
      return element.cardItems.some((item) =>
        isPlainObject(item) && item.actionType === "go_to_page"
      );
    }
    return element.type === "button" && element.buttonAction === "specific" ||
      element.type === "loading" && element.loadingAction === "specific";
  });
}

function hasFinishAction(page: PlainObject): boolean {
  return flattenElements(page.elements).some((element) =>
    element.type === "button" && element.buttonAction === "finish" ||
    element.type === "loading" && element.loadingAction === "finish"
  );
}

function enterPage(
  page: PlainObject,
  submittedAnswers: PlainObject,
  variables: FormInterpolationVariable[],
  state: RouteState,
  includeInScore: boolean,
  applyAssignments = true,
): EvaluationResult<true> {
  const pageId = page.id;
  if (typeof pageId !== "string" || pageId.length === 0) {
    return { ok: false, reason: "route_page_id_invalid" };
  }
  if (state.reachedPageIds.includes(pageId)) {
    return { ok: false, reason: `route_page_cycle:${pageId}` };
  }
  if (hasUnverifiablePageJump(page)) {
    return { ok: false, reason: `route_page_early_navigation:${pageId}` };
  }

  if (applyAssignments) {
    const assignments = applyPageAssignments(page, variables, state);
    if (!assignments.ok) return assignments;
  }
  const elements = inputElements(page.elements);
  state.reachedPageIds.push(pageId);
  for (const element of elements) {
    const fieldId = String(element.id);
    state.visibleFieldIds.add(fieldId);
    state.reachedFieldIds.add(fieldId);
    if (hasOwn(submittedAnswers, fieldId)) {
      state.answers[fieldId] = submittedAnswers[fieldId];
    }
    if (element.variableId !== undefined && hasOwn(state.answers, fieldId)) {
      const variable = variableById(variables, element.variableId);
      const storageKey = variable ? variableStorageKey(variable) : null;
      if (!variable?.id || !storageKey) {
        return { ok: false, reason: `route_field_variable_missing:${fieldId}` };
      }
      state.answers[storageKey] = state.answers[fieldId];
      state.unsafeVariableIds.delete(variable.id);
    }
  }
  if (includeInScore) state.scoredElements.push(...elements);
  synchronizeScoreVariables(variables, state);
  return { ok: true, value: true };
}

function nodeFromCollection(
  formData: PlainObject,
  collection: string,
  id: string,
): PlainObject | undefined {
  const candidates = formData[collection];
  return Array.isArray(candidates)
    ? candidates.find((candidate) =>
      isPlainObject(candidate) && candidate.id === id
    ) as
      | PlainObject
      | undefined
    : undefined;
}

function knownNode(
  formData: PlainObject,
  pagesByNodeId: Map<string, PlainObject>,
  nodeId: string,
): boolean {
  if (nodeId === "start" || nodeId === "end") return true;
  if (pagesByNodeId.has(nodeId)) return true;
  const mappings: Array<[string, string]> = [
    ["c-", "conditions"],
    ["vo-", "variableOpNodes"],
    ["int-", "integrationNodes"],
    ["an-", "analyticsNodes"],
    ["wa-", "whatsappNodes"],
    ["em-", "emailNodes"],
    ["ab-", "abTestNodes"],
    ["wt-", "waitNodes"],
    ["jp-", "jumpNodes"],
    ["ai-", "aiNodes"],
    ["ig-", "imageGenNodes"],
  ];
  const mapping = mappings.find(([prefix]) => nodeId.startsWith(prefix));
  return !!mapping && !!nodeFromCollection(
    formData,
    mapping[1],
    nodeId.slice(mapping[0].length),
  );
}

function markExternalOutputsUnverifiable(
  node: PlainObject,
  variables: FormInterpolationVariable[],
  state: RouteState,
): EvaluationResult<true> {
  const outputIds: unknown[] = [];
  if (Array.isArray(node.responseMappings)) {
    for (const mapping of node.responseMappings) {
      if (isPlainObject(mapping)) outputIds.push(mapping.variableId);
    }
  }
  if (node.outputVariableId !== undefined) {
    outputIds.push(node.outputVariableId);
  }
  for (const outputId of outputIds) {
    const variable = variableById(variables, outputId);
    const storageKey = variable ? variableStorageKey(variable) : null;
    if (!variable?.id || !storageKey) {
      return { ok: false, reason: "route_external_output_variable_missing" };
    }
    delete state.answers[storageKey];
    state.unsafeVariableIds.add(variable.id);
  }
  return { ok: true, value: true };
}

/**
 * Reconstruct the only route a completed response can have taken. Field values
 * become visible only after their persisted page is reached, preventing a
 * forged answer for a skipped/future page from steering an earlier branch.
 * Nondeterministic or externally-derived routing fails closed.
 */
export function resolvePersistedFormRoute(
  formData: unknown,
  submittedAnswers: unknown,
  options: { responseId?: string } = {},
): PersistedFormRouteResult {
  if (!isPlainObject(formData) || !isPlainObject(submittedAnswers)) {
    return { ok: false, reason: "route_payload_invalid" };
  }
  if (
    formData.pages !== undefined &&
    (!Array.isArray(formData.pages) ||
      formData.pages.some((page) => !isPlainObject(page)))
  ) return { ok: false, reason: "route_pages_invalid" };
  if (
    formData.variables !== undefined &&
    (!Array.isArray(formData.variables) ||
      formData.variables.some((variable) => !isPlainObject(variable)))
  ) return { ok: false, reason: "route_variables_invalid" };
  for (
    const collection of [
      "conditions",
      "variableOpNodes",
      "integrationNodes",
      "analyticsNodes",
      "whatsappNodes",
      "emailNodes",
      "abTestNodes",
      "waitNodes",
      "jumpNodes",
      "aiNodes",
      "imageGenNodes",
    ]
  ) {
    const candidates = formData[collection];
    if (candidates === undefined) continue;
    if (
      !Array.isArray(candidates) ||
      candidates.some((node) => !isPlainObject(node))
    ) {
      return {
        ok: false,
        reason: `route_node_collection_invalid:${collection}`,
      };
    }
    const nodeIds = new Set<string>();
    for (const node of candidates as PlainObject[]) {
      if (
        typeof node.id !== "string" || node.id.length === 0 ||
        nodeIds.has(node.id)
      ) {
        return {
          ok: false,
          reason: `route_node_definition_invalid:${collection}`,
        };
      }
      nodeIds.add(node.id);
    }
  }
  const pages = formPages(formData);
  const variables = formVariables(formData);
  const variableDefinitions = validateVariableDefinitions(variables);
  if (isEvaluationFailure(variableDefinitions)) {
    return { ok: false, reason: variableDefinitions.reason };
  }

  const pagesByNodeId = new Map<string, PlainObject>();
  const fieldsById = new Map<string, PlainObject>();
  for (const page of pages) {
    if (
      typeof page.id !== "string" || page.id.length === 0 ||
      pagesByNodeId.has(`p-${page.id}`)
    ) {
      return { ok: false, reason: "route_page_definition_invalid" };
    }
    pagesByNodeId.set(`p-${page.id}`, page);
    for (const field of inputElements(page.elements)) {
      const fieldId = String(field.id);
      if (fieldsById.has(fieldId)) {
        return { ok: false, reason: `route_field_id_duplicate:${fieldId}` };
      }
      fieldsById.set(fieldId, field);
    }
  }

  const state: RouteState = {
    answers: Object.create(null),
    visibleFieldIds: new Set(),
    unsafeVariableIds: new Set(),
    reachedPageIds: [],
    reachedFieldIds: new Set(),
    scoredElements: [],
    score: 0,
  };
  for (const [key, value] of Object.entries(submittedAnswers)) {
    if (key.startsWith("__ctx_") || key.startsWith("__param_")) {
      state.answers[key] = value;
    }
  }
  synchronizeScoreVariables(variables, state);

  if (
    formData.showWelcomeScreen === true && isPlainObject(formData.welcomePage)
  ) {
    for (const field of inputElements(formData.welcomePage.elements)) {
      const fieldId = String(field.id);
      if (fieldsById.has(fieldId)) {
        return { ok: false, reason: `route_field_id_duplicate:${fieldId}` };
      }
      fieldsById.set(fieldId, field);
    }
    const enteredWelcome = enterPage(
      formData.welcomePage,
      submittedAnswers,
      variables,
      state,
      false,
      false,
    );
    if (isEvaluationFailure(enteredWelcome)) {
      return { ok: false, reason: enteredWelcome.reason };
    }
  }

  if (
    formData.flowEdges !== undefined &&
    (!Array.isArray(formData.flowEdges) ||
      formData.flowEdges.some((edge) => !isPlainObject(edge)))
  ) return { ok: false, reason: "route_edges_invalid" };
  const edges = Array.isArray(formData.flowEdges)
    ? formData.flowEdges as PlainObject[]
    : [];
  if (edges.length === 0) {
    const nonEmptyPages = pages.filter((page) =>
      Array.isArray(page.elements) && page.elements.length > 0
    );
    if (
      formData.showWelcomeScreen === true &&
      isPlainObject(formData.welcomePage) &&
      hasFinishAction(formData.welcomePage) && nonEmptyPages.length > 0
    ) return { ok: false, reason: "route_finish_skips_page" };
    for (let index = 0; index < nonEmptyPages.length; index += 1) {
      const page = nonEmptyPages[index];
      if (!Array.isArray(page.elements) || page.elements.length === 0) continue;
      const entered = enterPage(page, submittedAnswers, variables, state, true);
      if (isEvaluationFailure(entered)) {
        return { ok: false, reason: entered.reason };
      }
      if (hasFinishAction(page) && index < nonEmptyPages.length - 1) {
        return { ok: false, reason: `route_finish_skips_page:${page.id}` };
      }
    }
    return {
      ok: true,
      reachedPageIds: state.reachedPageIds,
      reachedFieldIds: [...state.reachedFieldIds],
    };
  }
  if (edges.length > MAX_ROUTE_STEPS) {
    return { ok: false, reason: "route_edges_limit_exceeded" };
  }
  const outgoing = new Map<string, PlainObject[]>();
  for (const edge of edges) {
    if (
      typeof edge.source !== "string" || edge.source.length === 0 ||
      typeof edge.target !== "string" || edge.target.length === 0 ||
      !knownNode(formData, pagesByNodeId, edge.source) ||
      !knownNode(formData, pagesByNodeId, edge.target)
    ) return { ok: false, reason: "route_edge_invalid" };
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  const disabledNodes = new Set(
    Array.isArray(formData.disabledNodes)
      ? formData.disabledNodes.filter((id): id is string =>
        typeof id === "string"
      )
      : [],
  );
  const traversedSources = new Set<string>();
  let currentNodeId = "start";
  let finishMustReachEnd = formData.showWelcomeScreen === true &&
    isPlainObject(formData.welcomePage) &&
    hasFinishAction(formData.welcomePage);

  for (let step = 0; step < MAX_ROUTE_STEPS; step += 1) {
    if (traversedSources.has(currentNodeId)) {
      return { ok: false, reason: `route_cycle:${currentNodeId}` };
    }
    traversedSources.add(currentNodeId);
    const outEdges = outgoing.get(currentNodeId) ?? [];

    // The runtime treats a page reached by the canvas with no outgoing edge as
    // a terminal page and submits the form. Mirror that contract here for both
    // visible and intentionally empty terminal pages; the page can only become
    // current after the deterministic graph traversal above selected it.
    if (outEdges.length === 0 && pagesByNodeId.has(currentNodeId)) {
      return {
        ok: true,
        reachedPageIds: state.reachedPageIds,
        reachedFieldIds: [...state.reachedFieldIds],
      };
    }

    let nextEdge: PlainObject | undefined;

    if (currentNodeId.startsWith("c-")) {
      const conditionId = currentNodeId.slice(2);
      const condition = nodeFromCollection(formData, "conditions", conditionId);
      if (!condition || !Array.isArray(condition.branches)) {
        return { ok: false, reason: `route_condition_missing:${conditionId}` };
      }
      const branchIds = new Set<string>();
      for (const branch of condition.branches) {
        if (
          !isPlainObject(branch) || typeof branch.id !== "string" ||
          branchIds.has(branch.id)
        ) {
          return {
            ok: false,
            reason: `route_condition_branch_invalid:${conditionId}`,
          };
        }
        branchIds.add(branch.id);
      }
      const allowedHandles = new Set([
        "branch-default",
        ...[...branchIds].map((id) => `branch-${id}`),
      ]);
      if (
        outEdges.length !== allowedHandles.size ||
        [...allowedHandles].some((handle) =>
          outEdges.filter((edge) => edge.sourceHandle === handle).length !== 1
        ) ||
        outEdges.some((edge) =>
          typeof edge.sourceHandle !== "string" ||
          !allowedHandles.has(edge.sourceHandle)
        )
      ) {
        return {
          ok: false,
          reason: `route_condition_edges_invalid:${conditionId}`,
        };
      }

      let matchedBranchId = "default";
      for (const candidate of condition.branches) {
        const branch = candidate as PlainObject;
        const evaluated = evaluateBranch(branch, variables, state, fieldsById);
        if (isEvaluationFailure(evaluated)) {
          return { ok: false, reason: evaluated.reason };
        }
        if (evaluated.value) {
          matchedBranchId = String(branch.id);
          break;
        }
      }
      const expectedHandle = `branch-${matchedBranchId}`;
      const matchingEdges = outEdges.filter((edge) =>
        edge.sourceHandle === expectedHandle
      );
      if (matchingEdges.length !== 1) {
        return {
          ok: false,
          reason:
            `route_condition_edge_ambiguous:${conditionId}:${matchedBranchId}`,
        };
      }
      nextEdge = matchingEdges[0];
    } else if (currentNodeId.startsWith("ab-")) {
      const experimentId = currentNodeId.slice(3);
      if (!options.responseId) {
        return {
          ok: false,
          reason: `route_ab_test_nondeterministic:${experimentId}`,
        };
      }
      const node = nodeFromCollection(formData, "abTestNodes", experimentId);
      const variants = node && Array.isArray(node.variants)
        ? node.variants.filter((variant) =>
          isPlainObject(variant) && typeof variant.id === "string" &&
          typeof variant.weight === "number" &&
          Number.isFinite(variant.weight) && variant.weight > 0
        ) as PlainObject[]
        : [];
      const totalWeight = variants.reduce(
        (total, variant) => total + Number(variant.weight),
        0,
      );
      if (!node || variants.length === 0 || totalWeight <= 0) {
        return { ok: false, reason: `route_ab_test_invalid:${experimentId}` };
      }
      let cursor = deterministicWorkflowFraction(
        `${options.responseId}:${experimentId}`,
      ) * totalWeight;
      let selected = variants[variants.length - 1];
      for (const variant of variants) {
        cursor -= Number(variant.weight);
        if (cursor <= 0) {
          selected = variant;
          break;
        }
      }
      const handle = `ab-${selected.id}`;
      const matchingEdges = outEdges.filter((edge) => edge.sourceHandle === handle);
      if (
        matchingEdges.length !== 1 || outEdges.length !== variants.length ||
        variants.some((variant) =>
          outEdges.filter((edge) => edge.sourceHandle === `ab-${variant.id}`).length !== 1
        )
      ) {
        return { ok: false, reason: `route_ab_edges_invalid:${experimentId}` };
      }
      nextEdge = matchingEdges[0];
    } else {
      if (outEdges.length !== 1) {
        return { ok: false, reason: `route_edge_ambiguous:${currentNodeId}` };
      }
      nextEdge = outEdges[0];
    }

    const target = String(nextEdge.target);
    if (disabledNodes.has(target) && target !== "end") {
      currentNodeId = target;
      continue;
    }
    if (target === "end") {
      return {
        ok: true,
        reachedPageIds: state.reachedPageIds,
        reachedFieldIds: [...state.reachedFieldIds],
      };
    }
    const targetPage = pagesByNodeId.get(target);
    if (targetPage) {
      if (finishMustReachEnd) {
        return {
          ok: false,
          reason: `route_finish_skips_page:${targetPage.id}`,
        };
      }
      if (state.reachedPageIds.includes(String(targetPage.id))) {
        return { ok: false, reason: `route_page_cycle:${targetPage.id}` };
      }
      if (
        !Array.isArray(targetPage.elements) || targetPage.elements.length === 0
      ) {
        currentNodeId = target;
        continue;
      }
      const entered = enterPage(
        targetPage,
        submittedAnswers,
        variables,
        state,
        true,
      );
      if (isEvaluationFailure(entered)) {
        return { ok: false, reason: entered.reason };
      }
      currentNodeId = target;
      finishMustReachEnd = hasFinishAction(targetPage);
      continue;
    }
    if (target.startsWith("vo-")) {
      const node = nodeFromCollection(
        formData,
        "variableOpNodes",
        target.slice(3),
      );
      if (!node) return { ok: false, reason: "route_variable_node_missing" };
      const applied = applyVariableOperations(node, variables, state);
      if (isEvaluationFailure(applied)) {
        return { ok: false, reason: applied.reason };
      }
      currentNodeId = target;
      continue;
    }
    if (target.startsWith("int-")) {
      const node = nodeFromCollection(
        formData,
        "integrationNodes",
        target.slice(4),
      );
      if (!node) return { ok: false, reason: "route_integration_node_missing" };
      const marked = markExternalOutputsUnverifiable(node, variables, state);
      if (isEvaluationFailure(marked)) {
        return { ok: false, reason: marked.reason };
      }
      currentNodeId = target;
      continue;
    }
    if (target.startsWith("ai-") || target.startsWith("ig-")) {
      const prefixLength = 3;
      const collection = target.startsWith("ai-") ? "aiNodes" : "imageGenNodes";
      const node = nodeFromCollection(
        formData,
        collection,
        target.slice(prefixLength),
      );
      if (!node) return { ok: false, reason: "route_external_node_missing" };
      const marked = markExternalOutputsUnverifiable(node, variables, state);
      if (isEvaluationFailure(marked)) {
        return { ok: false, reason: marked.reason };
      }
      currentNodeId = target;
      continue;
    }
    if (target.startsWith("wt-")) {
      const node = nodeFromCollection(formData, "waitNodes", target.slice(3));
      if (!node) return { ok: false, reason: "route_wait_node_missing" };
      if (
        isPlainObject(node.feedback) && node.feedback.allowSkip === true &&
        node.feedback.skipAction === "go_to_page"
      ) {
        return {
          ok: false,
          reason: `route_wait_skip_ambiguous:${target.slice(3)}`,
        };
      }
      currentNodeId = target;
      continue;
    }
    if (target.startsWith("jp-")) {
      const node = nodeFromCollection(formData, "jumpNodes", target.slice(3));
      if (!node) return { ok: false, reason: "route_jump_node_missing" };
      const destinationType = node.destinationType ??
        (typeof node.redirectUrl === "string" && node.redirectUrl
          ? "url"
          : "page");
      if (
        destinationType === "url" && typeof node.redirectUrl === "string" &&
        node.redirectUrl
      ) {
        return {
          ok: true,
          reachedPageIds: state.reachedPageIds,
          reachedFieldIds: [...state.reachedFieldIds],
        };
      }
      if (destinationType === "page" && typeof node.targetPageId === "string") {
        const jumpPage = pagesByNodeId.get(`p-${node.targetPageId}`);
        if (!jumpPage) {
          return { ok: false, reason: "route_jump_target_missing" };
        }
        if (finishMustReachEnd) {
          return {
            ok: false,
            reason: `route_finish_skips_page:${node.targetPageId}`,
          };
        }
        if (state.reachedPageIds.includes(node.targetPageId)) {
          return { ok: false, reason: `route_page_cycle:${node.targetPageId}` };
        }
        if (
          !Array.isArray(jumpPage.elements) || jumpPage.elements.length === 0
        ) {
          currentNodeId = `p-${node.targetPageId}`;
          continue;
        }
        const entered = enterPage(
          jumpPage,
          submittedAnswers,
          variables,
          state,
          true,
        );
        if (isEvaluationFailure(entered)) {
          return { ok: false, reason: entered.reason };
        }
        currentNodeId = `p-${node.targetPageId}`;
        finishMustReachEnd = hasFinishAction(jumpPage);
        continue;
      }
      return { ok: false, reason: `route_jump_invalid:${target.slice(3)}` };
    }
    if (
      target.startsWith("c-") || target.startsWith("ab-") ||
      target.startsWith("an-") || target.startsWith("wa-") ||
      target.startsWith("em-")
    ) {
      currentNodeId = target;
      continue;
    }
    return { ok: false, reason: `route_node_unsupported:${target}` };
  }
  return { ok: false, reason: "route_steps_exceeded" };
}
