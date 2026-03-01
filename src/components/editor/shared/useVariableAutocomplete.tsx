import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FormVariable, IntegrationNodeData } from '@/types/form';
import { cn } from '@/lib/utils';
import { Webhook, Variable } from 'lucide-react';

export interface AutocompleteItem {
  id: string;
  label: string;
  syntax: string;
  category: 'variable' | 'webhook';
  detail?: string;
}

interface Props {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  localValue: string;
  setLocalValue: (v: string) => void;
  onCommit: (v: string) => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
}

/**
 * Hook that manages inline autocomplete state for {{ variable insertion.
 * Returns dropdown UI component and an onChange wrapper.
 */
export function useVariableAutocomplete({
  inputRef,
  localValue,
  setLocalValue,
  onCommit,
  variables = [],
  integrationNodes = [],
}: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [triggerPos, setTriggerPos] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const webhookNodesWithFields = useMemo(
    () => (integrationNodes || []).filter(n => (n.responseFields?.length ?? 0) > 0),
    [integrationNodes]
  );

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
    return items;
  }, [variables, webhookNodesWithFields]);

  const filtered = useMemo(() => {
    if (!filter) return allItems;
    const lower = filter.toLowerCase();
    return allItems.filter(
      item => item.label.toLowerCase().includes(lower) || item.detail?.toLowerCase().includes(lower)
    );
  }, [allItems, filter]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered.length]);

  const checkTrigger = useCallback((text: string, cursorPos: number) => {
    // Look backwards from cursor for {{ pattern
    const before = text.slice(0, cursorPos);
    const match = before.match(/\{\{([^{}]*)$/);
    if (match && allItems.length > 0) {
      setShowDropdown(true);
      setFilter(match[1]);
      setTriggerPos(cursorPos - match[0].length);
    } else {
      setShowDropdown(false);
      setFilter('');
      setTriggerPos(null);
    }
  }, [allItems.length]);

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue);
    const el = inputRef.current;
    const cursorPos = el?.selectionStart ?? newValue.length;
    // Use requestAnimationFrame to get updated cursor position
    requestAnimationFrame(() => {
      const pos = el?.selectionStart ?? cursorPos;
      checkTrigger(newValue, pos);
    });
  }, [setLocalValue, inputRef, checkTrigger]);

  const insertItem = useCallback((item: AutocompleteItem) => {
    if (triggerPos === null) return;
    const el = inputRef.current;
    const cursorPos = el?.selectionStart ?? localValue.length;
    // Replace from {{ to cursor with the full syntax
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
  }, [showDropdown, filtered, selectedIdx, insertItem]);

  const dismiss = useCallback(() => {
    setShowDropdown(false);
    setFilter('');
    setTriggerPos(null);
  }, []);

  const DropdownUI = showDropdown && filtered.length > 0 ? (
    <div
      ref={dropdownRef}
      className="absolute left-0 right-0 top-full mt-1 z-[300] bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="px-2 py-1.5 border-b border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground font-medium">
          Variáveis disponíveis {filter && <span className="text-primary">· "{filter}"</span>}
        </p>
      </div>
      <div className="max-h-[160px] overflow-y-auto p-1">
        {filtered.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
              idx === selectedIdx ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted'
            )}
            onClick={() => insertItem(item)}
            onMouseEnter={() => setSelectedIdx(idx)}
          >
            {item.category === 'variable' ? (
              <Variable className="h-3 w-3 text-primary flex-shrink-0" />
            ) : (
              <Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />
            )}
            <span className="font-mono text-[11px] font-medium truncate flex-1">{item.label}</span>
            {item.detail && (
              <span className="text-[9px] text-muted-foreground flex-shrink-0">{item.detail}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return {
    handleChange,
    handleKeyDown,
    dismiss,
    showDropdown,
    DropdownUI,
  };
}
