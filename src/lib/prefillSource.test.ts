import { describe, expect, it } from 'vitest';
import {
  buildPrefillParameterToken,
  inferPrefillSourceMode,
  isAllowedPrefillParameterKey,
  normalizePrefillParameterKeyInput,
  readPrefillParameterKey,
} from './prefillSource';

describe('prefill source contract', () => {
  it('normaliza uma chave colada como trecho de query string', () => {
    expect(normalizePrefillParameterKeyInput('?telefone=5511987654321')).toBe('telefone');
    expect(buildPrefillParameterToken('?telefone=')).toBe('{{param.telefone}}');
    expect(readPrefillParameterKey('{{ param.telefone }}')).toBe('telefone');
  });

  it('bloqueia parâmetros reservados, protótipos e sintaxe perigosa', () => {
    for (const key of ['access_token', 'previewSession', '__var_admin', 'constructor', 'lead.__proto__.name', 'tel?x']) {
      expect(isAllowedPrefillParameterKey(key)).toBe(false);
      expect(buildPrefillParameterToken(key)).toBeUndefined();
    }
  });

  it('identifica valor fixo, referência e parâmetro GET sem mudar o schema salvo', () => {
    expect(inferPrefillSourceMode('Leonardo')).toBe('literal');
    expect(inferPrefillSourceMode('{{lead_name}}')).toBe('reference');
    expect(inferPrefillSourceMode('Olá, {{lead_name}}')).toBe('reference');
    expect(inferPrefillSourceMode('{{param.email}}')).toBe('param');
  });
});
