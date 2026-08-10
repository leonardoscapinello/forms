import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_STACK,
  normalizeFontFamily,
  normalizeFontFamilyName,
} from './fontUtils';

describe('fontUtils', () => {
  it('uses FH Duo Display when no font is configured', () => {
    expect(normalizeFontFamilyName()).toBe(DEFAULT_FONT_FAMILY);
    expect(normalizeFontFamily()).toBe(DEFAULT_FONT_STACK);
  });

  it.each(['Borna', 'Inter', "'Borna', sans-serif", '"Inter", system-ui'])(
    'maps the legacy default %s to FH Duo Display',
    (legacyFont) => {
      expect(normalizeFontFamilyName(legacyFont)).toBe(DEFAULT_FONT_FAMILY);
      expect(normalizeFontFamily(legacyFont)).toBe(DEFAULT_FONT_STACK);
    },
  );

  it('preserves a custom font selected by the form author', () => {
    expect(normalizeFontFamilyName('Georgia')).toBe('Georgia');
    expect(normalizeFontFamily('Georgia, serif')).toBe('Georgia, serif');
  });
});
