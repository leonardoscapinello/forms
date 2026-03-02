/**
 * Input sanitization utilities.
 * Strips dangerous content from user inputs before storage.
 */

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
