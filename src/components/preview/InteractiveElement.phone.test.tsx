import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultPageElement } from '@/types/pageElements';
import InteractiveElement from './InteractiveElement';

type Validator = () => Promise<boolean>;

function renderPhone(value: unknown, required = false) {
  const element = createDefaultPageElement('input_phone');
  element.label = 'Seu telefone';
  element.required = required;
  let validator: Validator | null = null;
  const registerValidator = vi.fn((next: Validator | null) => {
    if (next) validator = next;
  });

  render(
    <InteractiveElement
      element={element}
      value={value}
      onChange={vi.fn()}
      stepNumber={1}
      onBlockedChange={vi.fn()}
      registerValidator={registerValidator}
    />,
  );

  return {
    getValidator: async () => {
      await waitFor(() => expect(validator).not.toBeNull());
      return validator as unknown as Validator;
    },
  };
}

describe('InteractiveElement phone validation', () => {
  it('permite avançar quando o telefone opcional está completamente vazio', async () => {
    const { getValidator } = renderPhone(undefined);
    const validator = await getValidator();

    await expect(validator()).resolves.toBe(true);
    expect(screen.queryByText(/dígitos do telefone/i)).not.toBeInTheDocument();
  });

  it('bloqueia avanço e exibe erro quando o telefone opcional foi iniciado mas está incompleto', async () => {
    const { getValidator } = renderPhone({
      countryCode: 'BR',
      ddi: '+55',
      number: '(11) 9876',
    });
    const validator = await getValidator();
    let valid = true;

    await act(async () => {
      valid = await validator();
    });

    expect(valid).toBe(false);
    expect(await screen.findByText('Preencha todos os 11 dígitos do telefone')).toBeInTheDocument();
    expect(screen.getAllByText('Preencha todos os 11 dígitos do telefone')).toHaveLength(1);
    const input = screen.getByPlaceholderText('(00) 00000-0000');
    const field = input.closest('[data-form-field-id]') as HTMLElement;
    expect(field).toHaveClass('form-field-invalid');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining('field-error-'));

    fireEvent.change(input, { target: { value: '11987654321' } });
    await waitFor(() => expect(field).not.toHaveClass('form-field-invalid'));
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Preencha todos os 11 dígitos do telefone')).not.toBeInTheDocument();
  });

  it('não aceita como vazio o reset causado por overflow na troca de país', async () => {
    const { getValidator } = renderPhone({
      countryCode: 'US',
      ddi: '+1',
      number: '',
      invalidReason: 'mask_overflow',
    });
    const validator = await getValidator();
    let valid = true;

    await act(async () => {
      valid = await validator();
    });

    expect(valid).toBe(false);
  });
});
