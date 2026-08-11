import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PhoneFieldPreview, { type PhoneValue } from './PhoneFieldPreview';

function ControlledPhone({
  onChange,
  initialNumber = '(11) 98765-4321',
}: {
  onChange: (value: PhoneValue) => void;
  initialNumber?: string;
}) {
  const [value, setValue] = useState<PhoneValue>({
    countryCode: 'BR',
    ddi: '+55',
    number: initialNumber,
  });

  return (
    <PhoneFieldPreview
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('PhoneFieldPreview', () => {
  it('troca BR por US pelo menu em portal e remascara um número compatível', () => {
    const onChange = vi.fn();
    render(<ControlledPhone onChange={onChange} initialNumber="(11) 9876-5432" />);

    fireEvent.click(screen.getByRole('button', { name: 'País selecionado: Brasil, +55' }));
    const unitedStates = screen.getByRole('option', { name: '🇺🇸 Estados Unidos +1' });
    fireEvent.mouseDown(unitedStates);
    expect(screen.getByRole('listbox', { name: 'País e código de discagem' })).toBeInTheDocument();
    fireEvent.click(unitedStates);

    expect(onChange).toHaveBeenLastCalledWith({
      countryCode: 'US',
      ddi: '+1',
      number: '(119) 876-5432',
    });
    expect(screen.getByRole('button', { name: 'País selecionado: Estados Unidos, +1' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('(000) 000-0000')).toHaveValue('(119) 876-5432');
  });

  it('não converte silenciosamente um número BR com overflow em telefone US válido', () => {
    const onChange = vi.fn();
    render(<ControlledPhone onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'País selecionado: Brasil, +55' }));
    const unitedStates = screen.getByRole('option', { name: '🇺🇸 Estados Unidos +1' });

    fireEvent.mouseDown(unitedStates);
    expect(screen.getByRole('listbox', { name: 'País e código de discagem' })).toBeInTheDocument();
    fireEvent.click(unitedStates);

    expect(onChange).toHaveBeenLastCalledWith({
      countryCode: 'US',
      ddi: '+1',
      number: '',
      invalidReason: 'mask_overflow',
    });
    expect(screen.getByRole('button', { name: 'País selecionado: Estados Unidos, +1' })).toBeInTheDocument();
    const phoneInput = screen.getByPlaceholderText('(000) 000-0000');
    expect(phoneInput).toHaveValue('');

    fireEvent.change(phoneInput, { target: { value: '4155552671' } });
    expect(onChange).toHaveBeenLastCalledWith({
      countryCode: 'US',
      ddi: '+1',
      number: '(415) 555-2671',
    });
  });

  it('mantém texto legível nos estados selecionado, hover e foco por teclado', () => {
    render(<ControlledPhone onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'País selecionado: Brasil, +55' }));
    const selected = screen.getByRole('option', { name: '🇧🇷 Brasil +55' });
    const other = screen.getByRole('option', { name: '🇺🇸 Estados Unidos +1' });

    expect(selected).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(other).toHaveClass(
      'hover:bg-primary',
      'hover:text-primary-foreground',
      'focus-visible:bg-primary',
      'focus-visible:text-primary-foreground',
    );
  });
});
