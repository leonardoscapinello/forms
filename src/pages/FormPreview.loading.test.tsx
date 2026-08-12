import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormData } from '@/types/form';

const mocks = vi.hoisted(() => ({
  consumePrefetchedForm: vi.fn(),
  invokeEdge: vi.fn(),
  clearStoredFormResume: vi.fn(),
  clearDurablePublicSavesForForm: vi.fn(),
}));

vi.mock('@/hooks/formStoreContext', () => ({ useFormStoreSafe: () => null }));
vi.mock('@/lib/formPrefetch', () => ({ consumePrefetchedForm: mocks.consumePrefetchedForm }));
vi.mock('@/lib/edgeClient', () => ({ invokeEdge: mocks.invokeEdge }));
vi.mock('@/lib/formResume', () => ({
  clearStoredFormResume: mocks.clearStoredFormResume,
  isRejectedResumePayload: () => false,
  readStoredFormResumeIdentity: () => null,
}));
vi.mock('@/lib/publicSaveQueue', () => ({
  clearDurablePublicSavesForForm: mocks.clearDurablePublicSavesForForm,
}));
vi.mock('./FormPreviewCore', () => ({
  default: ({ form }: { form: FormData }) => (
    <div data-testid="resolved-public-form">{form.title}</div>
  ),
}));

import FormPreview from './FormPreview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function publicForm(): FormData {
  return {
    id: 'public-loading-form',
    title: 'Formulário carregado',
    status: 'published',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    questions: [],
    pages: [],
    style: { primaryColor: '#050505', backgroundColor: '#fafafa', fontFamily: 'FH Duo Display' },
    responseCount: 0,
    completionRate: 0,
  };
}

describe('FormPreview boot state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows only the brand loader while data is pending and swaps directly to the real form', async () => {
    const request = deferred<FormData>();
    mocks.consumePrefetchedForm.mockReturnValue(request.promise);

    render(
      <MemoryRouter initialEntries={['/f/public-loading-form']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const loader = screen.getByRole('status');
    expect(loader).toHaveTextContent('Carregando formulário');
    expect(loader).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('resolved-public-form')).not.toBeInTheDocument();
    expect(document.querySelector('input, button, h1, h2')).not.toBeInTheDocument();

    request.resolve(publicForm());

    expect(await screen.findByTestId('resolved-public-form')).toHaveTextContent('Formulário carregado');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(mocks.invokeEdge).not.toHaveBeenCalled();
  });
});
