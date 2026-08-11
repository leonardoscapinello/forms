import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultPageElement } from '@/types/pageElements';
import InteractiveElement from './InteractiveElement';

describe('InteractiveElement number rendering', () => {
  it('mantém o valor zero visível em vez de mostrá-lo como campo vazio', () => {
    const element = createDefaultPageElement('input_number');
    element.label = 'Quantidade';

    render(
      <InteractiveElement
        element={element}
        value={0}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Quantidade' })).toHaveValue(0);
  });
});
