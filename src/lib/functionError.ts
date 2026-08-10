import { FunctionsHttpError } from '@supabase/supabase-js';

function payloadMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return null;
}

export async function getFunctionErrorMessage(
  error: unknown,
  fallback = 'Não foi possível concluir a solicitação.',
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await (error.context as Response).clone().json();
      const message = payloadMessage(payload);
      if (message) return message;
    } catch {
      // Fall through to the normalized SDK error below.
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
