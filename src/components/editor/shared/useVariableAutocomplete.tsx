import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FormVariable, IntegrationNodeData, TrackedParam, DEFAULT_TRACKED_PARAMS } from '@/types/form';
import { cn } from '@/lib/utils';
import { Webhook, Variable, Replace, FileText, Globe, Monitor } from 'lucide-react';
import { CONTEXT_KEYS } from '@/lib/sessionContext';
import type { InputElementGroup } from '../VariableAssignPanel';

export interface AutocompleteItem {
  id: string;
  label: string;
  syntax: string;
  category: 'variable' | 'webhook' | 'field' | 'context' | 'param';
  detail?: string;
  group?: string;
}

interface Props {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  localValue: string;
  setLocalValue: (v: string) => void;
  onCommit: (v: string) => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
}

/** Find the {{...}} token that contains the given cursor position */
function findTokenAtCursor(text: string, cursor: number): { start: number; end: number; content: string } | null {
  const regex = /\{\{.*?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (cursor >= m.index && cursor <= m.index + m[0].length) {
      return { start: m.index, end: m.index + m[0].length, content: m[0] };
    }
  }
  return null;
}

export function useVariableAutocomplete({
  inputRef,
  localValue,
  setLocalValue,
  onCommit,
  variables = [],
  integrationNodes = [],
  allInputElements = [],
  trackedParams,
}: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [triggerPos, setTriggerPos] = useState<number | null>(null);

  // Replace mode: when clicking on an existing token
  const [replaceRange, setReplaceRange] = useState<{ start: number; end: number } | null>(null);
  const [showReplace, setShowReplace] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Update dropdown position based on input element
  const updateDropdownPos = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [inputRef]);

  const webhookNodesWithFields = useMemo(
    () => (integrationNodes || []).filter(n => (n.responseFields?.length ?? 0) > 0),
    [integrationNodes]
  );

  const activeParams = useMemo(() => {
    const params = trackedParams ?? DEFAULT_TRACKED_PARAMS;
    return params.filter(p => p.enabled && p.key);
  }, [trackedParams]);

  const allItems = useMemo<AutocompleteItem[]>(() => {
    const items: AutocompleteItem[] = [];
    for (const v of variables) {
      items.push({
        id: `var-${v.id}`,
        label: v.name,
        syntax: `{{${v.name}}}`,
        category: 'variable',
        detail: v.type,
      });
    }
    for (const group of allInputElements) {
      for (const el of group.elements) {
        items.push({
          id: `field-${el.elementId}`,
          label: el.elementLabel,
          syntax: `{{field:${el.elementId}}}`,
          category: 'field',
          detail: group.pageTitle,
          group: group.pageTitle,
        });
      }
    }
    for (const wn of webhookNodesWithFields) {
      const host = wn.webhookUrl
        ? (() => { try { return new URL(wn.webhookUrl).hostname; } catch { return wn.id.slice(0, 8); } })()
        : wn.id.slice(0, 8);
      for (const field of wn.responseFields || []) {
        items.push({
          id: `wh-${wn.id}-${field}`,
          label: field,
          syntax: `{{webhook:${wn.id}:${field}}}`,
          category: 'webhook',
          detail: host,
        });
      }
    }
    for (const p of activeParams) {
      items.push({
        id: `param-${p.id}`,
        label: p.label || p.key,
        syntax: `{{param.${p.key}}}`,
        category: 'param',
        detail: p.key,
      });
    }
    for (const ctx of CONTEXT_KEYS) {
      items.push({
        id: `ctx-${ctx.key}`,
        label: ctx.label,
        syntax: `{{ctx.${ctx.key}}}`,
        category: 'context',
        detail: ctx.category,
      });
    }
    return items;
  }, [variables, allInputElements, webhookNodesWithFields, activeParams]);

  const filtered = useMemo(() => {
    if (!filter) return allItems;
    const lower = filter.toLowerCase();
    return allItems.filter(
      item => item.label.toLowerCase().includes(lower) || item.detail?.toLowerCase().includes(lower)
    );
  }, [allItems, filter]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered.length]);

  const checkTrigger = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/\{\{([^{}]*)$/);
    if (match && allItems.length > 0) {
      setShowDropdown(true);
      setShowReplace(false);
      setFilter(match[1]);
      setTriggerPos(cursorPos - match[0].length);
      updateDropdownPos();
    } else {
      setShowDropdown(false);
      setFilter('');
      setTriggerPos(null);
    }
  }, [allItems.length]);

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue);
    setShowReplace(false);
    setReplaceRange(null);
    const el = inputRef.current;
    const cursorPos = el?.selectionStart ?? newValue.length;
    requestAnimationFrame(() => {
      const pos = el?.selectionStart ?? cursorPos;
      checkTrigger(newValue, pos);
    });
  }, [setLocalValue, inputRef, checkTrigger]);

  const insertItem = useCallback((item: AutocompleteItem) => {
    if (triggerPos === null) return;
    const el = inputRef.current;
    const cursorPos = el?.selectionStart ?? localValue.length;
    const before = localValue.slice(0, triggerPos);
    const after = localValue.slice(cursorPos);
    const next = before + item.syntax + after;
    setLocalValue(next);
    onCommit(next);
    setShowDropdown(false);
    setFilter('');
    setTriggerPos(null);
    requestAnimationFrame(() => {
      el?.focus();
      const newPos = triggerPos + item.syntax.length;
      el?.setSelectionRange(newPos, newPos);
    });
  }, [triggerPos, localValue, setLocalValue, onCommit, inputRef]);

  const replaceItem = useCallback((item: AutocompleteItem) => {
    if (!replaceRange) return;
    const el = inputRef.current;
    const before = localValue.slice(0, replaceRange.start);
    const after = localValue.slice(replaceRange.end);
    const next = before + item.syntax + after;
    setLocalValue(next);
    onCommit(next);
    setShowReplace(false);
    setReplaceRange(null);
    requestAnimationFrame(() => {
      el?.focus();
      const newPos = replaceRange.start + item.syntax.length;
      el?.setSelectionRange(newPos, newPos);
    });
  }, [replaceRange, localValue, setLocalValue, onCommit, inputRef]);

  /** Call this on click/mouseup to detect if cursor is inside a {{token}} */
  const handleClick = useCallback(() => {
    if (showDropdown) return;
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? 0;
    if (el.selectionStart !== el.selectionEnd) return;

    const token = findTokenAtCursor(localValue, cursor);
    if (token && allItems.length > 0) {
      setReplaceRange({ start: token.start, end: token.end });
      setShowReplace(true);
      setFilter('');
      updateDropdownPos();
      requestAnimationFrame(() => {
        el.setSelectionRange(token.start, token.end);
      });
    } else {
      setShowReplace(false);
      setReplaceRange(null);
    }
  }, [showDropdown, inputRef, localValue, allItems.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showReplace && allItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => (prev + 1) % allItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => (prev - 1 + allItems.length) % allItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        replaceItem(allItems[selectedIdx]);
      } else if (e.key === 'Escape') {
        setShowReplace(false);
        setReplaceRange(null);
      }
      return;
    }

    if (!showDropdown || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertItem(filtered[selectedIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }, [showDropdown, showReplace, filtered, allItems, selectedIdx, insertItem, replaceItem]);

  const dismiss = useCallback(() => {
    setShowDropdown(false);
    setShowReplace(false);
    setFilter('');
    setTriggerPos(null);
    setReplaceRange(null);
  }, []);

  const itemList = showReplace ? allItems : filtered;
  const isVisible = (showDropdown && filtered.length > 0) || (showReplace && allItems.length > 0);

  const categoryIcon = (cat: AutocompleteItem['category']) => {
    switch (cat) {
      case 'variable': return <Variable className="h-3 w-3 text-primary flex-shrink-0" />;
      case 'field': return <FileText className="h-3 w-3 text-node-whatsapp-accent flex-shrink-0" />;
      case 'param': return <Globe className="h-3 w-3 text-orange-500 flex-shrink-0" />;
      case 'context': return <Monitor className="h-3 w-3 text-blue-500 flex-shrink-0" />;
      case 'webhook': return <Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />;
    }
  };

  const DropdownUI = isVisible && dropdownPos ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 9999,
      }}
      className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="px-2 py-1.5 border-b border-border bg-muted/30 flex items-center gap-1.5">
        {showReplace ? (
          <>
            <Replace className="h-3 w-3 text-primary" />
            <p className="text-[10px] text-muted-foreground font-medium">Trocar variável</p>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground font-medium">
            Variáveis disponíveis {filter && <span className="text-primary">· "{filter}"</span>}
          </p>
        )}
      </div>
      <div className="max-h-[200px] overflow-y-auto p-1">
        {itemList.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
              idx === selectedIdx ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted'
            )}
            onClick={() => showReplace ? replaceItem(item) : insertItem(item)}
            onMouseEnter={() => setSelectedIdx(idx)}
          >
            {categoryIcon(item.category)}
            <span className="font-mono text-[11px] font-medium truncate flex-1">{item.label}</span>
            {item.detail && (
              <span className="text-[9px] text-muted-foreground flex-shrink-0">{item.detail}</span>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return {
    handleChange,
    handleKeyDown,
    handleClick,
    dismiss,
    showDropdown: showDropdown || showReplace,
    DropdownUI,
  };
}
