import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const { invokeMock, resetPasswordForEmail, signInMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  signInMock: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/hooks/authContext', () => ({
  useAuth: () => ({ signIn: signInMock }),
}));

vi.mock('@/hooks/brandContext', () => ({
  useBrand: () => ({
    brand: {
      productName: 'Forms',
      ownerName: 'Leonardo Scapinello',
      description: 'Formulários',
      logoUrl: '/logo.svg',
      faviconUrl: '/favicon.svg',
    },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { resetPasswordForEmail },
    functions: { invoke: invokeMock },
  },
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invokeMock.mockResolvedValue({ data: { setupRequired: false }, error: null });
});

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  resetPasswordForEmail.mockClear();
  signInMock.mockClear();
  sessionStorage.clear();
});

describe('Login account access', () => {
  it('fails closed to normal login when setup status is unavailable', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('Not found') });

    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/verificando configuração/i)).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Configuração inicial' })).not.toBeInTheDocument();
  });

  it('shows protected setup only when the function explicitly requires it', async () => {
    invokeMock.mockResolvedValue({ data: { setupRequired: true }, error: null });

    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Configuração inicial' })).toBeInTheDocument();
    expect(screen.getByLabelText('Token de configuração')).toBeRequired();
    expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).not.toBeInTheDocument();
  });

  it('keeps the email visible, removes the password requirement and sends recovery', async () => {
    renderLogin();
    await waitFor(() => expect(screen.queryByText(/verificando configuração/i)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    expect(email).toBeVisible();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();

    fireEvent.change(email, { target: { value: 'leonardo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'leonardo@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }),
    ));
    expect(await screen.findByText(/se existir uma conta ativa/i)).toBeVisible();
  });

  it('sends the setup token and normalized account data before signing in', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { setupRequired: true }, error: null })
      .mockResolvedValueOnce({ data: { success: true }, error: null });

    renderLogin();
    expect(await screen.findByRole('heading', { name: 'Configuração inicial' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: ' Leonardo ' } });
    fireEvent.change(screen.getByLabelText('Token de configuração'), { target: { value: 'temporary-token' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'leonardo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-com-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar administrador' }));

    await waitFor(() => expect(invokeMock).toHaveBeenLastCalledWith('setup-admin', {
      headers: { 'x-setup-token': 'temporary-token' },
      body: {
        email: 'leonardo@example.com',
        password: 'senha-com-12',
        displayName: 'Leonardo',
      },
    }));
    expect(signInMock).toHaveBeenCalledWith('leonardo@example.com', 'senha-com-12');
  });

  it('does not sign in when setup returns without an explicit success acknowledgement', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { setupRequired: true }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });

    renderLogin();
    expect(await screen.findByRole('heading', { name: 'Configuração inicial' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Token de configuração'), { target: { value: 'temporary-token' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'leonardo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-com-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar administrador' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A criação do administrador não foi confirmada.');
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('recovers from a rejected login request without leaving the form loading', async () => {
    signInMock.mockRejectedValueOnce(new Error('offline'));
    renderLogin();
    await waitFor(() => expect(screen.queryByText(/verificando configuração/i)).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'leonardo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar agora');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });
});
