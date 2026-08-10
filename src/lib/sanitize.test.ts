import { describe, expect, it } from 'vitest';
import { sanitizeRichTextHtml } from './sanitize';
import { interpolateTextToHtml } from './variableInterpolation';

describe('sanitizeRichTextHtml', () => {
  it('removes executable markup and unsafe CSS while preserving formatting', () => {
    const dirty = '<script>alert(1)</script><img src=x onerror=alert(1)><b style="color: red; background-image: url(https://evil.test)">Olá</b>';

    expect(sanitizeRichTextHtml(dirty)).toBe('<b style="color: red">Olá</b>');
  });

  it('escapes interpolated answers before rendering rich text', () => {
    const html = interpolateTextToHtml(
      '<strong>{{field:name}}</strong>',
      [],
      { name: '<img src=x onerror=alert(1)>' },
    );

    expect(html).toBe('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>');
  });
});
