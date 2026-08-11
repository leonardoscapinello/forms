import { describe, expect, it } from 'vitest';
import { validateEmailFormat } from './emailValidation';

describe('validateEmailFormat', () => {
  it.each([
    'lead@empresa.technology',
    'contato@marca.photography',
    'usuario@exemplo.xn--p1ai',
  ])('não perde um lead por um TLD válido que não está na lista embarcada: %s', (email) => {
    expect(validateEmailFormat(email)).toEqual({ valid: true });
  });

  it.each([
    'lead@empresa.c0m',
    'lead@empresa.a',
    'lead@empresa.-com',
  ])('continua recusando uma extensão malformada: %s', (email) => {
    expect(validateEmailFormat(email).valid).toBe(false);
  });
});
