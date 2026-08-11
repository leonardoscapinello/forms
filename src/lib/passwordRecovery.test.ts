import { describe, expect, it } from 'vitest';
import { passwordResetRedirectUrl, passwordValidationError } from './passwordRecovery';

describe('password recovery', () => {
  it('enforces the project password policy and confirmation', () => {
    expect(passwordValidationError('curta', 'curta')).toBe('Use pelo menos 12 caracteres.');
    expect(passwordValidationError('uma-senha-segura', 'outra-senha-segura')).toBe('As senhas não coincidem.');
    expect(passwordValidationError('uma-senha-segura', 'uma-senha-segura')).toBeNull();
  });

  it('builds a clean recovery callback without preserving path, query or hash', () => {
    expect(passwordResetRedirectUrl('https://forms.example.com/old?token=secret#hash'))
      .toBe('https://forms.example.com/reset-password');
  });

  it('does not accept credentials embedded in the configured origin', () => {
    expect(passwordResetRedirectUrl('https://user:secret@evil.example/path'))
      .toBe('http://localhost:3000/reset-password');
  });
});
