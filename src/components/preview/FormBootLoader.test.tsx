import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import FormBootLoader, { FormChunkFallback } from './FormBootLoader';

describe('FormBootLoader', () => {
  it('shows only the accessible animated brand loader', () => {
    const { container } = render(<FormBootLoader />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Carregando formulário');
    expect(status).toHaveClass('form-boot-loader');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('input, button, h1, h2, p')).not.toBeInTheDocument();
  });

  it('can cover only its preview frame without changing the loader semantics', () => {
    render(<FormBootLoader contained />);

    expect(screen.getByRole('status')).toHaveClass('form-boot-loader--contained');
  });

  it('replaces a permanently pending chunk loader with a recoverable error', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();

    try {
      render(<FormChunkFallback timeoutMs={250} onRetry={onRetry} />);

      expect(screen.getByRole('status')).toHaveTextContent('Carregando formulário');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(250); });

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o formulário');
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(onRetry).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
