import { describe, expect, it } from 'vitest';
import { RATING_STYLE_COLORS, resolveRatingActiveColor } from './ratingStyle';

describe('rating style colors', () => {
  it('uses a distinct semantic default for every built-in rating style', () => {
    expect(RATING_STYLE_COLORS.star).not.toBe(RATING_STYLE_COLORS.heart);
    expect(RATING_STYLE_COLORS.heart).not.toBe(RATING_STYLE_COLORS.thumbsUp);
    expect(RATING_STYLE_COLORS.thumbsUp).not.toBe(RATING_STYLE_COLORS.numeric);
  });

  it('migrates the legacy yellow default when the icon style changes', () => {
    expect(resolveRatingActiveColor('heart', '#facc15')).toBe(RATING_STYLE_COLORS.heart);
    expect(resolveRatingActiveColor('thumbsUp', '#facc15')).toBe(RATING_STYLE_COLORS.thumbsUp);
  });

  it('preserves an explicitly customized color', () => {
    expect(resolveRatingActiveColor('heart', '#facc15', true)).toBe('#facc15');
    expect(resolveRatingActiveColor('star', '#123456')).toBe('#123456');
  });
});
