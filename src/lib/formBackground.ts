import type { CSSProperties } from 'react';
import type { FormStyle } from '@/types/form';

export const DEFAULT_FORM_BACKGROUND_COLOR = '#FAFAFA';

/**
 * Image backgrounds always keep an explicit solid fallback. Besides avoiding a
 * white flash, this preserves a usable canvas when the image is slow or fails.
 */
export function ensureImageBackgroundFallback<T extends Partial<FormStyle>>(style: T): T & { backgroundColor: string } {
  return {
    ...style,
    backgroundColor: style.backgroundColor || DEFAULT_FORM_BACKGROUND_COLOR,
  };
}

export function normalizeBackgroundColor(value?: string): string {
  const color = value || DEFAULT_FORM_BACKGROUND_COLOR;
  return color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl(') || color === 'transparent'
    ? color
    : `hsl(${color})`;
}

/** Shared rendering contract for editor/public form canvases. */
export function buildFormBackgroundStyle(
  formStyle?: Partial<FormStyle>,
  pageBackgroundColor?: string,
): CSSProperties {
  const backgroundColor = normalizeBackgroundColor(pageBackgroundColor || formStyle?.backgroundColor);

  if (formStyle?.backgroundType === 'gradient' && formStyle.backgroundGradient) {
    return { background: formStyle.backgroundGradient };
  }

  if (formStyle?.backgroundType === 'image' && formStyle.backgroundImage) {
    return {
      backgroundColor,
      backgroundImage: `url(${formStyle.backgroundImage})`,
      backgroundSize: formStyle.backgroundSize || 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }

  return { backgroundColor };
}
