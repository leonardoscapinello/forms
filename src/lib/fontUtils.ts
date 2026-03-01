/**
 * Shared font normalization utility.
 * Centralizes the Borna font fallback logic used across FormPreview, PageBuilder, and ElementPreview.
 */

export const BORNA_FONT_STACK = "'Borna', ui-sans-serif, system-ui, sans-serif";

export function normalizeFontFamily(fontFamily?: string): string {
  const raw = (fontFamily ?? '').trim();
  if (!raw) return BORNA_FONT_STACK;

  const normalized = raw.replace(/["']/g, '').toLowerCase();
  const firstFamily = normalized.split(',')[0]?.trim() || '';

  if (!firstFamily || firstFamily === 'inter' || firstFamily === 'borna') {
    return BORNA_FONT_STACK;
  }

  return raw;
}
