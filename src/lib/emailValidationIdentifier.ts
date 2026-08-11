const SHA256_HEX = /^[a-f0-9]{64}$/i;

/** Never lets a legacy plaintext e-mail leak through the validation history UI. */
export function formatEmailValidationIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) return 'identificador protegido';
  const normalized = value.toLowerCase();
  return `${normalized.slice(0, 10)}…${normalized.slice(-8)}`;
}
