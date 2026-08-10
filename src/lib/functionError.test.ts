import { describe, expect, it } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getFunctionErrorMessage } from './functionError';

describe('getFunctionErrorMessage', () => {
  it('returns the JSON error sent by an Edge Function', async () => {
    const response = new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(getFunctionErrorMessage(new FunctionsHttpError(response)))
      .resolves.toBe('Password must be at least 8 characters');
  });

  it('falls back to regular and unknown errors', async () => {
    await expect(getFunctionErrorMessage(new Error('offline'))).resolves.toBe('offline');
    await expect(getFunctionErrorMessage(null, 'fallback')).resolves.toBe('fallback');
  });
});
