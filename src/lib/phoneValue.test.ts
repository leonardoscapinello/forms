import { describe, expect, it } from 'vitest';
import {
  applyNationalPhoneMask,
  formatInternationalPhone,
  normalizePhoneDefault,
  validatePhoneValue,
} from './phoneValue';

describe('phone value contract', () => {
  it('aplica a máscara do país sem descartar overflow silenciosamente', () => {
    expect(applyNationalPhoneMask('11987654321', 'BR')).toBe('(11) 98765-4321');
    expect(applyNationalPhoneMask('1198765432199', 'BR')).toBe('(11) 98765-4321 99');
    expect(applyNationalPhoneMask('4155552671', 'US')).toBe('(415) 555-2671');
  });

  it('infere país e DDI de um valor internacional mesmo com outro país configurado', () => {
    expect(normalizePhoneDefault('+14155552671', 'BR')).toEqual({
      countryCode: 'US',
      ddi: '+1',
      number: '(415) 555-2671',
    });
    expect(normalizePhoneDefault('+351912345678', 'BR')).toEqual({
      countryCode: 'PT',
      ddi: '+351',
      number: '912 345 678',
    });
    // URLSearchParams decodes a literal leading + as one space.
    expect(normalizePhoneDefault(' 14155552671', 'BR')).toEqual({
      countryCode: 'US',
      ddi: '+1',
      number: '(415) 555-2671',
    });
    expect(normalizePhoneDefault('5511987654321', 'US')).toEqual({
      countryCode: 'BR',
      ddi: '+55',
      number: '(11) 98765-4321',
    });
    expect(validatePhoneValue('+14155552671', { defaultCountryCode: 'BR' })).toEqual({ valid: true });
  });

  it('permite telefone opcional vazio, mas bloqueia qualquer preenchimento incompleto', () => {
    expect(validatePhoneValue(undefined)).toEqual({ valid: true });
    expect(validatePhoneValue({ countryCode: 'BR', ddi: '+55', number: '' })).toEqual({ valid: true });
    expect(validatePhoneValue({ countryCode: 'BR', ddi: '+55', number: '(11) 9876' })).toEqual({
      valid: false,
      error: 'Preencha todos os 11 dígitos do telefone',
    });
    expect(validatePhoneValue({ countryCode: 'BR', ddi: '+55', number: '(11) 98765-4321' })).toEqual({ valid: true });
  });

  it('bloqueia vazio obrigatório e país/DDI incoerentes', () => {
    expect(validatePhoneValue(undefined, { required: true })).toEqual({
      valid: false,
      error: 'Telefone obrigatório',
    });
    expect(validatePhoneValue({ countryCode: 'BR', ddi: '+1', number: '(11) 98765-4321' })).toEqual({
      valid: false,
      error: 'Selecione um país válido para o telefone',
    });
  });

  it('não transforma overflow em um número válido durante normalização ou troca de país', () => {
    const normalized = normalizePhoneDefault('+55119876543210', 'BR');
    expect(normalized).toEqual({
      countryCode: 'BR',
      ddi: '+55',
      number: '(11) 98765-4321 0',
      invalidReason: 'mask_overflow',
    });
    expect(validatePhoneValue('+55119876543210', { defaultCountryCode: 'BR' }).valid).toBe(false);
    expect(validatePhoneValue({
      countryCode: 'US',
      ddi: '+1',
      number: '',
      invalidReason: 'mask_overflow',
    })).toEqual({
      valid: false,
      error: 'O telefone possui mais dígitos do que a máscara permite',
    });
  });

  it('formata o telefone válido para analytics e webhook sem duplicar o mais', () => {
    expect(formatInternationalPhone({
      countryCode: 'BR',
      ddi: '+55',
      number: '(11) 98765-4321',
    })).toBe('+5511987654321');
  });
});
