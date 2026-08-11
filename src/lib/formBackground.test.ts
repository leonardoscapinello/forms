import { describe, expect, it } from 'vitest';
import {
  buildFormBackgroundStyle,
  DEFAULT_FORM_BACKGROUND_COLOR,
  ensureImageBackgroundFallback,
  normalizeBackgroundColor,
} from './formBackground';

describe('form background fallback', () => {
  it('persists a solid fallback when image mode is selected', () => {
    const saved = ensureImageBackgroundFallback({
      backgroundType: 'image' as const,
      backgroundImage: 'https://cdn.example.com/background.webp',
    });

    expect(saved.backgroundColor).toBe(DEFAULT_FORM_BACKGROUND_COLOR);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  it('keeps the chosen fallback behind the image in the rendered style', () => {
    expect(buildFormBackgroundStyle({
      backgroundType: 'image',
      backgroundColor: '#123456',
      backgroundImage: 'https://cdn.example.com/background.webp',
      backgroundSize: 'contain',
    })).toEqual({
      backgroundColor: '#123456',
      backgroundImage: 'url(https://cdn.example.com/background.webp)',
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    });
  });

  it('normalizes legacy HSL tokens and falls back safely', () => {
    expect(normalizeBackgroundColor('210 20% 98%')).toBe('hsl(210 20% 98%)');
    expect(normalizeBackgroundColor()).toBe(DEFAULT_FORM_BACKGROUND_COLOR);
  });
});
