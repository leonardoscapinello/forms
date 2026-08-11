import { describe, expect, it } from 'vitest';
import { appErrorMessage } from './appErrorMessage';

describe('appErrorMessage', () => {
  it('never exposes internal error details in production', () => {
    const error = new Error('JWT secret=internal-value at /private/module.ts:42');
    const message = appErrorMessage(error, true);

    expect(message).not.toContain('internal-value');
    expect(message).not.toContain('/private/module.ts');
    expect(message).toContain('Não foi possível');
  });

  it('uses a safe actionable message for a stale deployment chunk', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: /assets/Admin-old.js');
    expect(appErrorMessage(error, true)).toContain('atualizado');
  });

  it('keeps developer diagnostics outside production', () => {
    const error = new Error('render invariant 123');
    expect(appErrorMessage(error, false)).toBe('render invariant 123');
  });
});
