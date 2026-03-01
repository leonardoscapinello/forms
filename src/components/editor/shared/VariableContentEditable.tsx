import React, { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { cn } from '@/lib/utils';

export type VarType = 'variable' | 'webhook' | 'field' | 'param' | 'context';

export interface VarTokenInfo {
  label: string;
  varType: VarType;
}

export interface AutocompleteTriggerInfo {
  filter: string;
  x: number;
  y: number;
  textNode: Text;
  start: number;
  end: number;
}

export interface VariableContentEditableRef {
  insertToken: (raw: string) => void;
  replaceRangeWithToken: (textNode: Text, start: number, end: number, raw: string) => void;
  insertAtCursor: (text: string) => void;
  wrapSelection: (prefix: string, suffix: string, fallback?: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  resolveToken: (raw: string) => VarTokenInfo;
  onAutocompleteTrigger?: (info: AutocompleteTriggerInfo) => void;
  onAutocompleteDismiss?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const VAR_REGEX = /(\{\{.*?\}\})/g;

const VAR_TYPE_CLASSES: Record<VarType, string> = {
  variable: 'var-token var-token-variable',
  webhook: 'var-token var-token-webhook',
  field: 'var-token var-token-field',
  param: 'var-token var-token-param',
  context: 'var-token var-token-context',
};

function serializeToRaw(container: HTMLElement): string {
  let result = '';
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
    } else if (node instanceof HTMLElement) {
      const raw = node.getAttribute('data-raw');
      if (raw) {
        result += raw;
      } else if (node.tagName === 'BR') {
        result += '\n';
      } else {
        result += serializeToRaw(node);
      }
    }
  }
  return result;
}

export const VariableContentEditable = forwardRef<VariableContentEditableRef, Props>(({
  value,
  onChange,
  placeholder,
  multiline = false,
  rows,
  className,
  resolveToken,
  onAutocompleteTrigger,
  onAutocompleteDismiss,
  onKeyDown: onKeyDownProp,
  onFocus,
  onBlur,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocusedRef = useRef(false);
  const lastRawRef = useRef(value);
  const savedRangeRef = useRef<Range | null>(null);

  const createTokenSpan = useCallback((raw: string) => {
    const info = resolveToken(raw);
    const span = document.createElement('span');
    span.setAttribute('data-raw', raw);
    span.setAttribute('contenteditable', 'false');
    span.className = VAR_TYPE_CLASSES[info.varType] || VAR_TYPE_CLASSES.variable;
    span.textContent = info.label;
    return span;
  }, [resolveToken]);

  const buildDOM = useCallback((container: HTMLElement, raw: string) => {
    container.innerHTML = '';
    if (!raw) {
      container.appendChild(document.createTextNode(''));
      return;
    }
    const parts = raw.split(VAR_REGEX);
    for (const part of parts) {
      if (!part) continue;
      VAR_REGEX.lastIndex = 0;
      if (VAR_REGEX.test(part)) {
        VAR_REGEX.lastIndex = 0;
        container.appendChild(createTokenSpan(part));
      } else if (multiline) {
        const lines = part.split('\n');
        lines.forEach((line, i) => {
          if (i > 0) container.appendChild(document.createElement('br'));
          if (line) container.appendChild(document.createTextNode(line));
        });
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
    // Ensure trailing text node for cursor placement
    const last = container.lastChild;
    if (!last || last.nodeType !== Node.TEXT_NODE) {
      container.appendChild(document.createTextNode(''));
    }
  }, [createTokenSpan, multiline]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (isFocusedRef.current && lastRawRef.current === value) return;
    lastRawRef.current = value;
    buildDOM(editorRef.current, value);
  }, [value, buildDOM]);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const raw = serializeToRaw(editorRef.current);
    lastRawRef.current = raw;
    onChange(raw);
  }, [onChange]);

  const checkAutocomplete = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !editorRef.current) {
      onAutocompleteDismiss?.();
      return;
    }
    const node = sel.focusNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !editorRef.current.contains(node)) {
      onAutocompleteDismiss?.();
      return;
    }
    const text = node.textContent || '';
    const cursor = sel.focusOffset;
    const before = text.slice(0, cursor);
    const triggerIdx = before.lastIndexOf('{{');
    if (triggerIdx >= 0) {
      const filterText = before.slice(triggerIdx + 2);
      if (!filterText.includes('}}') && !filterText.includes('\n')) {
        const range = document.createRange();
        range.setStart(node, triggerIdx);
        range.setEnd(node, cursor);
        const rect = range.getBoundingClientRect();
        onAutocompleteTrigger?.({
          filter: filterText,
          x: rect.left,
          y: rect.bottom,
          textNode: node as Text,
          start: triggerIdx,
          end: cursor,
        });
        return;
      }
    }
    onAutocompleteDismiss?.();
  }, [onAutocompleteTrigger, onAutocompleteDismiss]);

  const handleInput = useCallback(() => {
    emitChange();
    checkAutocomplete();
  }, [emitChange, checkAutocomplete]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();

    // Let parent handle first (for autocomplete navigation)
    onKeyDownProp?.(e);
    if (e.defaultPrevented) return;

    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      return;
    }

    // Atomic delete of var tokens
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const sel = window.getSelection();
      if (!sel) return;

      // When there's a selection, delete contents including tokens
      if (!sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const container = editorRef.current;
        if (container) {
          const tokens = container.querySelectorAll('[data-raw]');
          const hasToken = Array.from(tokens).some(t => range.intersectsNode(t));
          if (hasToken) {
            e.preventDefault();
            range.deleteContents();
            container.normalize();
            if (!container.childNodes.length) {
              container.appendChild(document.createTextNode(''));
            }
            emitChange();
            return;
          }
        }
        return;
      }

      const node = sel.focusNode;
      const offset = sel.focusOffset;

      if (e.key === 'Backspace' && node) {
        let prev: Node | null = null;
        if (node.nodeType === Node.TEXT_NODE && offset === 0) {
          prev = node.previousSibling;
        } else if (node === editorRef.current) {
          prev = node.childNodes[offset - 1] || null;
        }
        if (prev instanceof HTMLElement && prev.hasAttribute('data-raw')) {
          e.preventDefault();
          prev.remove();
          emitChange();
          return;
        }
      }

      if (e.key === 'Delete' && node) {
        let next: Node | null = null;
        if (node.nodeType === Node.TEXT_NODE && offset === (node.textContent?.length ?? 0)) {
          next = node.nextSibling;
        } else if (node === editorRef.current) {
          next = node.childNodes[offset] || null;
        }
        if (next instanceof HTMLElement && next.hasAttribute('data-raw')) {
          e.preventDefault();
          next.remove();
          emitChange();
          return;
        }
      }
    }
  }, [multiline, emitChange, onKeyDownProp]);

  const insertToken = useCallback((raw: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const span = createTokenSpan(raw);
    const sel = window.getSelection();

    // Try live selection first, then fall back to saved range from before blur
    let range: Range | null = null;
    if (sel && sel.rangeCount > 0 && editor.contains(sel.focusNode)) {
      range = sel.getRangeAt(0);
    } else if (savedRangeRef.current && editor.contains(savedRangeRef.current.startContainer)) {
      range = savedRangeRef.current;
    }

    if (range) {
      // Restore selection into editor if needed
      editor.focus();
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(range);

      range.deleteContents();
      range.insertNode(span);
      // Ensure text node after span
      if (!span.nextSibling || span.nextSibling.nodeType !== Node.TEXT_NODE) {
        span.parentNode?.insertBefore(document.createTextNode(''), span.nextSibling);
      }
      const r2 = document.createRange();
      r2.setStartAfter(span);
      r2.collapse(true);
      s.removeAllRanges();
      s.addRange(r2);
    } else {
      editor.appendChild(span);
      editor.appendChild(document.createTextNode(''));
      editor.focus();
    }
    savedRangeRef.current = null;
    emitChange();
  }, [createTokenSpan, emitChange]);

  const replaceRangeWithToken = useCallback((textNode: Text, start: number, end: number, raw: string) => {
    const editor = editorRef.current;
    if (!editor || !editor.contains(textNode)) return;

    const before = textNode.textContent?.slice(0, start) ?? '';
    const after = textNode.textContent?.slice(end) ?? '';
    const span = createTokenSpan(raw);
    const parent = textNode.parentNode!;

    if (before) {
      parent.insertBefore(document.createTextNode(before), textNode);
    }
    parent.insertBefore(span, textNode);
    const afterNode = document.createTextNode(after || '');
    parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);

    // Place cursor after token
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.setStart(afterNode, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    emitChange();
    editor.focus();
  }, [createTokenSpan, emitChange]);

  const insertAtCursor = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    // Restore saved range if editor lost focus (e.g. popover click)
    const sel = window.getSelection();
    if (savedRangeRef.current && editor.contains(savedRangeRef.current.startContainer) && !(sel && sel.rangeCount > 0 && editor.contains(sel.focusNode))) {
      editor.focus();
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(savedRangeRef.current);
      savedRangeRef.current = null;
    } else {
      editor.focus();
    }
    document.execCommand('insertText', false, text);
    emitChange();
  }, [emitChange]);

  const wrapSelection = useCallback((prefix: string, suffix: string, fallback = 'texto') => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const selectedText = sel.toString() || fallback;
    const wrapped = prefix + selectedText + suffix;

    document.execCommand('insertText', false, wrapped);

    // Select the inner text (between prefix and suffix)
    requestAnimationFrame(() => {
      const newSel = window.getSelection();
      if (!newSel || !newSel.focusNode) return;
      const node = newSel.focusNode;
      const end = newSel.focusOffset;
      const innerStart = end - suffix.length - selectedText.length;
      const innerEnd = end - suffix.length;
      if (node.nodeType === Node.TEXT_NODE && innerStart >= 0) {
        const range = document.createRange();
        range.setStart(node, innerStart);
        range.setEnd(node, innerEnd);
        newSel.removeAllRanges();
        newSel.addRange(range);
      }
    });

    emitChange();
  }, [emitChange]);

  useImperativeHandle(ref, () => ({
    insertToken,
    replaceRangeWithToken,
    insertAtCursor,
    wrapSelection,
    focus: () => editorRef.current?.focus(),
  }), [insertToken, replaceRangeWithToken, insertAtCursor, wrapSelection]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emitChange();
    setTimeout(checkAutocomplete, 0);
  }, [emitChange, checkAutocomplete]);

  const isEmpty = !value;
  const minHeight = multiline ? `${Math.max((rows ?? 2), 2) * 1.5}rem` : undefined;

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={() => { isFocusedRef.current = true; onFocus?.(); }}
      onBlur={() => {
        // Save selection range before losing focus (for insert-at-cursor after popover click)
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.focusNode)) {
          savedRangeRef.current = sel.getRangeAt(0).cloneRange();
        }
        isFocusedRef.current = false;
        onBlur?.();
        onAutocompleteDismiss?.();
      }}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onClick={() => checkAutocomplete()}
      data-placeholder={placeholder}
      className={cn(
        'variable-content-editable nodrag nopan nowheel w-full min-w-0 max-w-full',
        'rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        multiline ? 'whitespace-pre-wrap break-words' : 'whitespace-nowrap overflow-x-auto',
        isEmpty && 'is-empty',
        className,
      )}
      style={{ minHeight, outline: 'none', position: 'relative' }}
    />
  );
});

VariableContentEditable.displayName = 'VariableContentEditable';
