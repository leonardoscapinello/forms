/** Normalize an owner-configured external URL and reject executable/unsafe schemes. */
export function normalizeHttpsUrl(rawUrl?: string, allowedHosts?: readonly string[]): string {
  if (!rawUrl?.trim()) return '';

  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return '';

    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (allowedHosts?.length && !allowedHosts.some(allowed => host === allowed.toLowerCase())) {
      return '';
    }

    return url.toString();
  } catch {
    return '';
  }
}

export function normalizeWhatsAppGroupUrl(rawUrl?: string): string {
  return normalizeHttpsUrl(rawUrl, ['chat.whatsapp.com']);
}
