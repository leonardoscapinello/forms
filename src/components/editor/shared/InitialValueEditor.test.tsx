import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackedParam } from '@/types/form';
import { createDefaultPageElement, type PageElement, type PageElementType } from '@/types/pageElements';
import ElementSettingsPanel from '../page-builder/ElementSettingsPanel';
import InitialValueEditor from './InitialValueEditor';

vi.mock('./VariableInput', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input
      aria-label="Valor inicial por variável"
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

afterEach(cleanup);

function serializeStoredValue(value: unknown) {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function EditorHarness({
  type = 'input_text',
  trackedParams = [],
}: {
  type?: PageElementType;
  trackedParams?: TrackedParam[];
}) {
  const [element, setElement] = useState<PageElement>(() => createDefaultPageElement(type));

  return (
    <>
      <InitialValueEditor
        element={element}
        trackedParams={trackedParams}
        variables={[{ id: 'lead-name', name: 'lead_name', type: 'text' }]}
        onChange={defaultValue => setElement(current => ({ ...current, defaultValue }))}
      />
      <output data-testid="stored-value">{serializeStoredValue(element.defaultValue)}</output>
    </>
  );
}

describe('InitialValueEditor', () => {
  it('salva um valor fixo sem criar um schema paralelo', () => {
    render(<EditorHarness />);

    fireEvent.change(screen.getByLabelText('Valor inicial fixo'), {
      target: { value: 'Leonardo' },
    });

    expect(screen.getByTestId('stored-value')).toHaveTextContent('"Leonardo"');
    expect(screen.getByRole('button', { name: 'Valor fixo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('salva uma referência escolhida no modo variável', () => {
    render(<EditorHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Variável' }));
    fireEvent.change(screen.getByLabelText('Valor inicial por variável'), {
      target: { value: '{{lead_name}}' },
    });

    expect(screen.getByTestId('stored-value')).toHaveTextContent('"{{lead_name}}"');
    expect(screen.getByRole('button', { name: 'Variável' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('transforma um parâmetro GET customizado no token persistido pelo runtime', () => {
    render(<EditorHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Parâmetro GET' }));
    fireEvent.change(screen.getByLabelText('Nome do parâmetro GET'), {
      target: { value: '?lead.phone=5511999999999' },
    });

    expect(screen.getByLabelText('Nome do parâmetro GET')).toHaveValue('lead.phone');
    expect(screen.getByTestId('stored-value')).toHaveTextContent('"{{param.lead.phone}}"');
    expect(screen.getByText('?lead.phone=valor')).toBeInTheDocument();
  });

  it('oferece parâmetros GET já configurados como atalhos', () => {
    render(<EditorHarness trackedParams={[
      { id: 'campaign', key: 'campaign_id', label: 'Campanha', enabled: true },
    ]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Parâmetro GET' }));
    fireEvent.click(screen.getByRole('button', { name: 'campaign_id' }));

    expect(screen.getByTestId('stored-value')).toHaveTextContent('"{{param.campaign_id}}"');
  });
});

describe('ElementSettingsPanel prefill integration', () => {
  it.each<PageElementType>([
    'input_text',
    'input_email',
    'input_phone',
    'input_height',
    'input_checkbox',
    'input_rating',
  ])('usa o mesmo editor para %s', type => {
    const element = createDefaultPageElement(type);
    const { container } = render(
      <ElementSettingsPanel element={element} onChange={vi.fn()} onClose={vi.fn()} />,
    );

    if (type === 'input_height') {
      expect(screen.queryByText('Valor padrão')).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: /Comportamento/i }));

    expect(container.querySelectorAll('[data-initial-value-editor]')).toHaveLength(1);
    expect(screen.getByText('Valor inicial (pré-preenchimento)')).toBeInTheDocument();
  });
});
