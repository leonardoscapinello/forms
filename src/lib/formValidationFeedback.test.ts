import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealInvalidFormField } from './formValidationFeedback';

describe('revealInvalidFormField', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('finds an opaque field id safely, centers it, focuses its invalid control and restarts shake', () => {
    const field = document.createElement('section');
    field.setAttribute('data-form-field-id', 'lead"] [data-form-field-id="decoy');
    const disabled = document.createElement('button');
    disabled.disabled = true;
    const input = document.createElement('input');
    input.setAttribute('aria-invalid', 'true');
    field.append(disabled, input);
    document.body.append(field);

    const scrollIntoView = vi.fn();
    field.scrollIntoView = scrollIntoView;
    const firstCancel = vi.fn();
    const secondCancel = vi.fn();
    const animate = vi.fn()
      .mockReturnValueOnce({ cancel: firstCancel } as unknown as Animation)
      .mockReturnValueOnce({ cancel: secondCancel } as unknown as Animation);
    field.animate = animate;

    const first = revealInvalidFormField({
      root: document,
      elementId: 'lead"] [data-form-field-id="decoy',
      prefersReducedMotion: false,
    });
    const second = revealInvalidFormField({
      root: document,
      elementId: 'lead"] [data-form-field-id="decoy',
      prefersReducedMotion: false,
    });

    expect(first).toMatchObject({ field, control: input, attempt: 1 });
    expect(second).toMatchObject({ field, control: input, attempt: 2 });
    expect(document.activeElement).toBe(input);
    expect(scrollIntoView).toHaveBeenNthCalledWith(1, {
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
    expect(animate).toHaveBeenCalledTimes(2);
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(field.dataset.validationFeedbackAttempt).toBe('2');
  });

  it('uses immediate scrolling and suppresses shake for reduced motion', () => {
    const field = document.createElement('section');
    field.setAttribute('data-form-field-id', 'date-of-birth');
    const button = document.createElement('button');
    field.append(button);
    document.body.append(field);

    const scrollIntoView = vi.fn();
    const animate = vi.fn();
    field.scrollIntoView = scrollIntoView;
    field.animate = animate;

    const result = revealInvalidFormField({
      root: document.body,
      elementId: 'date-of-birth',
      prefersReducedMotion: true,
    });

    expect(result?.control).toBe(button);
    expect(button).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest',
    });
    expect(animate).not.toHaveBeenCalled();
    expect(field).not.toHaveClass('animate-shake');
  });

  it('returns null when the requested field is outside the current screen root', () => {
    const currentScreen = document.createElement('div');
    const otherScreen = document.createElement('div');
    otherScreen.setAttribute('data-form-field-id', 'other-page-field');
    document.body.append(currentScreen, otherScreen);

    expect(revealInvalidFormField({
      root: currentScreen,
      elementId: 'other-page-field',
      prefersReducedMotion: false,
    })).toBeNull();
  });
});
