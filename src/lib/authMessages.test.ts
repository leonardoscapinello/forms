import { describe, expect, it } from 'vitest';
import { signInErrorMessage } from './authMessages';

describe('signInErrorMessage', () => {
  it('maps provider error codes to stable Portuguese messages', () => {
    expect(signInErrorMessage('invalid_credentials')).toBe('E-mail ou senha inválidos.');
    expect(signInErrorMessage('email_not_confirmed')).toBe('Confirme seu e-mail antes de entrar.');
    expect(signInErrorMessage('over_request_rate_limit')).toContain('Muitas tentativas');
  });

  it('does not expose an unknown provider message', () => {
    expect(signInErrorMessage('unknown', 'internal provider detail')).not.toContain('internal provider detail');
  });
});
