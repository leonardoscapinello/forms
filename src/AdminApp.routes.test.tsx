import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminApp from './AdminApp';

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/authContext', () => ({
  useAuth: () => ({
    user: { id: 'authenticated-recovery-user' },
    loading: false,
    role: 'admin',
    isAdmin: true,
  }),
}));

vi.mock('@/hooks/useBrand', () => ({
  BrandProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/useFormStore', () => ({
  FormStoreProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('./pages/ResetPassword', () => ({
  default: () => <div>recovery-route-ready</div>,
}));
vi.mock('./pages/editor/EditorLayout', () => ({
  default: () => <div>editor-route-ready</div>,
}));

describe('AdminApp recovery route', () => {
  afterEach(() => cleanup());

  it('renders password recovery without redirecting an authenticated recovery session', async () => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
    window.history.replaceState(null, '', '/reset-password');

    render(<AdminApp />);

    expect(await screen.findByText('recovery-route-ready')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/reset-password');
  });

  it('routes a legacy preview URL back to the authenticated editor', async () => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
    window.history.replaceState(null, '', '/preview/10000000-0000-4000-8000-000000000001');

    render(<AdminApp />);

    await waitFor(() => expect(window.location.pathname)
      .toBe('/editor/10000000-0000-4000-8000-000000000001/pages'));
    expect(window.location.search).not.toContain('editorPreview');
  });
});
