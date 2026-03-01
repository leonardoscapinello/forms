import { useMemo } from 'react';

/**
 * Renders text with {{variables}} and {{webhook:...}} highlighted
 * as colored inline spans. Used as a backdrop behind transparent inputs.
 */
export function VariableHighlightOverlay({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    if (!text) return [];
    const regex = /(\{\{.*?\}\})/g;
    const result: { text: string; isVar: boolean; varType: 'variable' | 'webhook' }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: text.slice(lastIndex, match.index), isVar: false, varType: 'variable' });
      }
      const isWebhook = match[1].startsWith('{{webhook:');
      result.push({ text: match[1], isVar: true, varType: isWebhook ? 'webhook' : 'variable' });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), isVar: false, varType: 'variable' });
    }
    return result;
  }, [text]);

  if (!text) return null;

  return (
    <div
      className={className}
      aria-hidden="true"
    >
      {parts.map((part, i) =>
        part.isVar ? (
          <mark
            key={i}
            className={
              part.varType === 'webhook'
                ? 'var-highlight var-highlight-webhook'
                : 'var-highlight var-highlight-variable'
            }
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </div>
  );
}
