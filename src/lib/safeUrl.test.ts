import { describe, expect, it } from 'vitest';
import { normalizeHttpsUrl, normalizeWhatsAppGroupUrl } from './safeUrl';

describe('normalizeHttpsUrl', () => {
  it('keeps a valid HTTPS destination', () => {
    expect(normalizeHttpsUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com',
    '//example.com/path',
    'https://user:secret@example.com',
    'not-a-url',
  ])('rejects unsafe external URL %s', value => {
    expect(normalizeHttpsUrl(value)).toBe('');
  });
});

describe('normalizeWhatsAppGroupUrl', () => {
  it('accepts the official WhatsApp group domain', () => {
    expect(normalizeWhatsAppGroupUrl('https://chat.whatsapp.com/InviteCode'))
      .toBe('https://chat.whatsapp.com/InviteCode');
  });

  it.each([
    'https://whatsapp.com/InviteCode',
    'https://chat.whatsapp.com.evil.example/InviteCode',
    'https://evil.example/InviteCode',
  ])('rejects non-group host %s', value => {
    expect(normalizeWhatsAppGroupUrl(value)).toBe('');
  });
});
