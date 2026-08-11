import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  MASKED_INTEGRATION_SECRET,
  listIntegrationCatalog,
  listIntegrationSettings,
  saveIntegrationSetting,
  withIntegrationTimeout,
} from './integrationSettings';

describe('integration settings client boundary', () => {
  beforeEach(() => invokeMock.mockReset());
  afterEach(() => vi.useRealTimers());

  it('loads only the sanitized rows returned by the authenticated Edge Function', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        rows: [{
          id: 'setting-1',
          integration_type: 'openai',
          label: 'OpenAI',
          is_active: true,
          config: { apiKey: MASKED_INTEGRATION_SECRET, model: 'gpt-4.1-mini' },
        }],
      },
      error: null,
    });

    const rows = await listIntegrationSettings('openai');

    expect(invokeMock).toHaveBeenCalledWith('integration-settings', {
      body: { action: 'list', integrationType: 'openai' },
    });
    expect(rows[0].config.apiKey).toBe(MASKED_INTEGRATION_SECRET);
  });

  it('preserves the masked-secret contract and exposes server validation status after save', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        validation: { status: 'validated' },
        row: {
          id: 'setting-1',
          integration_type: 'resend',
          label: 'Resend',
          is_active: true,
          config: { apiKey: MASKED_INTEGRATION_SECRET, defaultFrom: 'forms@example.com' },
        },
      },
      error: null,
    });

    const row = await saveIntegrationSetting({
      id: 'setting-1',
      integrationType: 'resend',
      label: 'Resend',
      isActive: true,
      config: { apiKey: MASKED_INTEGRATION_SECRET, defaultFrom: 'forms@example.com' },
    });

    expect(row.config.apiKey).toBe(MASKED_INTEGRATION_SECRET);
    expect(row.validation?.status).toBe('validated');
  });

  it('uses the minimal authenticated catalog for editor integration selectors', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        rows: [{
          id: 'setting-1',
          integration_type: 'evolution_api',
          label: 'WhatsApp principal',
          is_active: true,
          config: { instanceName: 'principal' },
        }],
      },
      error: null,
    });

    const rows = await listIntegrationCatalog('evolution_api');

    expect(invokeMock).toHaveBeenCalledWith('integration-settings', {
      body: { action: 'catalog', integrationType: 'evolution_api' },
    });
    expect(rows[0].config).toEqual({ instanceName: 'principal' });
  });

  it('does not report an active save as successful without server validation proof', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        row: {
          id: 'setting-1',
          integration_type: 'openai',
          label: 'OpenAI',
          is_active: true,
          config: { apiKey: MASKED_INTEGRATION_SECRET, model: 'gpt-4.1-mini' },
        },
      },
      error: null,
    });

    await expect(saveIntegrationSetting({
      integrationType: 'openai',
      label: 'OpenAI',
      isActive: true,
      config: { apiKey: 'sk-test', model: 'gpt-4.1-mini' },
    })).rejects.toThrow('não confirmou a validação');
  });

  it('ends stalled integration operations at the deadline', async () => {
    vi.useFakeTimers();
    const stalled = withIntegrationTimeout(new Promise<never>(() => undefined), 500);
    const assertion = expect(stalled).rejects.toThrow('A validação demorou demais');

    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('translates Edge validation codes into a visible message', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'openai_credentials_invalid' }) },
      },
    });

    await expect(listIntegrationSettings('openai')).rejects.toThrow('A API key da OpenAI foi recusada.');
  });
});
