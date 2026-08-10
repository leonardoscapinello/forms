import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signIn: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('@/integrations/lovable/index', () => ({
  lovable: { auth: { signInWithOAuth: vi.fn() } },
}));

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
});

describe('Login setup detection', () => {
  it('fails closed to normal login when setup status is unavailable', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('Not found') });

    render(<Login />);

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Configuração inicial' })).not.toBeInTheDocument();
  });

  it('shows setup only when the function explicitly requires it', async () => {
    invokeMock.mockResolvedValue({ data: { setupRequired: true }, error: null });

    render(<Login />);

    expect(await screen.findByRole('heading', { name: 'Configuração inicial' })).toBeInTheDocument();
    expect(screen.getByLabelText('Token de configuração')).toBeRequired();
  });
});
