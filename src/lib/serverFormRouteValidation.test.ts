import { describe, expect, it } from 'vitest';
import { resolvePersistedFormRoute } from '../../supabase/functions/_shared/formRouteValidation.ts';

const conditionalForm = {
  pages: [
    {
      id: 'qualifier',
      elements: [{
        id: 'audience',
        type: 'input_radio',
        options: [
          { id: 'adult', label: 'Maior de idade' },
          { id: 'minor', label: 'Menor de idade' },
        ],
      }],
    },
    { id: 'adult', elements: [{ id: 'adult_name', type: 'input_text' }] },
    { id: 'minor', elements: [{ id: 'guardian', type: 'input_text' }] },
  ],
  conditions: [{
    id: 'route',
    branches: [{
      id: 'adult',
      conditionGroup: {
        id: 'group',
        logic: 'and',
        rules: [{
          id: 'rule',
          questionId: 'audience',
          operator: 'equals',
          value: 'Maior de idade',
        }],
        groups: [],
      },
    }],
  }],
  flowEdges: [
    { source: 'start', target: 'p-qualifier' },
    { source: 'p-qualifier', target: 'c-route' },
    { source: 'c-route', sourceHandle: 'branch-adult', target: 'p-adult' },
    { source: 'c-route', sourceHandle: 'branch-default', target: 'p-minor' },
    { source: 'p-adult', target: 'end' },
    { source: 'p-minor', target: 'end' },
  ],
};

describe('server persisted form route reconstruction', () => {
  it('resolves the selected condition branch and keeps skipped fields out', () => {
    expect(resolvePersistedFormRoute(conditionalForm, {
      audience: 'adult',
      adult_name: 'Leonardo',
    })).toEqual({
      ok: true,
      reachedPageIds: ['qualifier', 'adult'],
      reachedFieldIds: ['audience', 'adult_name'],
    });
  });

  it('follows a configured jump without inventing the intermediate page', () => {
    const result = resolvePersistedFormRoute({
      pages: [
        { id: 'one', elements: [{ id: 'one', type: 'input_text' }] },
        { id: 'skipped', elements: [{ id: 'skipped', type: 'input_text' }] },
        { id: 'three', elements: [{ id: 'three', type: 'input_text' }] },
      ],
      jumpNodes: [{ id: 'jump', destinationType: 'page', targetPageId: 'three' }],
      flowEdges: [
        { source: 'start', target: 'p-one' },
        { source: 'p-one', target: 'jp-jump' },
        { source: 'p-three', target: 'end' },
      ],
    }, { one: '1', three: '3' });

    expect(result).toMatchObject({
      ok: true,
      reachedPageIds: ['one', 'three'],
      reachedFieldIds: ['one', 'three'],
    });
  });

  it('fails closed on cycles and ambiguous ordinary edges', () => {
    const cycle = resolvePersistedFormRoute({
      pages: [{ id: 'loop', elements: [{ id: 'value', type: 'input_text' }] }],
      flowEdges: [
        { source: 'start', target: 'p-loop' },
        { source: 'p-loop', target: 'p-loop' },
      ],
    }, { value: 'ok' });
    expect(cycle).toMatchObject({ ok: false });

    const ambiguous = resolvePersistedFormRoute({
      pages: [
        { id: 'one', elements: [{ id: 'one', type: 'input_text' }] },
        { id: 'two', elements: [{ id: 'two', type: 'input_text' }] },
      ],
      flowEdges: [
        { source: 'start', target: 'p-one' },
        { source: 'start', target: 'p-two' },
      ],
    }, {});
    expect(ambiguous).toMatchObject({ ok: false, reason: 'route_edge_ambiguous:start' });
  });

  it('accepts deterministic terminal pages without requiring a synthetic end edge', () => {
    expect(resolvePersistedFormRoute({
      pages: [{ id: 'terminal', elements: [{ id: 'value', type: 'input_text' }] }],
      flowEdges: [{ source: 'start', target: 'p-terminal' }],
    }, { value: 'ok' })).toEqual({
      ok: true,
      reachedPageIds: ['terminal'],
      reachedFieldIds: ['value'],
    });

    expect(resolvePersistedFormRoute({
      pages: [{ id: 'empty-terminal', elements: [] }],
      flowEdges: [{ source: 'start', target: 'p-empty-terminal' }],
    }, {})).toEqual({
      ok: true,
      reachedPageIds: [],
      reachedFieldIds: [],
    });
  });

  it('does not let an answer from a future page steer an earlier condition', () => {
    const forgedForm = {
      ...conditionalForm,
      conditions: [{
        id: 'route',
        branches: [{
          id: 'adult',
          conditionGroup: {
            id: 'group',
            logic: 'and',
            rules: [{
              id: 'rule',
              questionId: 'adult_name',
              operator: 'equals',
              value: 'forged',
            }],
            groups: [],
          },
        }],
      }],
    };

    expect(resolvePersistedFormRoute(forgedForm, {
      audience: 'minor',
      adult_name: 'forged',
    })).toMatchObject({
      ok: false,
      reason: 'route_condition_field_not_reached:adult_name',
    });
  });

  it('replays deterministic variable operations before evaluating a branch', () => {
    const result = resolvePersistedFormRoute({
      pages: [
        { id: 'amount', elements: [{ id: 'amount', type: 'input_number' }] },
        { id: 'high', elements: [{ id: 'high', type: 'input_text' }] },
        { id: 'low', elements: [{ id: 'low', type: 'input_text' }] },
      ],
      variables: [{ id: 'total', name: 'total', type: 'number', defaultValue: '0' }],
      variableOpNodes: [{
        id: 'add',
        operations: [{
          id: 'operation',
          variableId: 'total',
          op: 'add',
          operandType: 'field',
          operandFieldId: 'amount',
        }],
      }],
      conditions: [{
        id: 'route',
        branches: [{
          id: 'high',
          conditionGroup: {
            id: 'group',
            logic: 'and',
            rules: [{
              id: 'rule',
              subjectType: 'variable',
              variableId: 'total',
              questionId: '',
              operator: 'greater_than',
              value: '5',
            }],
            groups: [],
          },
        }],
      }],
      flowEdges: [
        { source: 'start', target: 'p-amount' },
        { source: 'p-amount', target: 'vo-add' },
        { source: 'vo-add', target: 'c-route' },
        { source: 'c-route', sourceHandle: 'branch-high', target: 'p-high' },
        { source: 'c-route', sourceHandle: 'branch-default', target: 'p-low' },
        { source: 'p-high', target: 'end' },
        { source: 'p-low', target: 'end' },
      ],
    }, { amount: 7, high: 'ok' });

    expect(result).toMatchObject({
      ok: true,
      reachedPageIds: ['amount', 'high'],
    });
  });

  it('fails closed when routing depends on external output or A/B randomness', () => {
    const external = resolvePersistedFormRoute({
      pages: [
        { id: 'first', elements: [{ id: 'first', type: 'input_text' }] },
        { id: 'next', elements: [{ id: 'next', type: 'input_text' }] },
      ],
      variables: [{ id: 'external', name: 'external', type: 'text' }],
      integrationNodes: [{
        id: 'hook',
        responseMappings: [{ id: 'mapping', variableId: 'external', responsePath: 'result' }],
      }],
      conditions: [{
        id: 'route',
        branches: [{
          id: 'yes',
          conditionGroup: {
            id: 'group',
            logic: 'and',
            rules: [{
              id: 'rule',
              subjectType: 'variable',
              variableId: 'external',
              questionId: '',
              operator: 'equals',
              value: 'yes',
            }],
            groups: [],
          },
        }],
      }],
      flowEdges: [
        { source: 'start', target: 'p-first' },
        { source: 'p-first', target: 'int-hook' },
        { source: 'int-hook', target: 'c-route' },
        { source: 'c-route', sourceHandle: 'branch-yes', target: 'p-next' },
        { source: 'c-route', sourceHandle: 'branch-default', target: 'end' },
        { source: 'p-next', target: 'end' },
      ],
    }, { first: 'ok', __var_external: 'yes', next: 'forged' });
    expect(external).toMatchObject({
      ok: false,
      reason: 'route_variable_unverifiable:external',
    });

    const abTest = resolvePersistedFormRoute({
      pages: [{ id: 'page', elements: [{ id: 'value', type: 'input_text' }] }],
      abTestNodes: [{
        id: 'experiment',
        variants: [
          { id: 'a', weight: 50 },
          { id: 'b', weight: 50 },
        ],
      }],
      flowEdges: [
        { source: 'start', target: 'ab-experiment' },
        { source: 'ab-experiment', sourceHandle: 'ab-a', target: 'p-page' },
        { source: 'ab-experiment', sourceHandle: 'ab-b', target: 'end' },
        { source: 'p-page', target: 'end' },
      ],
    }, { value: 'forged' });
    expect(abTest).toMatchObject({
      ok: false,
      reason: 'route_ab_test_nondeterministic:experiment',
    });
  });
});
