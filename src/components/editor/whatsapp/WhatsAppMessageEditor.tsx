import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Bold, Italic, Strikethrough, Code, Smile } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Braces } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FormVariable, IntegrationNodeData } from '@/types/form';
import { useVariableAutocomplete } from '../shared/useVariableAutocomplete';
import { VariableHighlightOverlay } from '../shared/VariableHighlightOverlay';

const COMMON_EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊',
  '😇','🥰','😍','🤩','😘','😗','😚','😋','😛','😜',
  '🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐',
  '😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳',
  '🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖',
  '😣','😞','😓','😩','😫','🥱','😤','😡','🤬','😈',
  '👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾',
  '🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
  '❣️','💕','💞','💓','💗','💖','💝','💘','💌','💟',
  '👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘',
  '👌','🤌','🤏','👈','👉','👆','👇','☝️','✋','🤚',
  '🖐️','🖖','👋','🤙','💪','🦾','🙏','🎉','🎊','🎈',
  '🔥','⭐','💯','✅','❌','⚠️','📌','📎','💡','🎯',
];

interface WhatsAppFormatting {
  prefix: string;
  suffix: string;
  label: string;
}

const FORMATTING: Record<string, WhatsAppFormatting> = {
  bold:          { prefix: '*',   suffix: '*',   label: 'Negrito' },
  italic:        { prefix: '_',   suffix: '_',   label: 'Itálico' },
  strikethrough: { prefix: '~',   suffix: '~',   label: 'Tachado' },
  monospace:     { prefix: '```', suffix: '```', label: 'Monoespaçado' },
};

/**
 * Parse WhatsApp markdown into HTML for preview
 */
export function parseWhatsAppMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```([\s\S]*?)```/g, '<code class="wa-mono">$1</code>');
  html = html.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  html = html.replace(/~(.*?)~/g, '<del>$1</del>');
  html = html.replace(/\{\{(.*?)\}\}/g, '<span class="wa-var">{{$1}}</span>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  placeholder?: string;
}

export default function WhatsAppMessageEditor({
  value,
  onChange,
  variables = [],
  integrationNodes = [],
  placeholder,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [local, setLocal] = useState(value);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) setLocal(value);
  }, [value]);

  const commitValue = useCallback((v?: string) => {
    const val = v ?? local;
    if (val !== value) onChange(val);
  }, [local, value, onChange]);

  const { handleChange: acHandleChange, handleKeyDown: acHandleKeyDown, handleClick: acHandleClick, dismiss: acDismiss, DropdownUI } = useVariableAutocomplete({
    inputRef: textareaRef,
    localValue: local,
    setLocalValue: setLocal,
    onCommit: (v) => onChange(v),
    variables,
    integrationNodes,
  });

  const applyFormatting = useCallback((type: keyof typeof FORMATTING) => {
    const el = textareaRef.current;
    if (!el) return;
    const { prefix, suffix } = FORMATTING[type];
    const start = el.selectionStart ?? local.length;
    const end = el.selectionEnd ?? local.length;
    const selectedText = local.slice(start, end);
    const formatted = `${prefix}${selectedText || 'texto'}${suffix}`;
    const next = local.slice(0, start) + formatted + local.slice(end);
    setLocal(next);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const newStart = start + prefix.length;
      const newEnd = newStart + (selectedText.length || 5);
      el.setSelectionRange(newStart, newEnd);
    });
  }, [local, onChange]);

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? local.length;
    const next = local.slice(0, pos) + emoji + local.slice(pos);
    setLocal(next);
    onChange(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      const newPos = pos + emoji.length;
      el?.setSelectionRange(newPos, newPos);
    });
  }, [local, onChange]);

  const insertVariable = useCallback((varName: string) => {
    const el = textareaRef.current;
    const syntax = `{{${varName}}}`;
    const pos = el?.selectionStart ?? local.length;
    const next = local.slice(0, pos) + syntax + local.slice(pos);
    setLocal(next);
    onChange(next);
    setVarOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      const newPos = pos + syntax.length;
      el?.setSelectionRange(newPos, newPos);
    });
  }, [local, onChange]);

  const webhookNodesWithFields = useMemo(
    () => (integrationNodes || []).filter(n => (n.responseFields?.length ?? 0) > 0),
    [integrationNodes]
  );
  const hasVars = variables.length > 0 || webhookNodesWithFields.length > 0;

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="relative">
      {/* Formatting toolbar */}
      <div className="flex items-center gap-0.5 mb-1 bg-muted/40 rounded-md p-0.5">
        {Object.entries(FORMATTING).map(([key, fmt]) => (
          <button
            key={key}
            type="button"
            onClick={() => applyFormatting(key as keyof typeof FORMATTING)}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={fmt.label}
          >
            {key === 'bold' && <Bold className="h-3 w-3" />}
            {key === 'italic' && <Italic className="h-3 w-3" />}
            {key === 'strikethrough' && <Strikethrough className="h-3 w-3" />}
            {key === 'monospace' && <Code className="h-3 w-3" />}
          </button>
        ))}

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Emoji picker */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground',
                emojiOpen && 'bg-muted text-foreground'
              )}
              title="Emoji"
            >
              <Smile className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={4} className="w-[260px] p-2 z-[200]" onPointerDown={stopProp}>
            <div className="grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
              {COMMON_EMOJIS.map(emoji => (
                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="text-base p-1 rounded hover:bg-muted transition-colors text-center leading-none">
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Variable picker */}
        {hasVars && (
          <Popover open={varOpen} onOpenChange={setVarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground',
                  varOpen && 'bg-muted text-foreground'
                )}
                title="Inserir variável"
              >
                <Braces className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-64 p-0 z-[200]" onPointerDown={stopProp}>
              <div className="p-2 border-b border-border">
                <p className="text-xs font-semibold text-foreground">Inserir variável</p>
              </div>
              <div className="p-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                {variables.map(v => (
                  <button key={v.id} type="button" onClick={() => insertVariable(v.name)} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors">
                    <span className="font-mono text-primary">{`{{${v.name}}}`}</span>
                  </button>
                ))}
                {webhookNodesWithFields.map(wn => (
                  <div key={wn.id}>
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1.5">
                      🔗 Webhook {(() => { try { return new URL(wn.webhookUrl || '').hostname; } catch { return wn.id.slice(0, 8); } })()}
                    </p>
                    {wn.responseFields?.map(f => (
                      <button key={f} type="button" onClick={() => insertVariable(`webhook:${wn.id}:${f}`)} className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted transition-colors font-mono">
                        {f}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Textarea */}
      <div className="relative">
        {local.includes('{{') && (
          <VariableHighlightOverlay
            text={local}
            className="var-highlight-backdrop rounded-md border border-transparent px-3 py-2 text-xs"
          />
        )}
        <Textarea
          ref={textareaRef}
          value={local}
          onChange={e => acHandleChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cn(
            'text-xs min-h-[60px] nodrag nopan nowheel resize-none relative',
            local.includes('{{') && 'bg-transparent'
          )}
          onFocus={() => { isFocusedRef.current = true; }}
          onBlur={() => { isFocusedRef.current = false; acDismiss(); commitValue(); }}
          onKeyDown={e => { acHandleKeyDown(e); e.stopPropagation(); }}
          onClick={() => acHandleClick()}
          onMouseDown={stopProp}
          onPointerDown={stopProp}
        />
        {DropdownUI}
      </div>
    </div>
  );
}
