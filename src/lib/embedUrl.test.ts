import { describe, expect, it } from 'vitest';
import { normalizeVideoEmbedUrl } from './embedUrl';

describe('normalizeVideoEmbedUrl', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeVideoEmbedUrl(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://evil.example/video',
    'not-a-url',
  ])('rejects unsafe or unsupported source %s', (input) => {
    expect(normalizeVideoEmbedUrl(input)).toBe('');
  });
});
