import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DateFieldPreview from './DateFieldPreview';

describe('DateFieldPreview', () => {
  it('links an external validation error to the date trigger', () => {
    render(
      <>
        <DateFieldPreview
          value={undefined}
          onChange={vi.fn()}
          error="Selecione uma data permitida"
          errorId="date-error"
        />
        <p id="date-error">Selecione uma data permitida</p>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'Selecione a data' });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-describedby', 'date-error');
    expect(trigger).toHaveAttribute('data-form-primary-control');
  });

  it('guia a seleção na ordem ano, mês e dia', () => {
    render(
      <DateFieldPreview
        value="1985-05-10T12:00:00.000Z"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10/05/1985' }));

    expect(screen.getByText('Etapa 1: escolha o ano.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1985' }));

    expect(screen.getByText('Etapa 2: escolha o mês.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Maio' }));

    expect(screen.getByText('Etapa 3: escolha o dia.')).toBeInTheDocument();
    expect(screen.getByText('Maio de 1985')).toBeInTheDocument();
  });

  it('avança para o horário somente depois do dia no modo data e hora', () => {
    render(
      <DateFieldPreview
        value="2026-08-10T15:30:00.000Z"
        onChange={vi.fn()}
        dateMode="datetime"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /10\/08\/2026 às/ }));
    expect(screen.getByRole('button', { name: '4 Hora' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agosto' }));

    expect(screen.getByText('Etapa 3: escolha o dia.')).toBeInTheDocument();
  });

  it('respeita uma ordem de preenchimento personalizada', () => {
    render(
      <DateFieldPreview
        value={undefined}
        onChange={vi.fn()}
        selectionOrder={['day', 'month', 'year']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Selecione a data' }));

    expect(screen.getByRole('button', { name: '1 Dia' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2 Mês' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '3 Ano' })).toBeDisabled();
    expect(screen.getByText(/Etapa 1: escolha o dia/)).toBeInTheDocument();
  });

  it('desabilita anos fora de um limite relativo ao dia atual', () => {
    render(
      <DateFieldPreview
        value={undefined}
        onChange={vi.fn()}
        maxRule={{ mode: 'relative', amount: 18, unit: 'years', direction: 'past' }}
        initialYearRule={{ mode: 'relative', amount: 18, direction: 'past' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Selecione a data' }));

    const cutoffYear = new Date().getFullYear() - 18;
    expect(screen.getByRole('button', { name: String(cutoffYear) })).toBeEnabled();
    expect(screen.getByRole('button', { name: String(cutoffYear + 1) })).toBeDisabled();
  });
});
