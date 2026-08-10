import DOMPurify from 'dompurify';

/**
 * Input sanitization utilities.
 * Strips dangerous content from user inputs before storage.
 */

const RICH_TEXT_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br',
  'span', 'mark', 'p', 'div', 'font',
];

const SAFE_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-style',
  'font-weight',
  'text-align',
  'text-decoration',
]);

const UNSAFE_CSS_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|\\/i;

/** Keep the editor's basic formatting while removing executable HTML/CSS. */
export function sanitizeRichTextHtml(input: string): string {
  if (!input) return '';

  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: RICH_TEXT_TAGS,
    ALLOWED_ATTR: ['class', 'style', 'color', 'size'],
  });

  const template = document.createElement('template');
  template.innerHTML = clean;

  for (const element of template.content.querySelectorAll<HTMLElement>('*')) {
    if (element.hasAttribute('class')) {
      const safeClasses = [...element.classList]
        .filter((name) => /^var-highlight(?:-[a-z-]+)?$/.test(name));
      if (safeClasses.length) element.className = safeClasses.join(' ');
      else element.removeAttribute('class');
    }

    const rawStyle = element.getAttribute('style');
    if (rawStyle) {
      const safeStyle = rawStyle
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .flatMap((declaration) => {
          const colon = declaration.indexOf(':');
          if (colon < 1) return [];
          const property = declaration.slice(0, colon).trim().toLowerCase();
          const value = declaration.slice(colon + 1).trim();
          if (!SAFE_STYLE_PROPERTIES.has(property) || !value || UNSAFE_CSS_VALUE.test(value)) return [];
          return [`${property}: ${value}`];
        })
        .join('; ');

      if (safeStyle) element.setAttribute('style', safeStyle);
      else element.removeAttribute('style');
    }
  }

  return template.innerHTML;
}

/** Strip HTML tags from a string, keeping only text content */
export function stripHtml(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, '').trim();
}

/** Normalize phone/WhatsApp numbers: keep only digits and leading + */
export function normalizePhone(input: string): string {
  if (!input) return '';
  const cleaned = input.replace(/[^\d+]/g, '');
  // Ensure at most one leading +
  if (cleaned.startsWith('+')) {
    return '+' + cleaned.slice(1).replace(/\+/g, '');
  }
  return cleaned;
}

/** Enforce a maximum character length, truncating if exceeded */
export function enforceMaxLength(input: string, max = 10_000): string {
  if (!input) return '';
  return input.length > max ? input.slice(0, max) : input;
}

/** Sanitize a generic text input: strip HTML + enforce length */
export function sanitizeText(input: string, maxLength = 10_000): string {
  return enforceMaxLength(stripHtml(input), maxLength);
}
