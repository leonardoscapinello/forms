import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConditionGroupEditor from './ConditionGroupEditor';

afterEach(cleanup);

describe('ConditionGroupEditor action contrast', () => {
  it('uses paired foreground colors for hover, focus and active states', () => {
    render(
      <ConditionGroupEditor
        group={{ id: 'group', logic: 'and', rules: [], groups: [] }}
        allInputElements={[]}
        onChange={vi.fn()}
      />,
    );

    for (const name of ['Condição', 'Grupo']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveClass('hover:bg-primary', 'hover:text-primary-foreground');
      expect(button).toHaveClass('focus-visible:bg-primary', 'focus-visible:text-primary-foreground');
      expect(button).toHaveClass('active:bg-primary/90', 'active:text-primary-foreground');
    }
  });
});
