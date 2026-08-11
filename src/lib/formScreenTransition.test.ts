import { describe, expect, it } from 'vitest';
import {
  FORM_SCREEN_TRANSITION_MS,
  getFormScreenKey,
  getFormScreenMotion,
  getRedirectNavigationDelay,
} from './formScreenTransition';

describe('form screen transitions', () => {
  it('gives welcome, every page and thank-you distinct identities', () => {
    expect(getFormScreenKey(false, null)).toBe('welcome');
    expect(getFormScreenKey(false, 0, 'page-one')).toBe('page:page-one');
    // Completion must win over the retained last page index.
    expect(getFormScreenKey(true, 0, 'page-one')).toBe('thank-you');
  });

  it('uses directional movement normally and removes motion when requested', () => {
    const regular = getFormScreenMotion(false);
    expect((regular.variants.enter as (direction: number) => { y: number })(1).y).toBeGreaterThan(0);
    expect((regular.variants.exit as (direction: number) => { y: number })(-1).y).toBeGreaterThan(0);
    expect(regular.transition.duration).toBe(FORM_SCREEN_TRANSITION_MS / 1000);

    const reduced = getFormScreenMotion(true);
    expect(reduced.transition.duration).toBe(0);
    expect(reduced.variants.enter).toMatchObject({ opacity: 1, y: 0, scale: 1 });
    expect(reduced.variants.exit).toMatchObject({ opacity: 1, y: 0, scale: 1 });
  });

  it('waits for both exit and thank-you entrance before navigating away', () => {
    expect(getRedirectNavigationDelay(false)).toBe((FORM_SCREEN_TRANSITION_MS * 2) + 80);
    expect(getRedirectNavigationDelay(true)).toBe(0);
  });
});
