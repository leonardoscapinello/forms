import { describe, expect, it, vi } from 'vitest';
import {
  enforcePublicSubmissionRateLimits,
  validateAndRateLimitPublicFormAccess,
  validateAndRateLimitPublicFormGet,
} from '../../supabase/functions/_shared/rateLimit.ts';

describe('public form NAT-safe rate limits', () => {
  it('keeps the IP+form ceiling independent from the per-response budget', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
      data: true,
      error: null,
    }));
    const client = { rpc };
    const options = {
      bucket: 'form-public-save',
      formId: '10000000-0000-4000-8000-000000000001',
      responseId: '20000000-0000-4000-8000-000000000001',
      ipFormLimit: 10_000,
      ipFormWindowSeconds: 60,
      formGlobalLimit: 20_000,
      formGlobalWindowSeconds: 60,
      responseLimit: 600,
      responseWindowSeconds: 300,
    };

    await enforcePublicSubmissionRateLimits(client, new Request('https://forms.test', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    }), options);
    await enforcePublicSubmissionRateLimits(client, new Request('https://forms.test', {
      headers: { 'cf-connecting-ip': '203.0.113.11' },
    }), options);

    expect(rpc).toHaveBeenCalledTimes(6);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_bucket: 'form-public-save:response',
      p_limit: 600,
      p_window_seconds: 300,
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_bucket: 'form-public-save:ip-form',
      p_limit: 10_000,
      p_window_seconds: 60,
    });
    expect(rpc.mock.calls[2][1]).toMatchObject({
      p_bucket: 'form-public-save:form-global',
      p_limit: 20_000,
      p_window_seconds: 60,
    });
    // Different NAT sources consume different IP keys. The form-global and
    // signed-response budgets stay stable regardless of the current IP.
    expect(rpc.mock.calls[1][1].p_key_hash).not.toBe(rpc.mock.calls[4][1].p_key_hash);
    expect(rpc.mock.calls[2][1].p_key_hash).toBe(rpc.mock.calls[5][1].p_key_hash);
    expect(rpc.mock.calls[0][1].p_key_hash).toBe(rpc.mock.calls[3][1].p_key_hash);
  });

  it('rejects malformed IDs before consuming the form-public-get budget', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
      data: true,
      error: null,
    }));
    const request = new Request('https://forms.test?id=malformed', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });

    const invalid = await validateAndRateLimitPublicFormGet(
      { rpc },
      request,
      'malformed',
    );

    expect(invalid.response?.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();

    const valid = await validateAndRateLimitPublicFormGet(
      { rpc },
      request,
      '10000000-0000-4000-8000-000000000001',
    );

    expect(valid).toEqual({
      formId: '10000000-0000-4000-8000-000000000001',
      response: null,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_bucket: 'form-public-get:ip-form',
      p_limit: 5_000,
      p_window_seconds: 60,
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_bucket: 'form-public-get:form-global',
      p_limit: 20_000,
      p_window_seconds: 60,
    });
  });

  it('gives SSR metadata a NAT-safe 5,000/min IP+form budget', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
      data: true,
      error: null,
    }));
    const request = new Request('https://forms.test', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });

    const access = await validateAndRateLimitPublicFormAccess(
      { rpc },
      request,
      '10000000-0000-4000-8000-000000000001',
      { bucket: 'form-public-metadata:ip-form' },
    );

    expect(access.response).toBeNull();
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_bucket: 'form-public-metadata:ip-form',
      p_limit: 5_000,
      p_window_seconds: 60,
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_bucket: 'form-public-metadata:form-global',
      p_limit: 20_000,
      p_window_seconds: 60,
    });
  });

  it('uses independent completion ceilings without serialising a response by IP', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
      data: true,
      error: null,
    }));

    await enforcePublicSubmissionRateLimits(
      { rpc },
      new Request('https://forms.test', {
        headers: { 'cf-connecting-ip': '203.0.113.10' },
      }),
      {
        bucket: 'form-public-save-completion',
        formId: '10000000-0000-4000-8000-000000000001',
        responseId: '20000000-0000-4000-8000-000000000001',
        ipFormLimit: 600,
        formGlobalLimit: 2_000,
        responseLimit: 20,
      },
    );

    expect(rpc.mock.calls.map((call) => call[1].p_bucket)).toEqual([
      'form-public-save-completion:response',
      'form-public-save-completion:ip-form',
      'form-public-save-completion:form-global',
    ]);
  });

  it('stops a noisy response before it can consume shared form budgets', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
      data: false,
      error: null,
    }));
    const limited = await enforcePublicSubmissionRateLimits(
      { rpc },
      new Request('https://forms.test'),
      {
        bucket: 'form-public-save',
        formId: '10000000-0000-4000-8000-000000000001',
        responseId: '20000000-0000-4000-8000-000000000001',
        ipFormLimit: 10_000,
        formGlobalLimit: 20_000,
        responseLimit: 600,
      },
    );

    expect(limited?.status).toBe(429);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1].p_bucket).toBe('form-public-save:response');
  });
});
