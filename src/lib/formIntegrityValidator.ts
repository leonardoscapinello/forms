/**
 * Validates form integrity: ensures all element references point to elements
 * that appear BEFORE (upstream of) the node using them in the workflow graph.
 * Returns blocking issues that must be fixed before publishing.
 */
import type {
  FormData, FormVariable, ConditionNodeData, VariableOpNodeData,
  IntegrationNodeData, AnalyticsNodeData, AINodeData,
} from '@/types/form';
import { flattenPageElements } from '@/lib/pageElementTree';

export interface IntegrityIssue {
  /** The workflow node that has the broken reference */
  nodeId: string;
  /** Human-readable node label */
  nodeLabel: string;
  /** The element ID being referenced */
  elementId: string;
  /** Human-readable element label */
  elementLabel: string;
  /** The page where the element currently lives */
  elementPageId: string | null;
  /** Human-readable description of the issue */
  description: string;
  /** Category for grouping */
  category: 'condition' | 'variable_op' | 'variable_source' | 'webhook' | 'analytics' | 'ai' | 'pixel';
}

/**
 * Builds a map: nodeId → Set<pageId> of all upstream page IDs
 * using BFS on reversed edges from each node.
 */
function buildUpstreamPageMap(form: FormData): Map<string, Set<string>> {
  const edges = form.flowEdges || [];
  const allNodeIds = new Set<string>();

  // Collect all node IDs from edges
  for (const e of edges) {
    allNodeIds.add(e.source);
    allNodeIds.add(e.target);
  }

  // Also add known node IDs
  for (const p of form.pages || []) allNodeIds.add(`p-${p.id}`);
  for (const c of form.conditions || []) allNodeIds.add(`c-${c.id}`);
  for (const v of form.variableOpNodes || []) allNodeIds.add(`vo-${v.id}`);
  for (const i of form.integrationNodes || []) allNodeIds.add(`int-${i.id}`);
  for (const a of form.analyticsNodes || []) allNodeIds.add(`an-${a.id}`);
  for (const ai of form.aiNodes || []) allNodeIds.add(`ai-${ai.id}`);

  const cache = new Map<string, Set<string>>();

  function getUpstream(nodeId: string, visiting: Set<string>): Set<string> {
    if (cache.has(nodeId)) return cache.get(nodeId)!;
    if (visiting.has(nodeId)) return new Set(); // cycle guard

    visiting.add(nodeId);
    const result = new Set<string>();

    for (const edge of edges) {
      if (edge.target !== nodeId) continue;
      const src = edge.source;
      if (src.startsWith('p-')) {
        result.add(src.slice(2));
      }
      // Recursively get upstream of source
      for (const pid of getUpstream(src, visiting)) {
        result.add(pid);
      }
    }

    visiting.delete(nodeId);
    cache.set(nodeId, result);
    return result;
  }

  const map = new Map<string, Set<string>>();
  for (const nodeId of allNodeIds) {
    map.set(nodeId, getUpstream(nodeId, new Set()));
  }
  return map;
}

/**
 * Finds which page an element lives on. Returns pageId or null.
 */
function findElementPage(form: FormData, elementId: string): string | null {
  const baseId = elementId.split('.')[0];
  for (const page of form.pages || []) {
    if ((page.elements || []).some(el => el.id === baseId)) return page.id;
  }
  return null;
}

/**
 * Gets element label for display.
 */
function getElementLabel(form: FormData, elementId: string): string {
  const baseId = elementId.split('.')[0];
  for (const page of form.pages || []) {
    const el = (page.elements || []).find(e => e.id === baseId);
    if (el) return el.label || el.type.replace('input_', '').replace(/_/g, ' ');
  }
  return elementId;
}

/**
 * Validates that all referenced elements exist upstream of their referencing node.
 */
export function validateFormIntegrity(form: FormData): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const upstreamMap = buildUpstreamPageMap(form);
  const variables = form.variables || [];

  function checkElement(
    nodeId: string,
    nodeLabel: string,
    elementId: string,
    category: IntegrityIssue['category'],
    descriptionTemplate: string,
  ) {
    if (!elementId) return;
    const elementPageId = findElementPage(form, elementId);
    if (!elementPageId) return; // element doesn't exist — separate validation
    const upstream = upstreamMap.get(nodeId) || new Set();
    if (!upstream.has(elementPageId)) {
      const elementLabel = getElementLabel(form, elementId);
      issues.push({
        nodeId,
        nodeLabel,
        elementId,
        elementLabel,
        elementPageId,
        description: descriptionTemplate.replace('{element}', `"${elementLabel}"`),
        category,
      });
    }
  }

  // 1. Condition nodes — rules referencing questionId
  for (const cond of form.conditions || []) {
    const flowNodeId = `c-${cond.id}`;
    for (const branch of cond.branches) {
      const rules = branch.conditionGroup?.rules || [];
      for (const rule of rules) {
        if (rule.subjectType !== 'variable' && rule.subjectType !== 'webhook_response' && rule.questionId) {
          checkElement(
            flowNodeId,
            `Condição "${cond.label}"`,
            rule.questionId,
            'condition',
            `Campo {element} precisa estar antes desta condição no workflow`,
          );
        }
      }
      // Legacy
      if (branch.questionId) {
        checkElement(flowNodeId, `Condição "${cond.label}"`, branch.questionId, 'condition',
          `Campo {element} precisa estar antes desta condição no workflow`);
      }
    }
  }

  // 2. Variable operation nodes — operandFieldId
  for (const vop of form.variableOpNodes || []) {
    const flowNodeId = `vo-${vop.id}`;
    for (const op of vop.operations) {
      if (op.operandType === 'field' && op.operandFieldId) {
        const varName = variables.find(v => v.id === op.variableId)?.name || 'variável';
        checkElement(flowNodeId, `Operação "${vop.label}"`, op.operandFieldId, 'variable_op',
          `Campo {element} precisa estar antes desta operação de variável "${varName}"`);
      }
    }
  }

  // 3. Variables with sourceElementId — check that the page is upstream of where it's consumed
  // (Variables are typically consumed by nodes that reference them — this is a lighter check)
  // We check that the source element exists on a page that's in the flow
  for (const v of variables) {
    if (v.sourceElementId) {
      const elementPageId = findElementPage(form, v.sourceElementId);
      if (elementPageId) {
        // Check the variable is sourced from a connected page
        const hasStartNode = (form.flowEdges || []).some(e => e.source === 'start');
        if (hasStartNode) {
          const allVisited = new Set<string>();
          const queue = ['start'];
          while (queue.length) {
            const cur = queue.shift()!;
            if (allVisited.has(cur)) continue;
            allVisited.add(cur);
            for (const e of form.flowEdges || []) {
              if (e.source === cur && !allVisited.has(e.target)) queue.push(e.target);
            }
          }
          if (!allVisited.has(`p-${elementPageId}`)) {
            issues.push({
              nodeId: v.id,
              nodeLabel: `Variável "{{${v.name}}}"`,
              elementId: v.sourceElementId,
              elementLabel: getElementLabel(form, v.sourceElementId),
              elementPageId,
              description: `Campo "${getElementLabel(form, v.sourceElementId)}" está em uma página desconectada do workflow`,
              category: 'variable_source',
            });
          }
        }
      }
    }
  }

  // 4. Integration (webhook) nodes — body params referencing elements via {{var}}
  for (const integ of form.integrationNodes || []) {
    const flowNodeId = `int-${integ.id}`;
    const allParams = [
      ...(integ.webhookBodyParams || []),
      ...(integ.webhookHeaders || []),
      ...(integ.webhookQueryParams || []),
    ];
    const integLabel = integ.webhookUrl ? `Webhook "${integ.webhookUrl.slice(0, 30)}"` : `Webhook ${integ.id.slice(0, 6)}`;
    for (const param of allParams) {
      if (!param.value) continue;
      for (const page of form.pages || []) {
        for (const el of flattenPageElements(page.elements || [])) {
          if (param.value.includes(el.id)) {
            checkElement(flowNodeId, integLabel, el.id, 'webhook',
              `Campo {element} precisa estar antes deste webhook no workflow`);
          }
        }
      }
    }
  }

  // 5. Analytics nodes — userDataMapping
  for (const an of form.analyticsNodes || []) {
    const flowNodeId = `an-${an.id}`;
    for (const plat of an.platforms || []) {
      const mapping = plat.userDataMapping;
      if (!mapping) continue;
      for (const key of ['emailElementId', 'phoneElementId', 'nameElementId'] as const) {
        if (mapping[key]) {
          checkElement(flowNodeId, `Analytics "${plat.platform}"`, mapping[key]!, 'analytics',
            `Campo {element} precisa estar antes deste nó de analytics no workflow`);
        }
      }
    }
  }

  // 6. AI nodes — inputSources
  for (const ai of form.aiNodes || []) {
    const flowNodeId = `ai-${ai.id}`;
    for (const sourceId of ai.inputSources || []) {
      checkElement(flowNodeId, `IA "${ai.label || 'IA'}"`, sourceId, 'ai',
        `Campo {element} precisa estar antes deste nó de IA no workflow`);
    }
  }

  return issues;
}

/**
 * Returns true if the form has integrity issues that block publishing.
 */
export function hasBlockingIntegrityIssues(form: FormData): boolean {
  return validateFormIntegrity(form).length > 0;
}
