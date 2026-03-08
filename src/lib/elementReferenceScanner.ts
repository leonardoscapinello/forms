/**
 * Scans the entire form for references to a given element ID.
 * Used when moving elements between pages to detect impacted workflows,
 * conditions, variables, and other dependencies.
 */
import type { FormData, FormVariable, ConditionRule, ConditionGroup, VariableOperation } from '@/types/form';

export interface ElementReference {
  /** Where the reference lives */
  type:
    | 'condition_rule'
    | 'variable_source'
    | 'variable_assignment'
    | 'variable_op_field'
    | 'webhook_body_param'
    | 'analytics_user_data'
    | 'ai_input'
    | 'pixel_user_data';
  /** Human-readable description */
  label: string;
  /** The node or entity ID containing this reference */
  nodeId?: string;
  /** Whether this reference can be auto-fixed (e.g. sourcePageId update) */
  autoFixable: boolean;
}

/** Recursively scan a condition group for rules referencing the element */
function scanConditionGroup(group: ConditionGroup, elementId: string): string[] {
  const hits: string[] = [];
  for (const rule of group.rules) {
    if (rule.questionId === elementId) {
      hits.push(rule.id);
    }
  }
  for (const sub of group.groups) {
    hits.push(...scanConditionGroup(sub, elementId));
  }
  return hits;
}

/** Check if a string contains a {{variable}} whose source is the element */
function referencesElementViaInterpolation(text: string | undefined, elementId: string, variables: FormVariable[]): boolean {
  if (!text) return false;
  const varNames = variables.filter(v => v.sourceElementId === elementId).map(v => v.name);
  return varNames.some(name => text.includes(`{{${name}}}`));
}

/**
 * Scans all form data structures for references to a given element ID.
 * Returns a list of references found with human-readable labels.
 */
export function scanElementReferences(form: FormData, elementId: string): ElementReference[] {
  const refs: ElementReference[] = [];
  const variables = form.variables || [];

  // 1. Variables with sourceElementId pointing to this element
  for (const v of variables) {
    if (v.sourceElementId === elementId || v.sourceElementId?.startsWith(`${elementId}.`)) {
      refs.push({
        type: 'variable_source',
        label: `Variável "{{${v.name}}}" usa este campo como origem`,
        nodeId: v.id,
        autoFixable: true, // can update sourcePageId
      });
    }
  }

  // 2. Condition nodes — rules referencing element as questionId
  for (const cond of form.conditions || []) {
    for (const branch of cond.branches) {
      if (branch.conditionGroup) {
        const hits = scanConditionGroup(branch.conditionGroup, elementId);
        if (hits.length > 0) {
          refs.push({
            type: 'condition_rule',
            label: `Condição "${cond.label}" → caminho "${branch.label}" compara este campo`,
            nodeId: cond.id,
            autoFixable: false,
          });
        }
      }
      // Legacy fallback
      if (branch.questionId === elementId) {
        refs.push({
          type: 'condition_rule',
          label: `Condição "${cond.label}" → caminho "${branch.label}" (legado)`,
          nodeId: cond.id,
          autoFixable: false,
        });
      }
    }
  }

  // 3. Variable operation nodes — operandFieldId
  for (const vop of form.variableOpNodes || []) {
    for (const op of vop.operations) {
      if (op.operandType === 'field' && op.operandFieldId === elementId) {
        const varName = variables.find(v => v.id === op.variableId)?.name || op.variableId;
        refs.push({
          type: 'variable_op_field',
          label: `Operação de variável "${vop.label}" lê este campo para "${varName}"`,
          nodeId: vop.id,
          autoFixable: false,
        });
      }
    }
  }

  // 4. Page variable assignments — sourceElementId
  for (const page of form.pages || []) {
    for (const assign of page.variableAssignments || []) {
      if (assign.sourceType === 'field' && assign.sourceElementId === elementId) {
        const varName = variables.find(v => v.id === assign.variableId)?.name || assign.variableId;
        refs.push({
          type: 'variable_assignment',
          label: `Página "${page.title}" atribui "${varName}" a partir deste campo`,
          nodeId: page.id,
          autoFixable: true,
        });
      }
    }
  }

  // 5. Webhook body params referencing the element via {{var}}
  for (const integ of form.integrationNodes || []) {
    const allParams = [
      ...(integ.webhookBodyParams || []),
      ...(integ.webhookHeaders || []),
      ...(integ.webhookQueryParams || []),
    ];
    for (const param of allParams) {
      if (param.value?.includes(elementId) || referencesElementViaInterpolation(param.value, elementId, variables)) {
        refs.push({
          type: 'webhook_body_param',
          label: `Webhook usa este campo em parâmetro "${param.key}"`,
          nodeId: integ.id,
          autoFixable: false,
        });
        break; // one hit per webhook is enough
      }
    }
  }

  // 6. Analytics nodes — userDataMapping
  for (const an of form.analyticsNodes || []) {
    for (const plat of an.platforms || []) {
      const mapping = plat.userDataMapping;
      if (mapping && (mapping.emailElementId === elementId || mapping.phoneElementId === elementId || mapping.nameElementId === elementId)) {
        refs.push({
          type: 'analytics_user_data',
          label: `Analytics "${plat.platform}" mapeia dados de lead a este campo`,
          nodeId: an.id,
          autoFixable: false,
        });
      }
    }
  }

  // 7. AI nodes — inputSources
  for (const ai of form.aiNodes || []) {
    if (ai.inputSources?.includes(elementId)) {
      refs.push({
        type: 'ai_input',
        label: `Nó de IA "${ai.label || 'IA'}" usa este campo como entrada`,
        nodeId: ai.id,
        autoFixable: false,
      });
    }
  }

  // 8. Pixel load events — userDataMapping
  for (const px of form.pixelLoadEvents || []) {
    const mapping = px.userDataMapping;
    if (mapping && (mapping.emailElementId === elementId || mapping.phoneElementId === elementId || mapping.nameElementId === elementId)) {
      refs.push({
        type: 'pixel_user_data',
        label: `Evento de pixel "${px.eventType}" mapeia dados de lead a este campo`,
        nodeId: px.id,
        autoFixable: false,
      });
    }
  }

  return refs;
}

/**
 * Auto-fixes references that can be updated when moving an element to a new page.
 * Currently fixes: variable sourcePageId.
 * Returns a new FormData with the fixes applied.
 */
export function autoFixReferencesOnMove(
  form: FormData,
  elementId: string,
  newPageId: string,
): Partial<FormData> {
  const patch: Partial<FormData> = {};

  // Fix variable sourcePageId
  const variables = form.variables || [];
  const updatedVars = variables.map(v => {
    if (v.sourceElementId === elementId || v.sourceElementId?.startsWith(`${elementId}.`)) {
      return { ...v, sourcePageId: newPageId };
    }
    return v;
  });
  if (JSON.stringify(updatedVars) !== JSON.stringify(variables)) {
    patch.variables = updatedVars;
  }

  return patch;
}
