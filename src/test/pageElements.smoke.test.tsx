import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ElementPreview from '@/components/editor/page-builder/ElementPreview';
import InteractiveElement from '@/components/preview/InteractiveElement';
import {
  createDefaultPageElement,
  ELEMENT_CATEGORIES,
  PAGE_ELEMENT_LABELS,
  type PageElementType,
} from '@/types/pageElements';

const ALL_ELEMENT_TYPES = Object.values(ELEMENT_CATEGORIES)
  .flatMap((category) => category.types);

const EMPTY_PUBLIC_DEFAULTS = new Set<PageElementType>([
  'image', 'video', 'before_after', 'carousel',
]);

afterEach(cleanup);

describe('page element contract', () => {
  it('keeps every declared element in exactly one toolbar category', () => {
    expect(new Set(ALL_ELEMENT_TYPES).size).toBe(ALL_ELEMENT_TYPES.length);
    expect(new Set(ALL_ELEMENT_TYPES)).toEqual(new Set(Object.keys(PAGE_ELEMENT_LABELS)));
  });

  it.each(ALL_ELEMENT_TYPES)('creates a serializable default for %s', (type) => {
    const element = createDefaultPageElement(type as PageElementType);
    expect(element.type).toBe(type);
    expect(element.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(() => JSON.stringify(element)).not.toThrow();
    if (type.startsWith('input_')) expect(element.fieldName).toBeTruthy();
  });

  it.each(ALL_ELEMENT_TYPES)('renders %s in the editor', (type) => {
    const element = createDefaultPageElement(type as PageElementType);
    const { container } = render(<ElementPreview element={element} />);
    expect(container.firstChild).not.toBeNull();
  });

  it.each(ALL_ELEMENT_TYPES)('renders %s in the public form', async (type) => {
    const element = createDefaultPageElement(type as PageElementType);
    const { container } = render(
      <InteractiveElement
        element={element}
        value={undefined}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
      />,
    );
    if (type === 'confetti') {
      await waitFor(() => expect(document.querySelector('canvas')).not.toBeNull());
    } else if (!EMPTY_PUBLIC_DEFAULTS.has(type as PageElementType)) {
      await waitFor(() => expect(container.firstChild).not.toBeNull());
    }
  });

  it('propagates values from interactive fields nested in columns', () => {
    const columns = createDefaultPageElement('columns');
    const child = createDefaultPageElement('input_text');
    child.placeholder = 'Nome no bloco de colunas';
    columns.columnData![0].elements = [child];
    const onElementChange = vi.fn();

    render(
      <InteractiveElement
        element={columns}
        value={undefined}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
        answers={{}}
        onElementChange={onElementChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Nome no bloco de colunas'), {
      target: { value: 'Leonardo' },
    });
    expect(onElementChange).toHaveBeenCalledWith(child.id, 'Leonardo');
  });

  it('gives the public email field native semantics and an accessible name', () => {
    const element = createDefaultPageElement('input_email');
    element.label = 'E-mail corporativo';

    render(
      <InteractiveElement
        element={element}
        value=""
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'E-mail corporativo' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
  });
});
