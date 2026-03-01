import { useMemo } from 'react';

type VarType = 'variable' | 'webhook' | 'field' | 'param' | 'context';

export type ElementLookup = Record<string, string>; // elementId → label

export function formatFieldTokensForDisplay(text: string, elementLookup?: ElementLookup): string {
  if (!text) return text;
  return text.replace(/\{\{field:([^}]+)\}\}/g, (raw, elementId: string) => {
    const label = elementLookup?.[elementId];
    return label ? `{{${label}}}` : raw;
  });
}

/**
 * Renders text with {{variables}}, {{field:...}}, {{webhook:...}} etc. highlighted
 * as colored inline spans. When an elementLookup is provided, field references
 * show the human-readable label instead of the raw UUID.
 */
export function VariableHighlightOverlay({
  text,
  className,
  elementLookup,
}: {
  text: string;
  className?: string;
  elementLookup?: ElementLookup;
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

      result.push({ text: raw, display: raw, isVar: true, varType });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), display: text.slice(lastIndex), isVar: false, varType: 'variable' });
    }
    return result;
  }, [text, elementLookup]);

  if (!text) return null;

  const varTypeClass: Record<VarType, string> = {
    variable: 'var-highlight var-highlight-variable',
    webhook: 'var-highlight var-highlight-webhook',
    field: 'var-highlight var-highlight-field',
    param: 'var-highlight var-highlight-param',
    context: 'var-highlight var-highlight-context',
  };

  return (
    <div className={className} aria-hidden="true">
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
