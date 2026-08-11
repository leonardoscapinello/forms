import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPageElement } from '@/types/pageElements';
import type { FormData } from '@/types/form';

const mocks = vi.hoisted(() => ({
  invokeEdge: vi.fn(),
  firePixelDual: vi.fn(),
  firePixelDualBlocking: vi.fn(),
  fireWebhookWithResponse: vi.fn(),
  persistDurablePublicSave: vi.fn(),
  flushDurablePublicSaves: vi.fn(),
  sendDurablePublicSavesKeepalive: vi.fn(),
  sendPublicSaveRequest: vi.fn(),
  clearDurablePublicSavesForForm: vi.fn(),
  requestGeolocation: vi.fn(),
}));

vi.mock('@/lib/edgeClient', () => ({ invokeEdge: mocks.invokeEdge }));
vi.mock('@/lib/firePixel', () => ({
  firePixelDual: mocks.firePixelDual,
  firePixelDualBlocking: mocks.firePixelDualBlocking,
  fireWebhookWithResponse: mocks.fireWebhookWithResponse,
}));
vi.mock('@/lib/publicSaveQueue', () => ({
  clearDurablePublicSavesForForm: mocks.clearDurablePublicSavesForForm,
  createDurablePublicSaveLane: vi.fn(() => ({
    persist: (...args: unknown[]) => mocks.persistDurablePublicSave(...args),
    whenIdle: vi.fn().mockResolvedValue(undefined),
  })),
  persistDurablePublicSave: mocks.persistDurablePublicSave,
  flushDurablePublicSaves: mocks.flushDurablePublicSaves,
  sendDurablePublicSavesKeepalive: mocks.sendDurablePublicSavesKeepalive,
  sendPublicSaveRequest: mocks.sendPublicSaveRequest,
}));
vi.mock('@/lib/sessionContext', () => ({
  captureSessionContext: () => ({ params: {}, device: 'desktop' }),
  contextToAnswers: (context: { params?: Record<string, string>; device?: string }) => ({
    __ctx_device: context.device || '',
  }),
  requestGeolocation: mocks.requestGeolocation,
}));

import FormPreviewCore from './FormPreviewCore';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function previewForm(): FormData {
  const text = createDefaultPageElement('rich_text');
  text.content = 'Valor: {{leak}}';
  const decoy = createDefaultPageElement('rich_text');
  decoy.content = 'PÁGINA_ZERO_INCORRETA';
  return {
    id: 'preview-form',
    title: 'Preview isolado',
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    questions: [],
    style: {},
    responseCount: 0,
    completionRate: 0,
    showWelcomeScreen: false,
    enableGeolocation: true,
    allowResume: true,
    savePartialResponses: true,
    pages: [
      { id: 'page-decoy', title: 'Página zero', elements: [decoy] },
      {
        id: 'page-1',
        title: 'Página correta',
        elements: [text],
        variableAssignments: [{
          id: 'initial-assignment',
          variableId: 'var-leak',
          sourceType: 'free',
          value: 'FIRST_PAGE_ASSIGNED',
        }],
      },
    ],
    variables: [{ id: 'var-leak', name: 'leak', type: 'text', defaultValue: 'CLEAN_PREVIEW' }],
    flowEdges: [
      { id: 'e-start', source: 'start', target: 'p-page-1' },
      { id: 'e-int', source: 'p-page-1', target: 'int-webhook' },
      { id: 'e-an', source: 'int-webhook', target: 'an-analytics' },
      { id: 'e-wa', source: 'an-analytics', target: 'wa-whatsapp' },
      { id: 'e-em', source: 'wa-whatsapp', target: 'em-email' },
      { id: 'e-ai', source: 'em-email', target: 'ai-process' },
      { id: 'e-end', source: 'ai-process', target: 'end' },
    ],
    integrationNodes: [{ id: 'webhook', platform: 'webhook', webhookUrl: 'https://example.com' }],
    analyticsNodes: [{
      id: 'analytics',
      platforms: [{ id: 'platform', platform: 'meta_pixel', eventType: 'Lead', enabled: true }],
    }],
    whatsappNodes: [{ id: 'whatsapp' }],
    emailNodes: [{ id: 'email' }],
    aiNodes: [{ id: 'process', objective: 'custom', prompt: 'Never call this in preview' }],
    pixelLoadEvents: [{ id: 'load', platform: 'meta_pixel', eventType: 'ViewContent' }],
    thankYouTitle: 'Preview concluído',
  } as FormData;
}

describe('FormPreviewCore preview isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', '/f/preview-form?editorPreview=1');
    localStorage.setItem('form_resume_preview-form', JSON.stringify({
      pageIndex: 0,
      answers: { __var_leak: 'REAL_DRAFT_SECRET' },
    }));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('does not read/write persistence or fire external workflow effects, including final submit', async () => {
    render(
      <MemoryRouter initialEntries={['/f/preview-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={previewForm()} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Valor: FIRST_PAGE_ASSIGNED')).toBeInTheDocument();
    expect(screen.queryByText('PÁGINA_ZERO_INCORRETA')).not.toBeInTheDocument();
    expect(screen.queryByText(/REAL_DRAFT_SECRET/)).not.toBeInTheDocument();

    // Covers the 700ms partial autosave window.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(mocks.invokeEdge).not.toHaveBeenCalled();
    expect(mocks.persistDurablePublicSave).not.toHaveBeenCalled();
    expect(mocks.flushDurablePublicSaves).not.toHaveBeenCalled();
    expect(mocks.firePixelDual).not.toHaveBeenCalled();
    expect(mocks.requestGeolocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(screen.getByText('Preview concluído')).toBeInTheDocument());
    expect(screen.getByText('Simulação concluída. Nenhuma resposta foi salva.')).toBeInTheDocument();

    expect(mocks.invokeEdge).not.toHaveBeenCalled();
    expect(mocks.persistDurablePublicSave).not.toHaveBeenCalled();
    expect(mocks.sendPublicSaveRequest).not.toHaveBeenCalled();
    expect(mocks.sendDurablePublicSavesKeepalive).not.toHaveBeenCalled();
    expect(mocks.clearDurablePublicSavesForForm).not.toHaveBeenCalled();
    expect(mocks.fireWebhookWithResponse).not.toHaveBeenCalled();
    expect(mocks.firePixelDual).not.toHaveBeenCalled();
    expect(mocks.firePixelDualBlocking).not.toHaveBeenCalled();
    expect(mocks.requestGeolocation).not.toHaveBeenCalled();

    // A real respondent's resumable draft in the same browser is untouched.
    expect(localStorage.getItem('form_resume_preview-form')).toContain('REAL_DRAFT_SECRET');
  });

  it('does not let a naked editorPreview query disable public persistence', async () => {
    window.history.pushState({}, '', '/f/query-is-not-preview?editorPreview=1');
    mocks.invokeEdge.mockResolvedValue({ data: { success: true }, error: null });
    mocks.persistDurablePublicSave.mockResolvedValue({ delivered: true, queued: true });
    const content = createDefaultPageElement('rich_text');
    content.content = 'Tráfego público';
    const form = {
      id: 'query-is-not-preview',
      title: 'Query pública',
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      submissionToken: 'signed-public-token',
      submissionResponseId: '10000000-0000-4000-8000-000000000010',
      submissionSessionId: '20000000-0000-4000-8000-000000000010',
      pages: [{ id: 'page', title: 'Página', elements: [content] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/query-is-not-preview?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview={false} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Suas respostas foram enviadas com sucesso.')).toBeInTheDocument();
    expect(screen.queryByText('Simulação concluída. Nenhuma resposta foi salva.')).not.toBeInTheDocument();
    expect(mocks.persistDurablePublicSave).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ response_id: '10000000-0000-4000-8000-000000000010' }),
      }),
      expect.any(Object),
    );
  });

  it('recalcula defaults geo tardios e envia o mesmo estado sincronizado', async () => {
    mocks.requestGeolocation.mockResolvedValue({
      latitude: '-23.55',
      longitude: '-46.63',
      geoCity: 'São Paulo',
      geoState: 'SP',
      geoCountry: 'Brasil',
      geoCountryCode: 'BR',
      geoNeighborhood: 'Centro',
      geoStreet: 'Paulista',
      geoCep: '01310-100',
      source: 'ip',
    });
    mocks.persistDurablePublicSave.mockResolvedValue({ delivered: true, queued: true });
    const content = createDefaultPageElement('rich_text');
    content.content = 'Cidade: {{cidade_geo}}';
    const form = {
      id: 'geo-form',
      title: 'Geo tardio',
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      enableGeolocation: true,
      submissionToken: 'signed-public-token',
      submissionResponseId: '10000000-0000-4000-8000-000000000020',
      submissionSessionId: '20000000-0000-4000-8000-000000000020',
      variables: [{
        id: 'geo-variable',
        name: 'cidade_geo',
        type: 'text',
        defaultValue: '{{ctx.geoCity}}',
      }],
      pages: [{ id: 'page', title: 'Página', elements: [content] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/geo-form']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview={false} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cidade:')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(await screen.findByText('Cidade: São Paulo')).toBeInTheDocument();
    expect(mocks.requestGeolocation).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(mocks.persistDurablePublicSave).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          answers: expect.objectContaining({
            __ctx_geoCity: 'São Paulo',
            __var_cidade_geo: 'São Paulo',
          }),
        }),
      }),
      expect.any(Object),
    ));
  });

  it('reloads a signed resume into the same lead identity and completes response A instead of creating B', async () => {
    window.history.pushState({}, '', '/f/resume-form');
    mocks.invokeEdge.mockResolvedValue({ data: { success: true }, error: null });
    mocks.persistDurablePublicSave.mockResolvedValue({ delivered: true, queued: true });
    const field = createDefaultPageElement('input_text');
    field.label = 'Nome retomado';
    field.placeholder = 'Digite seu nome';
    const responseId = '10000000-0000-4000-8000-0000000000a1';
    const sessionId = '20000000-0000-4000-8000-0000000000a1';
    const form = {
      id: 'resume-form',
      title: 'Retomada segura',
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      allowResume: true,
      savePartialResponses: true,
      submissionResumed: true,
      submissionToken: 'renewed.signed.resume.token',
      submissionResponseId: responseId,
      submissionSessionId: sessionId,
      submissionResumeState: {
        pageIndex: 0,
        maxPage: 0,
        answers: { [field.id]: 'Lead A' },
      },
      pages: [{ id: 'page', title: 'Página', elements: [field] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/resume-form']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview={false} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('textbox', { name: 'Nome retomado' })).toHaveValue('Lead A');
    const storedCredential = sessionStorage.getItem('form_resume_resume-form') || '';
    expect(storedCredential).toContain('renewed.signed.resume.token');
    expect(storedCredential).not.toContain('Lead A');
    expect(localStorage.getItem('form_resume_resume-form')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Suas respostas foram enviadas com sucesso.');

    expect(mocks.persistDurablePublicSave).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'renewed.signed.resume.token',
        payload: expect.objectContaining({
          response_id: responseId,
          session_id: sessionId,
          answers: expect.objectContaining({ [field.id]: 'Lead A' }),
        }),
      }),
      expect.any(Object),
    );
    await waitFor(() => expect(mocks.invokeEdge).toHaveBeenCalledWith(
      'form-public-save',
      expect.objectContaining({
        kind: 'session',
        action: 'update',
        match: { id: sessionId },
      }),
    ));
    await waitFor(() => expect(sessionStorage.getItem('form_resume_resume-form')).toBeNull());
    expect(mocks.clearDurablePublicSavesForForm).toHaveBeenCalledWith('resume-form');
  });

  it('does not let a custom finish button bypass required field validation', async () => {
    const requiredInput = createDefaultPageElement('input_text');
    requiredInput.label = 'Nome obrigatório';
    requiredInput.placeholder = 'Digite seu nome';
    requiredInput.required = true;
    const finishButton = createDefaultPageElement('button');
    finishButton.content = 'Finalizar agora';
    finishButton.buttonAction = 'finish';
    const form = {
      id: 'button-form',
      title: 'Validação',
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      pages: [{ id: 'page', title: 'Página', elements: [requiredInput, finishButton] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
      thankYouTitle: 'Enviado depois de validar',
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/button-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const button = await screen.findByRole('button', { name: 'Finalizar agora' });
    fireEvent.click(button);
    expect(await screen.findByText('Preencha este campo')).toBeInTheDocument();
    expect(screen.queryByText('Enviado depois de validar')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Digite seu nome'), { target: { value: 'Leonardo' } });
    fireEvent.click(button);
    expect(await screen.findByText('Enviado depois de validar')).toBeInTheDocument();
    expect(mocks.persistDurablePublicSave).not.toHaveBeenCalled();
    expect(mocks.invokeEdge).not.toHaveBeenCalled();
  });

  it('reveals, focuses and replays feedback on the first invalid field in visual order', async () => {
    const firstRequiredInput = createDefaultPageElement('input_text');
    firstRequiredInput.label = 'Primeiro campo obrigatório';
    firstRequiredInput.required = true;
    const secondRequiredInput = createDefaultPageElement('input_text');
    secondRequiredInput.label = 'Segundo campo obrigatório';
    secondRequiredInput.required = true;

    const form = {
      ...previewForm(),
      id: 'ordered-validation-form',
      enableGeolocation: false,
      pages: [{
        id: 'page',
        title: 'Página',
        elements: [firstRequiredInput, secondRequiredInput],
      }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/ordered-validation-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const firstInput = await screen.findByRole('textbox', { name: /Primeiro campo obrigatório/ });
    const secondInput = screen.getByRole('textbox', { name: /Segundo campo obrigatório/ });
    const submit = screen.getByRole('button', { name: 'Enviar' });

    fireEvent.click(submit);
    await screen.findAllByText('Preencha este campo');

    const firstField = firstInput.closest('[data-form-field-id]') as HTMLElement;
    const secondField = secondInput.closest('[data-form-field-id]') as HTMLElement;
    expect(firstInput).toHaveFocus();
    expect(firstField).toHaveClass('form-field-invalid');
    expect(firstField).toHaveAttribute('aria-invalid', 'true');
    expect(firstInput).toHaveAttribute('aria-invalid', 'true');
    expect(firstInput).toHaveAttribute('aria-describedby', `field-error-${firstRequiredInput.id}`);
    expect(document.getElementById(`field-error-${firstRequiredInput.id}`)).toHaveTextContent('Preencha este campo');
    expect(firstField.dataset.validationFeedbackAttempt).toBe('1');
    expect(secondField.dataset.validationFeedbackAttempt).toBeUndefined();

    fireEvent.click(submit);
    await waitFor(() => expect(firstField.dataset.validationFeedbackAttempt).toBe('2'));
    expect(firstInput).toHaveFocus();
    expect(secondField.dataset.validationFeedbackAttempt).toBeUndefined();

    fireEvent.change(firstInput, { target: { value: 'Leonardo' } });
    await waitFor(() => expect(firstField).not.toHaveClass('form-field-invalid'));
    expect(firstField).not.toHaveAttribute('aria-invalid');
    expect(firstInput).toHaveAttribute('aria-invalid', 'false');
    expect(secondField).toHaveClass('form-field-invalid');

    fireEvent.change(firstInput, { target: { value: '' } });
    await waitFor(() => expect(firstField).toHaveClass('form-field-invalid'));
    expect(firstInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('validates required fields placed on a custom welcome screen', async () => {
    const requiredInput = createDefaultPageElement('input_text');
    requiredInput.label = 'Nome na abertura';
    requiredInput.placeholder = 'Digite seu nome na abertura';
    requiredInput.required = true;
    const nextButton = createDefaultPageElement('button');
    nextButton.content = 'Continuar da abertura';
    nextButton.buttonAction = 'next';
    const pageText = createDefaultPageElement('rich_text');
    pageText.content = 'Primeira página validada';
    const form = {
      id: 'welcome-validation-form',
      title: 'Validação da abertura',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: true,
      welcomePage: { id: 'welcome', title: 'Abertura', elements: [requiredInput, nextButton] },
      pages: [{ id: 'page', title: 'Página', elements: [pageText] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/welcome-validation-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const button = await screen.findByRole('button', { name: 'Continuar da abertura' });
    fireEvent.click(button);
    expect(await screen.findByText('Preencha este campo')).toBeInTheDocument();
    expect(screen.queryByText('Primeira página validada')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Digite seu nome na abertura'), { target: { value: 'Leonardo' } });
    fireEvent.click(button);
    expect(await screen.findByText('Primeira página validada')).toBeInTheDocument();
  });

  it('fails closed when a condition resolves to an unconnected branch', async () => {
    const pageText = createDefaultPageElement('rich_text');
    pageText.content = 'Página antes da condição';
    const form = {
      id: 'broken-condition-form',
      title: 'Condição incompleta',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      thankYouTitle: 'Não deveria concluir',
      pages: [{ id: 'page', title: 'Página', elements: [pageText] }],
      conditions: [{
        id: 'condition',
        label: 'Condição sem caminho padrão',
        branches: [{
          id: 'only-branch',
          label: 'Somente sim',
          conditionGroup: {
            id: 'group',
            logic: 'and',
            groups: [],
            rules: [{
              id: 'rule',
              subjectType: 'question',
              questionId: 'missing-answer',
              operator: 'equals',
              value: 'sim',
            }],
          },
        }],
      }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'to-condition', source: 'p-page', target: 'c-condition' },
        { id: 'only-path', source: 'c-condition', sourceHandle: 'branch-only-branch', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/broken-condition-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Etapa não confirmada')).toBeInTheDocument();
    expect(screen.queryByText('Não deveria concluir')).not.toBeInTheDocument();
  });

  it('completes a persisted terminal page without reporting a broken traversal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pageText = createDefaultPageElement('rich_text');
    pageText.content = 'Página terminal legítima';
    const form = {
      id: 'terminal-page-form',
      title: 'Página terminal',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      thankYouTitle: 'Terminal concluído',
      pages: [{ id: 'terminal', title: 'Terminal', elements: [pageText] }],
      flowEdges: [{ id: 'start', source: 'start', target: 'p-terminal' }],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/terminal-page-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Terminal concluído')).toBeInTheDocument();
    expect(warn.mock.calls.filter(([message]) => String(message).startsWith('[walkWorkflow]'))).toEqual([]);
    warn.mockRestore();
  });

  it('keeps diagnostics for a real dead end on a non-page workflow node', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pageText = createDefaultPageElement('rich_text');
    pageText.content = 'Página antes do nó inválido';
    const form = {
      id: 'broken-node-form',
      title: 'Nó inválido',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      thankYouTitle: 'Recuperação concluída',
      pages: [{ id: 'page', title: 'Página', elements: [pageText] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'broken', source: 'p-page', target: 'unknown-broken-node' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/broken-node-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Recuperação concluída')).toBeInTheDocument();
    expect(warn.mock.calls.some(([message]) => String(message).includes('Dead end — no outgoing edges from:'))).toBe(true);
    warn.mockRestore();
  });

  it('opens an optional date picker without advancing or submitting the page', async () => {
    const date = createDefaultPageElement('input_date');
    date.label = 'Data opcional';
    date.placeholder = 'dd/mm/aaaa';
    date.required = false;
    const otherFields = Array.from({ length: 6 }, (_, index) => {
      const field = createDefaultPageElement('input_text');
      field.label = `Campo opcional ${index + 1}`;
      field.required = false;
      return field;
    });
    const form = {
      id: 'date-modal-form',
      title: 'Modal de data',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      thankYouTitle: 'Não pode enviar ao abrir a data',
      pages: [{ id: 'page', title: 'Página', elements: [date, ...otherFields] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/date-modal-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const openDate = await screen.findByRole('button', { name: 'dd/mm/aaaa' });
    fireEvent.click(openDate);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Selecione a data' })).toBeInTheDocument();
    expect(screen.queryByText('Não pode enviar ao abrir a data')).not.toBeInTheDocument();
    expect(mocks.persistDurablePublicSave).not.toHaveBeenCalled();
  });

  it('does not let an older choice auto-advance close a date modal opened during its feedback delay', async () => {
    const date = createDefaultPageElement('input_date');
    date.label = 'Data já preenchida';
    date.defaultValue = '2026-08-10';
    const radio = createDefaultPageElement('input_radio');
    radio.label = 'Escolha final';
    radio.options = [{ id: 'yes', label: 'Sim' }];
    const form = {
      id: 'date-selection-race-form',
      title: 'Concorrência da data',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      thankYouTitle: 'Não deve avançar com a modal aberta',
      pages: [{ id: 'page', title: 'Página', elements: [date, radio] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/date-selection-race-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Sim/ }));
    fireEvent.click(screen.getByRole('button', { name: '10/08/2026' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 650));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Não deve avançar com a modal aberta')).not.toBeInTheDocument();
  });

  it('does not let a completed loading automation navigate underneath an open date modal', async () => {
    const date = createDefaultPageElement('input_date');
    date.label = 'Data em preenchimento';
    date.placeholder = 'dd/mm/aaaa';
    const loading = createDefaultPageElement('loading');
    loading.loadingDuration = 0.03;
    loading.loadingTargetPercent = 100;
    loading.loadingAction = 'next';
    const nextPage = createDefaultPageElement('rich_text');
    nextPage.content = 'Página seguinte não pode abrir';
    const form = {
      id: 'date-loading-race-form',
      title: 'Automação e modal',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      pages: [
        { id: 'first', title: 'Primeira', elements: [date, loading] },
        { id: 'second', title: 'Segunda', elements: [nextPage] },
      ],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-first' },
        { id: 'next', source: 'p-first', target: 'p-second' },
        { id: 'end', source: 'p-second', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/date-loading-race-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'dd/mm/aaaa' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('100%')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Página seguinte não pode abrir')).not.toBeInTheDocument();
  });

  it('shows success only after the backend acknowledges the completed response', async () => {
    window.history.pushState({}, '', '/f/ack-form');
    mocks.invokeEdge.mockResolvedValue({ data: { success: true }, error: null });
    mocks.persistDurablePublicSave
      .mockResolvedValueOnce({ delivered: false, queued: true })
      .mockResolvedValueOnce({ delivered: true, queued: true });

    const text = createDefaultPageElement('rich_text');
    text.content = 'Confirme seu envio';
    const form = {
      id: 'ack-form',
      title: 'Confirmação',
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      pages: [{ id: 'page', title: 'Página', elements: [text] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
      thankYouTitle: 'Envio confirmado',
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/ack-form']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview={false} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Envio ainda não confirmado')).toBeInTheDocument();
    expect(screen.queryByText('Envio confirmado')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Envio confirmado')).toBeInTheDocument();
    expect(mocks.persistDurablePublicSave).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByText('Envio confirmado')).toBeInTheDocument();
    expect(screen.queryByText('Confirme seu envio')).not.toBeInTheDocument();
    expect(mocks.persistDurablePublicSave).toHaveBeenCalledTimes(2);
  });

  it('keeps native navigation when a decorative button has no safe action', async () => {
    const text = createDefaultPageElement('rich_text');
    text.content = 'Página com botão decorativo';
    const inertButton = createDefaultPageElement('button');
    inertButton.content = 'Sem ação';
    inertButton.buttonAction = 'none';
    inertButton.href = 'javascript:alert(1)';
    const form = {
      id: 'inert-button-form',
      title: 'Botão inerte',
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      pages: [{ id: 'page', title: 'Página', elements: [text, inertButton] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page' },
        { id: 'end', source: 'p-page', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/inert-button-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Página com botão decorativo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('does not hijack arrow keys owned by a respondent field', async () => {
    const textarea = createDefaultPageElement('input_textarea');
    textarea.label = 'Mensagem longa';
    const secondPageText = createDefaultPageElement('rich_text');
    secondPageText.content = 'Segunda página';
    const form = {
      id: 'keyboard-form',
      title: 'Teclado',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: false,
      pages: [
        { id: 'first', title: 'Primeira', elements: [textarea] },
        { id: 'second', title: 'Segunda', elements: [secondPageText] },
      ],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-first' },
        { id: 'next', source: 'p-first', target: 'p-second' },
        { id: 'end', source: 'p-second', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/keyboard-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const field = await screen.findByRole('textbox', { name: 'Mensagem longa' });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowUp' });

    expect(screen.getByRole('textbox', { name: 'Mensagem longa' })).toBeInTheDocument();
    expect(screen.queryByText('Segunda página')).not.toBeInTheDocument();
  });

  it('mounts distinct animated screens from welcome to page and from the last page to thank-you', async () => {
    const content = createDefaultPageElement('rich_text');
    content.content = 'Primeira e última página';
    const form = {
      id: 'transition-form',
      title: 'Formulário com transições',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      style: {},
      responseCount: 0,
      completionRate: 0,
      showWelcomeScreen: true,
      welcomeTitle: 'Vamos começar',
      thankYouTitle: 'Transição concluída',
      pages: [{ id: 'page-one', title: 'Página 1', elements: [content] }],
      flowEdges: [
        { id: 'start', source: 'start', target: 'p-page-one' },
        { id: 'end', source: 'p-page-one', target: 'end' },
      ],
    } as FormData;

    render(
      <MemoryRouter initialEntries={['/f/transition-form?editorPreview=1']}>
        <Routes>
          <Route path="/f/:id" element={<FormPreviewCore form={form} isEditorPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const welcomeScreen = await screen.findByTestId('form-screen-welcome');
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }));
    const pageScreen = await screen.findByTestId('form-screen-page:page-one');
    expect(pageScreen).not.toBe(welcomeScreen);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    const thankYouScreen = await screen.findByTestId('form-screen-thank-you');
    expect(thankYouScreen).not.toBe(pageScreen);
    expect(screen.getByText('Transição concluída')).toBeInTheDocument();
  });
});
