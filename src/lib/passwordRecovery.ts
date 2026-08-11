export const MIN_PASSWORD_LENGTH = 12;

export function passwordValidationError(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > 128) return 'Use no máximo 128 caracteres.';
  if (password !== confirmation) return 'As senhas não coincidem.';
  return null;
}

export function passwordResetRedirectUrl(configuredOrigin?: string): string {
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const candidate = configuredOrigin || fallbackOrigin;
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid_origin');
    url.pathname = '/reset-password';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return fallbackOrigin ? `${fallbackOrigin}/reset-password` : '/reset-password';
  }
}
