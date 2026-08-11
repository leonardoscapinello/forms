import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPageElement } from '@/types/pageElements';
import InteractiveElement from './InteractiveElement';

const mocks = vi.hoisted(() => ({
  invokeEdge: vi.fn(),
}));

vi.mock('@/lib/edgeClient', () => ({ invokeEdge: mocks.invokeEdge }));

type Validator = () => Promise<boolean>;

function renderSmartEmail(value = 'lead@example.com', withPublicContext = true) {
  const element = createDefaultPageElement('input_email');
  element.label = 'Seu e-mail';
  element.smartValidation = true;
  let validator: Validator | null = null;

  render(
    <InteractiveElement
      element={element}
      value={value}
      onChange={vi.fn()}
      stepNumber={1}
      onBlockedChange={vi.fn()}
      registerValidator={(next) => {
        if (next) validator = next;
      }}
      publicValidationContext={withPublicContext ? {
        formId: '10000000-0000-4000-8000-000000000001',
        submissionToken: 'signed-token',
        responseId: '20000000-0000-4000-8000-000000000001',
      } : undefined}
    />,
  );

  return async () => {
    await waitFor(() => expect(validator).not.toBeNull());
    return validator as unknown as Validator;
  };
}

describe('InteractiveElement smart e-mail validation', () => {
  beforeEach(() => {
    mocks.invokeEdge.mockReset();
  });

  it('permite avançar somente depois de uma confirmação segura do provedor', async () => {
    mocks.invokeEdge.mockResolvedValue({
      data: { valid: true, is_safe_to_send: true },
      error: null,
    });
    const getValidator = renderSmartEmail();
    const validator = await getValidator();

    await expect(validator()).resolves.toBe(true);
    expect(mocks.invokeEdge).toHaveBeenCalledWith('verify-email', expect.objectContaining({
      email: 'lead@example.com',
      formId: '10000000-0000-4000-8000-000000000001',
      responseId: '20000000-0000-4000-8000-000000000001',
      submissionToken: 'signed-token',
    }));
    expect(await screen.findByText('E-mail verificado ✓')).toBeInTheDocument();
  });

  it('em preview valida apenas o formato e nunca consome a cota do provedor', async () => {
    const getValidator = renderSmartEmail('lead@example.com', false);
    const validator = await getValidator();

    await expect(validator()).resolves.toBe(true);
    expect(mocks.invokeEdge).not.toHaveBeenCalled();
  });

  it('bloqueia um endereço recusado pelo provedor', async () => {
    mocks.invokeEdge.mockResolvedValue({
      data: { valid: true, is_safe_to_send: false, is_disposable: true },
      error: null,
    });
    const getValidator = renderSmartEmail();
    const validator = await getValidator();
    let valid = true;

    await act(async () => {
      valid = await validator();
    });

    expect(valid).toBe(false);
    expect(await screen.findByText('E-mail descartável')).toBeInTheDocument();
  });

  it('expõe um único erro acessível e restaura o tema assim que o formato é corrigido', async () => {
    renderSmartEmail('sem-arroba');
    const input = screen.getByRole('textbox', { name: 'Seu e-mail' });

    fireEvent.blur(input);

    expect(await screen.findByText('Formato de e-mail inválido')).toBeInTheDocument();
    expect(screen.getAllByText('Formato de e-mail inválido')).toHaveLength(1);
    const field = input.closest('[data-form-field-id]') as HTMLElement;
    expect(field).toHaveClass('form-field-invalid');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining('field-error-'));
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent('Formato de e-mail inválido');

    fireEvent.change(input, { target: { value: 'lead@example.com' } });

    await waitFor(() => expect(field).not.toHaveClass('form-field-invalid'));
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Formato de e-mail inválido')).not.toBeInTheDocument();
  });

  it.each([
    { edgeResult: { data: null, error: new Error('offline') }, caseName: 'falha de rede' },
    { edgeResult: { data: { valid: true, is_safe_to_send: null }, error: null }, caseName: 'resposta inconclusiva' },
  ])('bloqueia o avanço em caso de $caseName', async ({ edgeResult }) => {
    mocks.invokeEdge.mockResolvedValue(edgeResult);
    const getValidator = renderSmartEmail();
    const validator = await getValidator();
    let valid = true;

    await act(async () => {
      valid = await validator();
    });

    expect(valid).toBe(false);
    expect(await screen.findByText('Não foi possível validar este e-mail agora. Tente novamente.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Seu e-mail' })).toHaveAttribute('aria-invalid', 'true');
  });
});
