import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FormResponses from './FormResponses';

const invoke = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke },
    rpc,
  },
}));

const form = {
  id: 'form-1',
  title: 'Formulário de teste',
  questions: [],
  pages: [
    {
      id: 'page-contact',
      title: 'Dados pessoais',
      elements: [
        { id: 'name', type: 'input_text', label: 'Nome' },
        { id: 'email', type: 'input_email', label: 'E-mail' },
      ],
    },
    {
      id: 'page-empty',
      title: 'Sem perguntas',
      elements: [
        { id: 'heading', type: 'heading', content: 'Conteúdo visual' },
      ],
    },
    {
      id: 'page-company',
      title: 'Empresa',
      elements: [
        { id: 'role', type: 'input_text', label: 'Cargo' },
      ],
    },
  ],
  variables: [{ id: 'score', name: 'score', type: 'number' }],
  trackedParams: [{ id: 'utm_source', key: 'utm_source', label: 'Origem', enabled: true }],
  style: {
    primaryColor: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: 'sans-serif',
  },
  status: 'published',
  createdAt: '2026-08-10T12:00:00.000Z',
  updatedAt: '2026-08-10T12:00:00.000Z',
  responseCount: 1,
  completionRate: 0,
} as any;

const variableForm = {
  ...form,
  pages: form.pages.map((page: any) => page.id === 'page-contact'
    ? {
        ...page,
        elements: [
          ...page.elements,
          { id: 'address', type: 'input_address', label: 'Endereço' },
        ],
      }
    : page),
  variables: [
    { id: 'var-name', name: 'nome_resposta', type: 'response', sourceElementId: 'name' },
    { id: 'var-city', name: 'cidade_resposta', type: 'response', sourceElementId: 'address.city' },
    { id: 'var-default', name: 'padrao', type: 'text', defaultValue: 'fallback' },
    { id: 'var-param', name: 'campanha', type: 'text', defaultValue: '{{param.utm_source}}' },
    { id: 'var-context', name: 'dispositivo', type: 'text', defaultValue: '{{ctx.device}}' },
    { id: 'var-zero', name: 'zero', type: 'number', defaultValue: '10' },
    { id: 'var-false', name: 'negativo', type: 'boolean', defaultValue: 'true' },
    { id: 'var-empty', name: 'vazio', type: 'text', defaultValue: 'não usar' },
  ],
} as any;

const variableResponse = {
  id: 'row-variables',
  response_id: 'response-variables',
  answers: {
    name: 'Ana',
    email: 'ana@example.com',
    address: { city: 'São Paulo', state: 'SP' },
    role: 'Diretora',
    __param_utm_source: 'newsletter',
    __ctx_device: 'mobile',
    __var_zero: 0,
    __var_negativo: false,
    __var_vazio: '',
    __var_nao_configurada: 'não vazar',
  },
  metadata: { status: 'partial', response_hash: 'VARIABLES' },
  total_time_ms: 12_000,
  pages_visited: 2,
  created_at: '2026-08-10T12:00:00.000Z',
};

function mockVariableResponse(): void {
  invoke.mockResolvedValue({
    data: { data: [variableResponse] },
    error: null,
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('FormResponses drop-off view', () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue({
      data: {
        data: [
          {
            id: 'row-1',
            response_id: 'response-1',
            answers: {
              name: 'Ana',
              email: 'ana@example.com',
              role: 'Diretora',
              __var_score: 10,
              __param_utm_source: 'newsletter',
            },
            metadata: { status: 'partial', response_hash: 'ABC123' },
            total_time_ms: 12_000,
            pages_visited: 2,
            created_at: '2026-08-10T12:00:00.000Z',
          },
        ],
      },
      error: null,
    });
    rpc.mockReset().mockResolvedValue({
      data: [
        {
          page_id: 'page-contact',
          page_index: 0,
          page_title: 'Dados pessoais',
          reached: 8,
          dropoffs: 2,
          dropoff_percent: 25,
        },
        {
          page_id: 'page-empty',
          page_index: 1,
          page_title: 'Sem perguntas',
          reached: 7,
          dropoffs: 1,
          dropoff_percent: 14,
        },
        {
          page_id: 'page-company',
          page_index: 2,
          page_title: 'Empresa',
          reached: 6,
          dropoffs: 3,
          dropoff_percent: 50,
        },
      ],
      error: null,
    });
  });

  it('adds one merged page-group row while preserving every individual field column', async () => {
    const { container } = render(<FormResponses form={form} />);

    await screen.findByText('1 respostas');
    expect(screen.getByRole('button', { name: 'Resposta' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dropoff-analysis-row')).toHaveAttribute('data-dropoff-view', 'response');
    expect(screen.queryByTestId('page-group-header-row')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-field-column]')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Página' }));

    expect(screen.getByRole('button', { name: 'Página' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('dropoff-analysis-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-group-header-row')).toBeVisible();
    expect(container.querySelectorAll('[data-field-column]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-field-answer]')).toHaveLength(3);
    expect(container.querySelector('section')).not.toBeInTheDocument();

    const groups = Array.from(container.querySelectorAll('[data-page-group]'));
    expect(groups.map((group) => group.getAttribute('data-page-group'))).toEqual([
      'page-contact',
      'page-company',
    ]);
    expect(groups[0]).toHaveAttribute('colspan', '2');
    expect(groups[0]).toHaveAttribute('scope', 'colgroup');
    expect(groups[1]).toHaveAttribute('colspan', '1');
    expect(groups[1]).toHaveAttribute('scope', 'colgroup');
    expect(container.querySelector('[data-page-group="page-empty"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-zero-field-pages]')).toHaveTextContent(
      'Sem perguntas: sem campos de resposta',
    );

    const scrollViewport = screen.getByTestId('responses-scroll-viewport');
    expect(scrollViewport).toHaveAttribute('role', 'region');
    expect(scrollViewport).toHaveAttribute('aria-label', 'Tabela de respostas com rolagem horizontal');
    expect(scrollViewport).toHaveAttribute('tabindex', '0');
    const table = container.querySelector('table');
    expect(table?.parentElement).toHaveClass('overflow-visible');
    expect(table?.parentElement).not.toHaveClass('overflow-auto');

    const panels = Array.from(container.querySelectorAll('[data-page-dropoff-panel]'));
    expect(panels).toHaveLength(2);
    expect(panels.map((panel) => panel.getAttribute('data-page-dropoff-panel'))).toEqual([
      'page-contact',
      'page-company',
    ]);
    for (const panel of panels) {
      expect(panel.parentElement).toHaveAttribute('data-page-group', panel.getAttribute('data-page-dropoff-panel'));
      expect(panel).toHaveClass('sticky');
      expect(panel.className).toContain('left-[max(10rem,calc(50cqw-4.5rem))]');
      expect(panel.className).toContain('w-[min(18rem,calc(100cqw-11rem))]');
      expect(panel.className).toContain('max-w-[calc(100%-0.5rem)]');
    }

    const groupRow = screen.getByTestId('page-group-header-row');
    const groupedColumnCount = Array.from(groupRow.querySelectorAll('th'))
      .reduce((total, cell) => total + cell.colSpan, 0);
    const fieldHeaderRow = container.querySelector('thead tr:nth-child(2)');
    expect(groupedColumnCount).toBe(fieldHeaderRow?.querySelectorAll('th').length);

    fireEvent.click(screen.getByRole('button', { name: 'Resposta' }));
    expect(screen.getByTestId('dropoff-analysis-row')).toHaveAttribute('data-dropoff-view', 'response');
    expect(screen.queryByTestId('page-group-header-row')).not.toBeInTheDocument();
  });

  it('keeps RPC metrics in the merged headers without combining response values', async () => {
    const { container } = render(<FormResponses form={form} />);
    await screen.findByText('1 respostas');

    fireEvent.click(screen.getByRole('button', { name: 'Página' }));

    const contactGroup = container.querySelector('[data-page-group="page-contact"]');
    const companyGroup = container.querySelector('[data-page-group="page-company"]');
    expect(contactGroup).not.toBeNull();
    expect(companyGroup).not.toBeNull();
    expect(within(contactGroup as HTMLElement).getByText('25%')).toBeVisible();
    expect(contactGroup).toHaveTextContent('8 chegaram · 2 saíram');
    expect(contactGroup).toHaveTextContent('2 campos');
    expect(within(companyGroup as HTMLElement).getByText('50%')).toBeVisible();
    expect(companyGroup).toHaveTextContent('6 chegaram · 3 saíram');
    expect(companyGroup).toHaveTextContent('1 campo');

    expect(container.querySelector('[data-field-answer="name"]')).toHaveTextContent('Ana');
    expect(container.querySelector('[data-field-answer="email"]')).toHaveTextContent('ana@example.com');
    expect(container.querySelector('[data-field-answer="role"]')).toHaveTextContent('Diretora');
    expect(container.querySelector('[data-page-answer]')).not.toBeInTheDocument();
    expect(screen.getByText('10')).toBeVisible();
    expect(screen.getByText('newsletter')).toBeVisible();

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_form_page_dropoff', { p_form_id: form.id }));
  });

  it('resolve cada variável configurada sem depender de __var_* e mantém as colunas de campos', async () => {
    mockVariableResponse();
    const { container } = render(<FormResponses form={variableForm} />);
    await screen.findByText('1 respostas');

    const variableValue = (name: string) => (
      container.querySelector(`[data-variable-answer="${name}"]`)
    );
    expect(variableValue('nome_resposta')).toHaveTextContent('Ana');
    expect(variableValue('cidade_resposta')).toHaveTextContent('São Paulo');
    expect(variableValue('padrao')).toHaveTextContent('fallback');
    expect(variableValue('campanha')).toHaveTextContent('newsletter');
    expect(variableValue('dispositivo')).toHaveTextContent('mobile');
    expect(variableValue('zero')).toHaveTextContent('0');
    expect(variableValue('negativo')).toHaveTextContent('Não');
    expect(variableValue('vazio')).toHaveTextContent('—');
    expect(container.querySelector('[data-variable-answer="nao_configurada"]')).not.toBeInTheDocument();

    expect(container.querySelector('[data-field-answer="name"]')).toHaveTextContent('Ana');
    expect(container.querySelector('[data-field-answer="email"]')).toHaveTextContent('ana@example.com');
    expect(container.querySelector('[data-field-answer="address.city"]')).toHaveTextContent('São Paulo');
    expect(container.querySelector('[data-field-answer="address.state"]')).toHaveTextContent('SP');
    expect(container.querySelector('[data-field-answer="role"]')).toHaveTextContent('Diretora');
  });

  it('exporta no CSV os mesmos valores canônicos nas colunas individuais', async () => {
    mockVariableResponse();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:responses');
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<FormResponses form={variableForm} />);
    await screen.findByText('1 respostas');
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:responses');
    const csv = await readBlobAsText(createObjectURL.mock.calls[0][0] as Blob);
    const [headerLine, valueLine] = csv.replace(/^\uFEFF/, '').split('\n');
    const headers = parseCsvLine(headerLine);
    const values = parseCsvLine(valueLine);
    const csvValue = (header: string) => values[headers.indexOf(header)];

    expect(csvValue('Nome')).toBe('Ana');
    expect(csvValue('E-mail')).toBe('ana@example.com');
    expect(csvValue('Endereço — Cidade')).toBe('São Paulo');
    expect(csvValue('Endereço — Estado')).toBe('SP');
    expect(csvValue('Cargo')).toBe('Diretora');
    expect(csvValue('⚡ nome_resposta')).toBe('Ana');
    expect(csvValue('⚡ cidade_resposta')).toBe('São Paulo');
    expect(csvValue('⚡ padrao')).toBe('fallback');
    expect(csvValue('⚡ campanha')).toBe('newsletter');
    expect(csvValue('⚡ dispositivo')).toBe('mobile');
    expect(csvValue('⚡ zero')).toBe('0');
    expect(csvValue('⚡ negativo')).toBe('Não');
    expect(csvValue('⚡ vazio')).toBe('—');

    anchorClick.mockRestore();
  });
});
