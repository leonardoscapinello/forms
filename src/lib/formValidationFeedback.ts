const FIELD_ATTRIBUTE = 'data-form-field-id';

const USABLE_CONTROL_SELECTOR = [
  '[data-form-primary-control]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  'button',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

const shakeAnimations = new WeakMap<HTMLElement, Animation>();

function isUsableControl(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.closest('[hidden], [aria-hidden="true"]')) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  if ('disabled' in element && Boolean((element as HTMLButtonElement).disabled)) return false;
  if (element.getAttribute('tabindex') === '-1') return false;
  return true;
}

function findField(root: ParentNode, elementId: string): HTMLElement | null {
  // Do not interpolate elementId into a selector. Imported forms may contain
  // punctuation that is meaningful to CSS selectors.
  return Array.from(root.querySelectorAll<HTMLElement>(`[${FIELD_ATTRIBUTE}]`))
    .find((candidate) => candidate.getAttribute(FIELD_ATTRIBUTE) === elementId) ?? null;
}

function findFirstUsableControl(field: HTMLElement): HTMLElement | null {
  const invalidControl = Array.from(field.querySelectorAll<HTMLElement>('[aria-invalid="true"]'))
    .find(isUsableControl);
  if (invalidControl) return invalidControl;

  const primaryControl = Array.from(field.querySelectorAll<HTMLElement>('[data-form-primary-control]'))
    .find(isUsableControl);
  if (primaryControl) return primaryControl;

  return Array.from(field.querySelectorAll<HTMLElement>(USABLE_CONTROL_SELECTOR))
    .find(isUsableControl) ?? null;
}

function stopPreviousShake(field: HTMLElement) {
  shakeAnimations.get(field)?.cancel();
  shakeAnimations.delete(field);
  field.classList.remove('animate-shake');
}

function shake(field: HTMLElement) {
  stopPreviousShake(field);

  if (typeof field.animate === 'function') {
    const animation = field.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8px)', offset: 0.15 },
      { transform: 'translateX(6px)', offset: 0.3 },
      { transform: 'translateX(-5px)', offset: 0.45 },
      { transform: 'translateX(4px)', offset: 0.6 },
      { transform: 'translateX(-2px)', offset: 0.75 },
      { transform: 'translateX(1px)', offset: 0.9 },
      { transform: 'translateX(0)' },
    ], {
      duration: 500,
      easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
    });
    shakeAnimations.set(field, animation);
    return;
  }

  // Web Animations is available in supported browsers. This deterministic
  // fallback restarts the CSS animation without a timer for older engines.
  field.classList.remove('animate-shake');
  void field.offsetWidth;
  field.classList.add('animate-shake');
}

export interface InvalidFieldFeedbackOptions {
  root: ParentNode;
  elementId: string;
  prefersReducedMotion: boolean;
}

export interface InvalidFieldFeedbackResult {
  field: HTMLElement;
  control: HTMLElement | null;
  attempt: number;
}

/**
 * Reveals the first invalid field and moves keyboard focus to its first usable
 * control. Calling it again for the same field always restarts the feedback.
 */
export function revealInvalidFormField({
  root,
  elementId,
  prefersReducedMotion,
}: InvalidFieldFeedbackOptions): InvalidFieldFeedbackResult | null {
  const field = findField(root, elementId);
  if (!field) return null;

  const attempt = Number.parseInt(field.dataset.validationFeedbackAttempt || '0', 10) + 1;
  field.dataset.validationFeedbackAttempt = String(attempt);

  if (prefersReducedMotion) stopPreviousShake(field);
  else shake(field);

  field.scrollIntoView?.({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'center',
    inline: 'nearest',
  });

  const control = findFirstUsableControl(field);
  if (control) {
    try {
      control.focus({ preventScroll: true });
    } catch {
      control.focus();
    }
  }

  return { field, control, attempt };
}
