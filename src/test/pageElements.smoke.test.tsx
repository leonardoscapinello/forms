import { Suspense } from 'react';
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
    const loadingTestId = `public-element-loading-${type}`;
    const { container } = render(
      <Suspense fallback={<div data-testid={loadingTestId} />}>
        <InteractiveElement
          element={element}
          value={undefined}
          onChange={vi.fn()}
          stepNumber={1}
          onBlockedChange={vi.fn()}
          registerValidator={vi.fn()}
        />
      </Suspense>,
    );
    await waitFor(() => expect(screen.queryByTestId(loadingTestId)).not.toBeInTheDocument(), { timeout: 3000 });
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

  it('sanitizes stored rich text before rendering it in the editor canvas', () => {
    const element = createDefaultPageElement('rich_text');
    element.content = '<script>alert(1)</script><img src=x onerror=alert(1)><strong>Conteúdo seguro</strong>';

    const { container } = render(<ElementPreview element={element} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong')).toHaveTextContent('Conteúdo seguro');
  });

  it.each(['star', 'heart', 'thumbsUp'] as const)(
    'uses a platform-independent SVG for the %s rating style and saves the click',
    (ratingStyle) => {
      const element = createDefaultPageElement('input_rating');
      element.ratingStyle = ratingStyle;
      element.maxRating = 5;
      const onChange = vi.fn();

      const { container } = render(
        <InteractiveElement
          element={element}
          value={0}
          onChange={onChange}
          stepNumber={1}
          onBlockedChange={vi.fn()}
          registerValidator={vi.fn()}
        />,
      );

      const option = screen.getByRole('button', { name: 'Avaliar com 3 de 5' });
      expect(option.querySelector('svg')).not.toBeNull();
      expect(container.querySelector('img.emoji')).toBeNull();
      fireEvent.click(option);
      expect(onChange).toHaveBeenCalledWith(3);
    },
  );

  it('keeps the custom rating style as a consistent emoji', async () => {
    const element = createDefaultPageElement('input_rating');
    element.ratingStyle = 'emoji';
    element.ratingEmoji = '🚀';

    const { container } = render(
      <InteractiveElement
        element={element}
        value={0}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector('img.emoji')).not.toBeNull());
  });
});
