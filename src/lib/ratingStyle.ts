import type { RatingIconStyle } from '@/types/pageElements';

export const RATING_STYLE_COLORS: Record<RatingIconStyle, string> = {
  star: '#f5b301',
  heart: '#e11d48',
  thumbsUp: '#2563eb',
  emoji: '#f59e0b',
  numeric: '#7c3aed',
  nps: '#16a34a',
};

export function resolveRatingActiveColor(
  style: RatingIconStyle,
  configuredColor?: string,
  explicitlyCustomized?: boolean,
): string {
  const normalized = configuredColor?.trim().toLowerCase();
  const isLegacyStarDefault = normalized === '#facc15' || normalized === '#f5b301';
  const shouldUseConfigured = explicitlyCustomized === true
    || (explicitlyCustomized !== false && !!normalized && !isLegacyStarDefault);
  return shouldUseConfigured ? configuredColor! : RATING_STYLE_COLORS[style];
}

export function ratingGlow(color: string): string {
  return `drop-shadow(0 2px 2px ${color}55) drop-shadow(0 5px 8px ${color}35)`;
}
