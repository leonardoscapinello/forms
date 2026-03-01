import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Bold, Italic, Strikethrough, Code, Smile, Maximize2, X, MessageSquare, FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Braces } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FormVariable, IntegrationNodeData } from '@/types/form';
import type { InputElementGroup } from '../VariableAssignPanel';
import { useVariableAutocomplete } from '../shared/useVariableAutocomplete';
import { VariableHighlightOverlay } from '../shared/VariableHighlightOverlay';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';

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
  allInputElements?: InputElementGroup[];
  placeholder?: string;
  sendMedia?: boolean;
  mediaType?: 'image' | 'document' | 'video' | 'audio';
  mediaUrl?: string;
  mediaFileName?: string;
}

/** Formatting toolbar shared between inline and expanded modes */
function FormattingToolbar({
  onFormat,
  emojiOpen,
  setEmojiOpen,
  insertEmoji,
  varOpen,
  setVarOpen,
  hasVars,
  variables,
  webhookNodesWithFields,
  insertVariable,
  stopProp,
}: {
  onFormat: (type: keyof typeof FORMATTING) => void;
  emojiOpen: boolean;
  setEmojiOpen: (v: boolean) => void;
  insertEmoji: (e: string) => void;
  varOpen: boolean;
  setVarOpen: (v: boolean) => void;
  hasVars: boolean;
  variables: FormVariable[];
  webhookNodesWithFields: IntegrationNodeData[];
  insertVariable: (name: string) => void;
  stopProp: (e: React.SyntheticEvent) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
      {Object.entries(FORMATTING).map(([key, fmt]) => (
        <button
          key={key}
          type="button"
          onClick={() => onFormat(key as keyof typeof FORMATTING)}
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
        <PopoverContent align="start" sideOffset={4} className="w-[260px] p-2 z-[9999]" onPointerDown={stopProp}>
          <div className="grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
            {COMMON_EMOJIS.map(emoji => (
              <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="text-base p-1 rounded hover:bg-muted transition-colors text-center leading-none">
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

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
          <PopoverContent align="start" sideOffset={4} className="w-64 p-0 z-[9999]" onPointerDown={stopProp}>
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
  );
}

export default function WhatsAppMessageEditor({
  value,
  onChange,
  variables = [],
  integrationNodes = [],
  allInputElements = [],
  placeholder,
  sendMedia,
  mediaType,
  mediaUrl,
  mediaFileName,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [local, setLocal] = useState(value);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const isFocusedRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!isFocusedRef.current && !expanded) setLocal(value);
  }, [value, expanded]);

  const commitValue = useCallback((v?: string) => {
    const val = v ?? local;
    if (val !== value) onChange(val);
  }, [local, value, onChange]);

  const activeRef = expanded ? expandedTextareaRef : textareaRef;

  const { handleChange: acHandleChange, handleKeyDown: acHandleKeyDown, handleClick: acHandleClick, dismiss: acDismiss, DropdownUI } = useVariableAutocomplete({
    inputRef: activeRef,
    localValue: local,
    setLocalValue: setLocal,
    onCommit: (v) => onChange(v),
    variables,
    integrationNodes,
    allInputElements,
  });

  const applyFormatting = useCallback((type: keyof typeof FORMATTING) => {
    const el = activeRef.current;
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
  }, [local, onChange, activeRef]);

  const insertEmoji = useCallback((emoji: string) => {
    const el = activeRef.current;
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
  }, [local, onChange, activeRef]);

  const insertVariable = useCallback((varName: string) => {
    const el = activeRef.current;
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
  }, [local, onChange, activeRef]);

  const webhookNodesWithFields = useMemo(
    () => (integrationNodes || []).filter(n => (n.responseFields?.length ?? 0) > 0),
    [integrationNodes]
  );
  const hasVars = variables.length > 0 || webhookNodesWithFields.length > 0;

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleExpand = useCallback(() => {
    if (triggerRef.current) {
      setOriginRect(triggerRef.current.getBoundingClientRect());
    }
    setExpanded(true);
    requestAnimationFrame(() => {
      expandedTextareaRef.current?.focus();
    });
  }, []);

  const handleCollapse = useCallback(() => {
    commitValue();
    setExpanded(false);
    acDismiss();
  }, [commitValue, acDismiss]);

  const toolbarProps = {
    onFormat: applyFormatting,
    emojiOpen,
    setEmojiOpen,
    insertEmoji,
    varOpen,
    setVarOpen,
    hasVars,
    variables,
    webhookNodesWithFields,
    insertVariable,
    stopProp,
  };

  const previewText = local || placeholder || 'Escreva sua mensagem…';
  const isPlaceholder = !local;
  const previewHtml = useMemo(() => parseWhatsAppMarkdown(local || ''), [local]);
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      {/* Compact inline trigger */}
      <div ref={triggerRef} className="relative">
        <div
          onClick={handleExpand}
          className={cn(
            "w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-xs transition-all hover:border-node-whatsapp-accent/40 hover:shadow-sm",
            "min-h-[52px] flex flex-col gap-1"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
              <Bold className="h-2.5 w-2.5" />
              Editor
            </div>
            <Maximize2 className="h-3 w-3 text-muted-foreground" />
          </div>
          <p className={cn(
            "text-xs line-clamp-2 whitespace-pre-wrap break-words",
            isPlaceholder ? "text-muted-foreground" : "text-foreground"
          )}>
            {previewText}
          </p>
        </div>
      </div>

      {/* Expanded modal via portal */}
      {createPortal(
        <AnimatePresence>
          {expanded && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm"
                onClick={handleCollapse}
              />

              <motion.div
                initial={originRect ? {
                  position: 'fixed' as const,
                  top: originRect.top,
                  left: originRect.left,
                  width: originRect.width,
                  height: originRect.height,
                  opacity: 0.8,
                } : { opacity: 0, scale: 0.95 }}
                animate={{
                  position: 'fixed' as const,
                  top: '50%',
                  left: '50%',
                  x: '-50%',
                  y: '-50%',
                  width: Math.min(820, window.innerWidth - 48),
                  height: 'auto',
                  opacity: 1,
                }}
                exit={originRect ? {
                  top: originRect.top,
                  left: originRect.left,
                  width: originRect.width,
                  height: originRect.height,
                  x: 0,
                  y: 0,
                  opacity: 0,
                } : { opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 28, stiffness: 350, mass: 0.8 }}
                className="fixed z-[9995] rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
                onMouseDown={stopProp}
                onPointerDown={stopProp}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-node-whatsapp-accent/15 flex items-center justify-center">
                      <MessageSquare className="h-3 w-3 text-node-whatsapp-accent" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Editor de Mensagem</span>
                  </div>
                  <button onClick={handleCollapse} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Two-column body */}
                <div className="flex" style={{ maxHeight: 'calc(80vh - 48px)' }}>
                  {/* Left: Editor */}
                  <div className="flex-1 flex flex-col min-w-0 border-r border-border">
                    <div className="px-4 pt-3 pb-1">
                      <FormattingToolbar {...toolbarProps} />
                    </div>
                    <div className="px-4 pb-4 pt-2 flex-1 overflow-auto">
                      <div className="relative">
                        {local.includes('{{') && (
                          <VariableHighlightOverlay
                            text={local}
                            className="var-highlight-backdrop rounded-md border border-transparent px-3 py-2 text-sm"
                          />
                        )}
                        <Textarea
                          ref={expandedTextareaRef}
                          value={local}
                          onChange={e => acHandleChange(e.target.value)}
                          placeholder={placeholder}
                          rows={10}
                          className={cn(
                            'text-sm min-h-[280px] resize-none relative nodrag nopan nowheel',
                            local.includes('{{') && 'bg-transparent'
                          )}
                          onFocus={() => { isFocusedRef.current = true; }}
                          onBlur={() => { isFocusedRef.current = false; acDismiss(); }}
                          onKeyDown={e => {
                            acHandleKeyDown(e);
                            e.stopPropagation();
                            if (e.key === 'Escape') handleCollapse();
                          }}
                          onClick={() => acHandleClick()}
                          onMouseDown={stopProp}
                          onPointerDown={stopProp}
                        />
                        {DropdownUI}
                      </div>
                    </div>
                  </div>

                  {/* Right: WhatsApp Preview */}
                  <div className="w-[280px] flex-shrink-0 flex flex-col bg-muted/20 overflow-auto">
                    <div className="px-3 pt-3 pb-1.5">
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Preview</p>
                    </div>
                    <div className="flex-1 px-3 pb-3">
                      {/* Phone frame */}
                      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                        {/* WhatsApp header bar */}
                        <div className="px-3 py-2 bg-[#075E54] dark:bg-node-whatsapp-accent flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                            <MessageSquare className="h-3 w-3 text-white" />
                          </div>
                          <span className="text-xs font-medium text-white">Destinatário</span>
                        </div>

                        {/* Chat background */}
                        <div className="p-3 bg-[#ECE5DD] dark:bg-muted/30 min-h-[260px]">
                          {(local || (sendMedia && mediaUrl)) ? (
                            <div className="bg-[#DCF8C6] dark:bg-primary/15 rounded-lg rounded-tl-none shadow-sm max-w-full overflow-hidden">
                              {/* Media in preview */}
                              {sendMedia && mediaUrl && (
                                <div className="border-b border-black/5">
                                  {mediaType === 'image' && (
                                    <img src={mediaUrl} alt="" className="w-full max-h-[120px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  )}
                                  {mediaType === 'video' && (
                                    <div className="relative">
                                      <video src={mediaUrl} className="w-full max-h-[120px] object-cover" muted preload="metadata" />
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="h-8 w-8 rounded-full bg-black/40 flex items-center justify-center">
                                          <div className="w-0 h-0 border-l-[10px] border-l-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-0.5" />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {mediaType === 'audio' && (
                                    <div className="flex items-center gap-2 px-2.5 py-2">
                                      <div className="h-7 w-7 rounded-full bg-[#00A884] flex items-center justify-center flex-shrink-0">
                                        <MessageSquare className="h-3 w-3 text-white" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="h-1 bg-black/10 rounded-full" />
                                        <span className="text-[8px] text-black/40 mt-0.5 block">0:00</span>
                                      </div>
                                    </div>
                                  )}
                                  {mediaType === 'document' && (
                                    <div className="flex items-center gap-2 px-2.5 py-2 bg-black/5">
                                      <FileText className="h-6 w-6 text-[#00A884] flex-shrink-0" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-medium text-foreground truncate">{mediaFileName || 'Documento'}</p>
                                        <p className="text-[8px] text-muted-foreground">{mediaFileName?.split('.').pop()?.toUpperCase() || 'PDF'}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Message text */}
                              {local && (
                                <div className="px-2.5 py-1.5">
                                  <div
                                    className="text-xs text-foreground leading-relaxed break-words [&_.wa-var]:bg-primary/15 [&_.wa-var]:text-primary [&_.wa-var]:rounded [&_.wa-var]:px-1 [&_.wa-mono]:bg-muted [&_.wa-mono]:rounded [&_.wa-mono]:px-1 [&_.wa-mono]:font-mono [&_.wa-mono]:text-[11px]"
                                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                                  />
                                </div>
                              )}

                              <div className="flex justify-end px-2 pb-1">
                                <span className="text-[8px] text-muted-foreground">{time}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground text-center py-8">
                              Comece a digitar para ver o preview
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}