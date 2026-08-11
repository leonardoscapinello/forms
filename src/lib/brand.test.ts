import { describe, expect, it } from 'vitest';
import { BRAND, getCopyright, normalizeBrandSettings } from './brand';

describe('application brand', () => {
  it('never accepts empty identity fields', () => {
    expect(normalizeBrandSettings({ productName: '  ', ownerName: '', description: null })).toEqual(BRAND);
  });

  it('trims values and only accepts local or HTTPS assets', () => {
    expect(normalizeBrandSettings({
      productName: '  Meu   Forms  ',
      ownerName: ' Leonardo ',
      description: ' Projeto pessoal ',
      logoUrl: 'javascript:alert(1)',
      faviconUrl: 'https://cdn.example.com/icon.svg',
    })).toMatchObject({
      productName: 'Meu Forms',
      ownerName: 'Leonardo',
      description: 'Projeto pessoal',
      logoUrl: BRAND.logoUrl,
      faviconUrl: 'https://cdn.example.com/icon.svg',
    });
  });

  it('builds the requested personal copyright from the active identity', () => {
    expect(getCopyright(2026, { ...BRAND, productName: 'Pesquisas' }))
      .toBe('© 2026 Leonardo Scapinello — Pesquisas');
  });
});
