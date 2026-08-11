export const FORM_SCREEN_TRANSITION_MS = 550;

/** AnimatePresence `mode="wait"` completes the exit and then the entrance. */
export function getRedirectNavigationDelay(reduceMotion: boolean): number {
  return reduceMotion ? 0 : (FORM_SCREEN_TRANSITION_MS * 2) + 80;
}

export function getFormScreenKey(
  finished: boolean,
  currentPageIndex: number | null,
  currentPageId?: string,
): string {
  if (finished) return 'thank-you';
  if (currentPageIndex === null) return 'welcome';
  return `page:${currentPageId || currentPageIndex}`;
}

export function getFormScreenMotion(reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      variants: {
        enter: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
        center: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
      },
      transition: { duration: 0 },
    };
  }

  return {
    variants: {
      enter: (direction: number) => ({
        opacity: 0,
        y: direction >= 0 ? 28 : -28,
        scale: 0.985,
        filter: 'blur(2px)',
      }),
      center: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
      },
      exit: (direction: number) => ({
        opacity: 0,
        y: direction >= 0 ? -20 : 20,
        scale: 0.99,
        filter: 'blur(1px)',
      }),
    },
    transition: { duration: FORM_SCREEN_TRANSITION_MS / 1000, ease: [0.16, 1, 0.3, 1] as const },
  };
}
