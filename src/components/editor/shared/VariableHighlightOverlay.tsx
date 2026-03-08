import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { CONTEXT_KEYS } from '@/lib/sessionContext';

type VarType = 'variable' | 'webhook' | 'field' | 'param' | 'context';

export type ElementLookup = Record<string, string>; // elementId → label

const CTX_LABEL_MAP: Record<string, string> = {};
for (const c of CONTEXT_KEYS) {
  CTX_LABEL_MAP[c.key] = c.label;
}

export function formatFieldTokensForDisplay(text: string, elementLookup?: ElementLookup): string {
  if (!text) return text;
  return text.replace(/\{\{field:([^}]+)\}\}/g, (raw, elementId: string) => {
    const label = elementLookup?.[elementId];
    return label ? `{{${label}}}` : raw;
  });
}

function getReadableDisplay(raw: string, varType: VarType, elementLookup?: ElementLookup): string {
  if (varType === 'field') {
    return formatFieldTokensForDisplay(raw, elementLookup);
  }
  if (varType === 'context') {
    // {{ctx.device}} → {{Dispositivo}}
    const key = raw.slice(6, -2); // remove {{ctx. and }}
    const label = CTX_LABEL_MAP[key];
    return label ? `{{${label}}}` : raw;
  }
  if (varType === 'param') {
    // {{param.utm_source}} → {{utm_source}}
    const key = raw.slice(8, -2); // remove {{param. and }}
    return `{{${key}}}`;
  }
  if (varType === 'webhook') {
    // {{webhook:id:field}} → {{field}}
    const parts = raw.slice(2, -2).split(':'); // webhook, id, field
    const fieldName = parts.length >= 3 ? parts.slice(2).join(':') : parts[parts.length - 1];
    return `{{${fieldName}}}`;
  }
  return raw;
}

/**
 * Renders text with {{variables}}, {{field:...}}, {{webhook:...}} etc. highlighted
 * as colored inline spans with human-readable labels.
 */
export function VariableHighlightOverlay({
  text,
  className,
  elementLookup,
  displayFieldLabels = false,
}: {
  text: string;
  className?: string;
  elementLookup?: ElementLookup;
  displayFieldLabels?: boolean;
}) {
  const parts = useMemo(() => {
    if (!text) return [];
    const regex = /(\{\{.*?\}\})/g;
    const result: { text: string; display: string; isVar: boolean; varType: VarType }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: text.slice(lastIndex, match.index), display: text.slice(lastIndex, match.index), isVar: false, varType: 'variable' });
      }

      const raw = match[1];
      let varType: VarType = 'variable';

      if (raw.startsWith('{{field:')) {
        varType = 'field';
      } else if (raw.startsWith('{{webhook:')) {
        varType = 'webhook';
      } else if (raw.startsWith('{{param.')) {
        varType = 'param';
      } else if (raw.startsWith('{{ctx.')) {
        varType = 'context';
      }

      const display = displayFieldLabels ? getReadableDisplay(raw, varType, elementLookup) : raw;

      result.push({ text: raw, display, isVar: true, varType });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), display: text.slice(lastIndex), isVar: false, varType: 'variable' });
    }
    return result;
  }, [text, elementLookup, displayFieldLabels]);

  if (!text) return null;

  const varTypeClass: Record<VarType, string> = {
    variable: 'var-highlight var-highlight-variable',
    webhook: 'var-highlight var-highlight-webhook',
    field: 'var-highlight var-highlight-field',
    param: 'var-highlight var-highlight-param',
    context: 'var-highlight var-highlight-context',
  };

  const isReadable = displayFieldLabels;

  return (
    <div className={cn(className, isReadable && 'var-highlight-readable')} aria-hidden={!isReadable}>
      {parts.map((part, i) =>
        part.isVar ? (
          <mark key={i} className={varTypeClass[part.varType]}>
            {part.display}
          </mark>
        ) : (
          <span key={i}>{part.display}</span>
        )
      )}
    </div>
  );
}
