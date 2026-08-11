import { describe, expect, it } from 'vitest';
import { formatEmailValidationIdentifier } from './emailValidationIdentifier';

describe('formatEmailValidationIdentifier', () => {
  it('shows only an abbreviated SHA-256 identifier', () => {
    const hash = 'a'.repeat(64);
    expect(formatEmailValidationIdentifier(hash)).toBe(`${'a'.repeat(10)}…${'a'.repeat(8)}`);
  });

  it('never renders a legacy plaintext e-mail', () => {
    const plaintext = 'pessoa@example.com';
    const rendered = formatEmailValidationIdentifier(plaintext);
    expect(rendered).toBe('identificador protegido');
    expect(rendered).not.toContain(plaintext);
    expect(rendered).not.toContain('@');
  });
});
