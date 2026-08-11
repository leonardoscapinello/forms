import { describe, expect, it } from 'vitest';
import {
  enforceProviderRequestRateLimits,
  enforceWorkflowNodeRateLimits,
} from '../../supabase/functions/_shared/rateLimit.ts';

type RpcCall = { name: string; args: Record<string, unknown> };

function allowAllClient(calls: RpcCall[]) {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  };
}

const baseOptions = {
  bucket: 'resend-send',
  globalScope: 'integration-1',
  globalLimit: 180,
  formId: 'form-1',
  responseId: 'response-1',
  nodeKey: 'kind=email&node=node-1',
};

describe('workflow node rate limiting', () => {
  it('uses independent IP, tenant-global and response-node buckets', async () => {
    const calls: RpcCall[] = [];
    const client = allowAllClient(calls);
    const req = new Request('https://forms.example/functions/v1/resend-send', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });

    await expect(enforceWorkflowNodeRateLimits(client, req, baseOptions))
      .resolves.toBeNull();

    expect(calls.map((call) => call.args.p_bucket)).toEqual([
      'resend-send:ip',
      'resend-send:tenant-global',
      'resend-send:response-node',
    ]);
    expect(calls[0].args.p_limit).toBe(10_000);
    expect(calls[1].args.p_limit).toBe(180);
    expect(calls[2].args.p_limit).toBe(6);
  });

  it('shares IP and tenant ceilings while isolating each response retry budget', async () => {
    const calls: RpcCall[] = [];
    const client = allowAllClient(calls);
    const req = new Request('https://forms.example/functions/v1/resend-send', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });

    await enforceWorkflowNodeRateLimits(client, req, baseOptions);
    await enforceWorkflowNodeRateLimits(client, req, {
      ...baseOptions,
      responseId: 'response-2',
    });

    expect(calls[0].args.p_key_hash).toBe(calls[3].args.p_key_hash);
    expect(calls[1].args.p_key_hash).toBe(calls[4].args.p_key_hash);
    expect(calls[2].args.p_key_hash).not.toBe(calls[5].args.p_key_hash);
  });

  it('keeps the tenant ceiling shared across distributed IPs', async () => {
    const calls: RpcCall[] = [];
    const client = allowAllClient(calls);
    await enforceWorkflowNodeRateLimits(client, new Request('https://forms.example', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    }), baseOptions);
    await enforceWorkflowNodeRateLimits(client, new Request('https://forms.example', {
      headers: { 'cf-connecting-ip': '203.0.113.11' },
    }), baseOptions);

    expect(calls[0].args.p_key_hash).not.toBe(calls[3].args.p_key_hash);
    expect(calls[1].args.p_key_hash).toBe(calls[4].args.p_key_hash);
  });

  it('keeps admin/legacy calls under the global ceiling without a fake shared node budget', async () => {
    const calls: RpcCall[] = [];
    const client = allowAllClient(calls);
    const req = new Request('https://forms.example/functions/v1/resend-send');

    await enforceWorkflowNodeRateLimits(client, req, {
      ...baseOptions,
      formId: '',
      responseId: '',
      nodeKey: '',
    });

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.args.p_bucket)).toEqual([
      'resend-send:ip',
      'resend-send:tenant-global',
    ]);
  });

  it('bypasses all counters for authenticated service requests', async () => {
    const calls: RpcCall[] = [];
    const client = allowAllClient(calls);
    const req = new Request('https://forms.example/functions/v1/resend-send', {
      headers: { authorization: 'Bearer service-secret' },
    });

    await enforceWorkflowNodeRateLimits(client, req, {
      ...baseOptions,
      serviceRoleKey: 'service-secret',
    });

    expect(calls).toHaveLength(0);
  });
});

describe('provider request rate limiting', () => {
  it('protects Reoon independently by IP, provider capacity and email hash', async () => {
    const calls: RpcCall[] = [];
    const client = allowAllClient(calls);
    const req = new Request('https://forms.example/functions/v1/verify-email', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });

    await enforceProviderRequestRateLimits(client, req, {
      bucket: 'verify-email',
      providerScope: 'reoon-email',
      providerLimit: 600,
      subjectScope: 'email-hash-a',
      subjectLimit: 20,
    });

    expect(calls.map((call) => call.args.p_bucket)).toEqual([
      'verify-email:ip',
      'verify-email:provider-global',
      'verify-email:subject',
    ]);
    expect(calls.map((call) => call.args.p_limit)).toEqual([10_000, 600, 20]);
  });

  it('does not let distributed IPs bypass the same provider or email budget', async () => {
    const calls: RpcCall[] = [];
    const client = allowAllClient(calls);
    const options = {
      bucket: 'verify-email',
      providerScope: 'reoon-email',
      providerLimit: 600,
      subjectScope: 'email-hash-a',
      subjectLimit: 20,
    };
    await enforceProviderRequestRateLimits(client, new Request('https://forms.example', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    }), options);
    await enforceProviderRequestRateLimits(client, new Request('https://forms.example', {
      headers: { 'cf-connecting-ip': '203.0.113.11' },
    }), options);

    expect(calls[0].args.p_key_hash).not.toBe(calls[3].args.p_key_hash);
    expect(calls[1].args.p_key_hash).toBe(calls[4].args.p_key_hash);
    expect(calls[2].args.p_key_hash).toBe(calls[5].args.p_key_hash);
  });
});
