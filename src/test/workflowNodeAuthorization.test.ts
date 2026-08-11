import { describe, expect, it } from 'vitest';
import { isWorkflowNodeDisabled } from '../../supabase/functions/_shared/workflowNodeAuthorization';

describe('isWorkflowNodeDisabled', () => {
  it('recognizes canonical canvas ids', () => {
    const form = { disabledNodes: ['em-mail-1', 'an-event-1'] };

    expect(isWorkflowNodeDisabled(form, 'mail-1', 'em')).toBe(true);
    expect(isWorkflowNodeDisabled(form, 'event-1', 'an')).toBe(true);
    expect(isWorkflowNodeDisabled(form, 'mail-2', 'em')).toBe(false);
  });

  it('keeps compatibility with legacy raw ids', () => {
    const form = { disabledNodes: ['legacy-node'] };

    expect(isWorkflowNodeDisabled(form, 'legacy-node', 'wa')).toBe(true);
  });

  it('supports aliases used by non-canvas load events', () => {
    const form = { disabledNodes: ['pixel-load-1'] };

    expect(isWorkflowNodeDisabled(form, 'load-1', ['px', 'pixel'])).toBe(true);
  });

  it('ignores malformed configuration without disabling valid nodes', () => {
    expect(isWorkflowNodeDisabled({}, 'node-1', 'ai')).toBe(false);
    expect(isWorkflowNodeDisabled({ disabledNodes: 'ai-node-1' }, 'node-1', 'ai')).toBe(false);
    expect(isWorkflowNodeDisabled({ disabledNodes: [null, 1] }, 'node-1', 'ai')).toBe(false);
  });
});
