import { CONTEXT_KEYS } from '@/lib/sessionContext';
import type { ElementLookup } from '../shared/variableDisplay';

export function parseWhatsAppMarkdown(text: string, elementLookup?: ElementLookup): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```([\s\S]*?)```/g, '<code class="wa-mono">$1</code>');
  html = html.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  html = html.replace(/~(.*?)~/g, '<del>$1</del>');
  html = html.replace(/\{\{(.*?)\}\}/g, (_match, token: string) => {
    if (token.startsWith('field:')) {
      const elementId = token.slice('field:'.length).trim();
      const fieldLabel = elementLookup?.[elementId];
      const safeLabel = (fieldLabel || 'Campo')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<span class="wa-var">{{${safeLabel}}}</span>`;
    }
    if (token.startsWith('ctx.')) {
      const key = token.slice('ctx.'.length);
      const ctx = CONTEXT_KEYS.find(c => c.key === key);
      const label = ctx ? ctx.label : key;
      return `<span class="wa-var">{{${label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}}}</span>`;
    }
    if (token.startsWith('param.')) {
      const key = token.slice('param.'.length);
      return `<span class="wa-var">{{${key}}}</span>`;
    }
    if (token.startsWith('webhook:')) {
      const parts = token.split(':');
      const fieldName = parts.length >= 3 ? parts.slice(2).join(':') : parts[parts.length - 1];
      return `<span class="wa-var">{{${fieldName}}}</span>`;
    }
    return `<span class="wa-var">{{${token}}}</span>`;
  });
  html = html.replace(/\n/g, '<br/>');
  return html;
}
