/**
 * Shared font normalization utility.
 * Centralizes the product font fallback and keeps legacy saved forms compatible.
 */

export const DEFAULT_FONT_FAMILY = 'FH Duo Display';
export const DEFAULT_FONT_STACK = "'FH Duo Display', ui-sans-serif, system-ui, sans-serif";

const LEGACY_DEFAULT_FONTS = new Set(['borna', 'inter']);

export function normalizeFontFamilyName(fontFamily?: string): string {
  const raw = (fontFamily ?? '').trim();
  if (!raw) return DEFAULT_FONT_FAMILY;

  const normalized = raw.replace(/["']/g, '').toLowerCase();
  const firstFamily = normalized.split(',')[0]?.trim() || '';

  if (!firstFamily || LEGACY_DEFAULT_FONTS.has(firstFamily)) {
    return DEFAULT_FONT_FAMILY;
  }

  return raw;
}

export function normalizeFontFamily(fontFamily?: string): string {
  const raw = normalizeFontFamilyName(fontFamily);
  const normalized = raw.replace(/["']/g, '').toLowerCase();
  const firstFamily = normalized.split(',')[0]?.trim() || '';

  if (firstFamily === DEFAULT_FONT_FAMILY.toLowerCase()) {
    return DEFAULT_FONT_STACK;
  }

  return raw;
}
