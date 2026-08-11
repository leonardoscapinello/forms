import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InteractiveElement from '@/components/preview/InteractiveElement';
import { createDefaultPageElement } from '@/types/pageElements';
import { hasUnansweredInputFields } from './FormPreview.utils';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('selection auto-advance guard', () => {
  it('does not advance after answering only one of three optional fields', () => {
    const rating = createDefaultPageElement('input_rating');
    const radio = createDefaultPageElement('input_radio');
    const text = createDefaultPageElement('input_text');
    rating.required = false;
    radio.required = false;
    text.required = false;

    expect(hasUnansweredInputFields([rating, radio, text], { [rating.id]: 5 })).toBe(true);
  });

  it('allows auto-advance only when the click filled the final empty field', () => {
    const rating = createDefaultPageElement('input_rating');
    const radio = createDefaultPageElement('input_radio');
    const text = createDefaultPageElement('input_text');
    const radioAnswer = radio.options?.[0]?.id || 'option';

    expect(hasUnansweredInputFields([rating, radio, text], {
      [rating.id]: 5,
      [radio.id]: radioAnswer,
      [text.id]: 'preenchido',
    })).toBe(false);
  });

  it('allows a page with one click-to-answer field after it is answered', () => {
    const rating = createDefaultPageElement('input_rating');
    rating.required = false;
    expect(hasUnansweredInputFields([rating], {})).toBe(true);
    expect(hasUnansweredInputFields([rating], { [rating.id]: 4 })).toBe(false);
  });

  it('never asks to auto-advance on the first multi-select toggle', async () => {
    vi.useFakeTimers();
    const multi = createDefaultPageElement('input_multi_select');
    multi.options = [
      { id: 'one', label: 'Um' },
      { id: 'two', label: 'Dois' },
    ];
    const onSelectionMade = vi.fn();

    render(
      <InteractiveElement
        element={multi}
        value={[]}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
        onSelectionMade={onSelectionMade}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Um/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(onSelectionMade).not.toHaveBeenCalled();
  });

  it('cancels a delayed auto-advance when the field leaves the page', async () => {
    vi.useFakeTimers();
    const radio = createDefaultPageElement('input_radio');
    radio.options = [{ id: 'one', label: 'Um' }];
    const onSelectionMade = vi.fn();

    const view = render(
      <InteractiveElement
        element={radio}
        value={undefined}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
        onSelectionMade={onSelectionMade}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Um/ }));
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(onSelectionMade).not.toHaveBeenCalled();
  });

  it('keeps only the latest auto-advance request after rapid choice changes', async () => {
    vi.useFakeTimers();
    const radio = createDefaultPageElement('input_radio');
    radio.options = [
      { id: 'one', label: 'Um' },
      { id: 'two', label: 'Dois' },
    ];
    const onSelectionMade = vi.fn();

    render(
      <InteractiveElement
        element={radio}
        value={undefined}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
        onSelectionMade={onSelectionMade}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Um/ }));
    fireEvent.click(screen.getByRole('button', { name: /Dois/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(onSelectionMade).toHaveBeenCalledOnce();
  });

  it('executes a configured finish action before considering a link', () => {
    const button = createDefaultPageElement('button');
    button.content = 'Concluir';
    button.buttonAction = 'finish';
    button.href = 'https://example.com/depois';
    const onNavigate = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    render(
      <InteractiveElement
        element={button}
        value={undefined}
        onChange={vi.fn()}
        stepNumber={1}
        onBlockedChange={vi.fn()}
        registerValidator={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    expect(onNavigate).toHaveBeenCalledWith('finish', undefined);
    expect(open).not.toHaveBeenCalled();
  });
});
