import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Bold, Italic, Strikethrough, Code, Smile, Maximize2, X, MessageSquare, FileText, Globe, Monitor, Webhook, Braces } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FormVariable, IntegrationNodeData, TrackedParam, DEFAULT_TRACKED_PARAMS } from '@/types/form';
import type { InputElementGroup } from '../VariableAssignPanel';
import { VariableContentEditable, VariableContentEditableRef, VarTokenInfo, AutocompleteTriggerInfo } from '../shared/VariableContentEditable';
import { formatFieldTokensForDisplay, type ElementLookup } from '../shared/VariableHighlightOverlay';
import { CONTEXT_KEYS } from '@/lib/sessionContext';
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

const FORMATTING: Record<string, { prefix: string; suffix: string; label: string }> = {
  bold:          { prefix: '*',   suffix: '*',   label: 'Negrito' },
  italic:        { prefix: '_',   suffix: '_',   label: 'Itálico' },
  strikethrough: { prefix: '~',   suffix: '~',   label: 'Tachado' },
  monospace:     { prefix: '```', suffix: '```', label: 'Monoespaçado' },
};

export { formatFieldTokensForDisplay };
export type { ElementLookup };

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

interface Props {
  value: string;
  onChange: (val: string) => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
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
  variables,
  integrationNodes,
  allInputElements,
  trackedParams,
  insertVariable,
  insertSyntax,
  stopProp,
}: {
  onFormat: (type: string) => void;
  emojiOpen: boolean;
  setEmojiOpen: (v: boolean) => void;
  insertEmoji: (e: string) => void;
  varOpen: boolean;
  setVarOpen: (v: boolean) => void;
  variables: FormVariable[];
  integrationNodes: IntegrationNodeData[];
  allInputElements: InputElementGroup[];
  trackedParams?: TrackedParam[];
  insertVariable: (name: string) => void;
  insertSyntax: (syntax: string) => void;
  stopProp: (e: React.SyntheticEvent) => void;
}) {
  const webhookNodesWithFields = integrationNodes.filter(n => (n.responseFields?.length ?? 0) > 0);
  const activeParams = (trackedParams ?? DEFAULT_TRACKED_PARAMS).filter(p => p.enabled && p.key);
  const hasVars = variables.length > 0 || webhookNodesWithFields.length > 0 || allInputElements.some(g => g.elements.length > 0) || activeParams.length > 0 || CONTEXT_KEYS.length > 0;

  return (
    <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
      {Object.entries(FORMATTING).map(([key, fmt]) => (
        <button
          key={key}
          type="button"
          onClick={() => onFormat(key)}
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
          <button type="button" className={cn('p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground', emojiOpen && 'bg-muted text-foreground')} title="Emoji">
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
            <button type="button" className={cn('p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground', varOpen && 'bg-muted text-foreground')} title="Inserir variável">
              <Braces className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={4} className="w-72 p-0 z-[9999]" onPointerDown={stopProp}>
            <div className="p-2 border-b border-border">
              <p className="text-xs font-semibold text-foreground">Inserir referência</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Clique para inserir no cursor</p>
            </div>
            <div className="p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
              {variables.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1">Variáveis</p>
                  {variables.map(v => (
                    <button key={v.id} type="button" onClick={() => insertVariable(v.name)} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium flex-shrink-0">{v.name}</span>
                      <span className="text-muted-foreground">({v.type})</span>
                    </button>
                  ))}
                </>
              )}
              {allInputElements.some(g => g.elements.length > 0) && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Campos do formulário</p>
                  {allInputElements.filter(g => g.elements.length > 0).map(group => (
                    <div key={group.pageId}>
                      <p className="text-[8px] text-muted-foreground/60 px-2 pt-1">📄 {group.pageTitle}</p>
                      {group.elements.map(el => (
                        <button key={el.elementId} type="button" onClick={() => insertSyntax(`{{field:${el.elementId}}}`)} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2">
                          <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{el.elementLabel}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {webhookNodesWithFields.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Retorno Webhook</p>
                  {webhookNodesWithFields.map(wn => (
                    <div key={wn.id}>
                      {wn.responseFields?.map(f => (
                        <button key={f} type="button" onClick={() => insertSyntax(`{{webhook:${wn.id}:${f}}}`)} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2">
                          <Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />
                          <span className="font-mono">{f}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {activeParams.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Parâmetros GET</p>
                  {activeParams.map(p => (
                    <button key={p.id} type="button" onClick={() => insertSyntax(`{{param.${p.key}}}`)} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2">
                      <Globe className="h-3 w-3 text-orange-500 flex-shrink-0" />
                      <span>{p.label || p.key}</span>
                    </button>
                  ))}
                </>
              )}
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Contexto</p>
              {[...new Set(CONTEXT_KEYS.map(c => c.category))].map(cat => (
                <div key={cat}>
                  <p className="text-[8px] text-muted-foreground/60 px-2 pt-1">{cat}</p>
                  {CONTEXT_KEYS.filter(c => c.category === cat).map(ctx => (
                    <button key={ctx.key} type="button" onClick={() => insertSyntax(`{{ctx.${ctx.key}}}`)} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2">
                      <Monitor className="h-3 w-3 text-blue-500 flex-shrink-0" />
                      <span>{ctx.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground">
                Use <code className="font-mono bg-muted px-1 rounded">{`{{nome}}`}</code>, <code className="font-mono bg-muted px-1 rounded">{`{{ctx.device}}`}</code> ou <code className="font-mono bg-muted px-1 rounded">{`{{param.utm_source}}`}</code>
              </p>
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
  trackedParams,
  placeholder,
  sendMedia,
  mediaType,
  mediaUrl,
  mediaFileName,
}: Props) {
  const ceRef = useRef<VariableContentEditableRef>(null);
  const expandedCeRef = useRef<VariableContentEditableRef>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  // Autocomplete state for expanded editor
  const [acState, setAcState] = useState<{
    show: boolean;
    filter: string;
    x: number;
    y: number;
    selectedIdx: number;
    textNode: Text;
    start: number;
    end: number;
  } | null>(null);

  // Build lookup for field ID → label
  const elementLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of allInputElements) {
      for (const el of group.elements) {
        map[el.elementId] = el.elementLabel;
      }
    }
    return map;
  }, [allInputElements]);

  const ctxLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of CONTEXT_KEYS) map[c.key] = c.label;
    return map;
  }, []);

  const resolveToken = useCallback((raw: string): VarTokenInfo => {
    if (raw.startsWith('{{field:')) {
      const id = raw.slice(8, -2).trim();
      return { label: elementLookup[id] || 'Campo', varType: 'field' };
    }
    if (raw.startsWith('{{webhook:')) {
      const parts = raw.slice(2, -2).split(':');
      const fieldName = parts.length >= 3 ? parts.slice(2).join(':') : parts[parts.length - 1];
      return { label: fieldName, varType: 'webhook' };
    }
    if (raw.startsWith('{{ctx.')) {
      const key = raw.slice(6, -2);
      return { label: ctxLabelMap[key] || key, varType: 'context' };
    }
    if (raw.startsWith('{{param.')) {
      return { label: raw.slice(8, -2), varType: 'param' };
    }
    return { label: raw.slice(2, -2), varType: 'variable' };
  }, [elementLookup, ctxLabelMap]);

  // Autocomplete items
  const allAcItems = useMemo(() => {
    const items: { id: string; label: string; syntax: string; icon: string; detail?: string }[] = [];
    for (const v of variables) items.push({ id: `var-${v.id}`, label: v.name, syntax: `{{${v.name}}}`, icon: 'var', detail: v.type });
    for (const group of allInputElements) {
      for (const el of group.elements) items.push({ id: `field-${el.elementId}`, label: el.elementLabel, syntax: `{{field:${el.elementId}}}`, icon: 'field', detail: group.pageTitle });
    }
    const whNodes = integrationNodes.filter(n => (n.responseFields?.length ?? 0) > 0);
    for (const wn of whNodes) for (const f of (wn.responseFields || [])) items.push({ id: `wh-${wn.id}-${f}`, label: f, syntax: `{{webhook:${wn.id}:${f}}}`, icon: 'webhook' });
    const activeParams = (trackedParams ?? DEFAULT_TRACKED_PARAMS).filter(p => p.enabled && p.key);
    for (const p of activeParams) items.push({ id: `param-${p.id}`, label: p.label || p.key, syntax: `{{param.${p.key}}}`, icon: 'param' });
    for (const ctx of CONTEXT_KEYS) items.push({ id: `ctx-${ctx.key}`, label: ctx.label, syntax: `{{ctx.${ctx.key}}}`, icon: 'context' });
    return items;
  }, [variables, allInputElements, integrationNodes, trackedParams]);

  const filteredAcItems = useMemo(() => {
    if (!acState?.show) return [];
    const f = acState.filter.toLowerCase();
    if (!f) return allAcItems.slice(0, 12);
    return allAcItems.filter(item => item.label.toLowerCase().includes(f) || item.syntax.toLowerCase().includes(f)).slice(0, 12);
  }, [acState?.show, acState?.filter, allAcItems]);

  const handleAcTrigger = useCallback((info: AutocompleteTriggerInfo) => {
    setAcState({ show: true, filter: info.filter, x: info.x, y: info.y, selectedIdx: 0, textNode: info.textNode, start: info.start, end: info.end });
  }, []);
  const handleAcDismiss = useCallback(() => setAcState(null), []);
  const handleAcSelect = useCallback((item: typeof allAcItems[0]) => {
    if (!acState) return;
    expandedCeRef.current?.replaceRangeWithToken(acState.textNode, acState.start, acState.end, item.syntax);
    setAcState(null);
  }, [acState]);
  const handleAcKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!acState?.show || filteredAcItems.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAcState(prev => prev ? { ...prev, selectedIdx: (prev.selectedIdx + 1) % filteredAcItems.length } : null); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAcState(prev => prev ? { ...prev, selectedIdx: (prev.selectedIdx - 1 + filteredAcItems.length) % filteredAcItems.length } : null); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleAcSelect(filteredAcItems[acState.selectedIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); setAcState(null); }
  }, [acState, filteredAcItems, handleAcSelect]);

  const activeRef = expanded ? expandedCeRef : ceRef;

  const applyFormatting = useCallback((type: string) => {
    const { prefix, suffix } = FORMATTING[type];
    activeRef.current?.wrapSelection(prefix, suffix, 'texto');
  }, [activeRef]);

  const insertEmoji = useCallback((emoji: string) => {
    activeRef.current?.insertAtCursor(emoji);
    setEmojiOpen(false);
  }, [activeRef]);

  const insertVariable = useCallback((varName: string) => {
    activeRef.current?.insertToken(`{{${varName}}}`);
    setVarOpen(false);
  }, [activeRef]);

  const insertSyntaxDirect = useCallback((syntax: string) => {
    activeRef.current?.insertToken(syntax);
    setVarOpen(false);
  }, [activeRef]);

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleExpand = useCallback(() => {
    if (triggerRef.current) setOriginRect(triggerRef.current.getBoundingClientRect());
    setExpanded(true);
    requestAnimationFrame(() => expandedCeRef.current?.focus());
  }, []);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    setAcState(null);
  }, []);

  const toolbarProps = {
    onFormat: applyFormatting,
    emojiOpen,
    setEmojiOpen,
    insertEmoji,
    varOpen,
    setVarOpen,
    variables,
    integrationNodes,
    allInputElements,
    trackedParams,
    insertVariable,
    insertSyntax: insertSyntaxDirect,
    stopProp,
  };

  const previewText = value ? formatFieldTokensForDisplay(value, elementLookup) : (placeholder || 'Escreva sua mensagem…');
  const isPlaceholder = !value;
  const previewHtml = useMemo(() => parseWhatsAppMarkdown(value || '', elementLookup), [value, elementLookup]);
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const acIconMap: Record<string, React.ReactNode> = {
    var: <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium flex-shrink-0">x</span>,
    field: <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />,
    webhook: <Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />,
    param: <Globe className="h-3 w-3 text-orange-500 flex-shrink-0" />,
    context: <Monitor className="h-3 w-3 text-blue-500 flex-shrink-0" />,
  };

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
                        <VariableContentEditable
                          ref={expandedCeRef}
                          value={value}
                          onChange={onChange}
                          resolveToken={resolveToken}
                          multiline
                          rows={10}
                          placeholder={placeholder}
                          className="text-sm min-h-[280px]"
                          onAutocompleteTrigger={handleAcTrigger}
                          onAutocompleteDismiss={handleAcDismiss}
                          onKeyDown={(e) => {
                            handleAcKeyDown(e);
                            if (e.key === 'Escape' && !acState?.show) handleCollapse();
                          }}
                        />
                        {/* Autocomplete dropdown */}
                        {acState?.show && filteredAcItems.length > 0 && (
                          <div
                            className="fixed z-[10000] bg-popover border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto min-w-[200px]"
                            style={{ left: acState.x, top: acState.y + 4 }}
                          >
                            {filteredAcItems.map((item, i) => (
                              <div
                                key={item.id}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors',
                                  i === acState.selectedIdx ? 'bg-[hsl(var(--paper-400))] text-foreground' : 'hover:bg-muted'
                                )}
                                onMouseDown={(e) => { e.preventDefault(); handleAcSelect(item); }}
                              >
                                {acIconMap[item.icon]}
                                <span className="truncate">{item.label}</span>
                                {item.detail && <span className="text-muted-foreground ml-auto text-[10px] truncate">{item.detail}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: WhatsApp Preview */}
                  <div className="w-[280px] flex-shrink-0 flex flex-col bg-muted/20 overflow-auto">
                    <div className="px-3 pt-3 pb-1.5">
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Preview</p>
                    </div>
                    <div className="flex-1 px-3 pb-3">
                      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                        <div className="px-3 py-2 bg-[#075E54] dark:bg-node-whatsapp-accent flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                            <MessageSquare className="h-3 w-3 text-white" />
                          </div>
                          <span className="text-xs font-medium text-white">Destinatário</span>
                        </div>
                        <div className="p-3 bg-[#ECE5DD] dark:bg-muted/30 min-h-[260px]">
                          {(value || (sendMedia && mediaUrl)) ? (
                            <div className="bg-[#DCF8C6] dark:bg-primary/15 rounded-lg rounded-tl-none shadow-sm max-w-full overflow-hidden">
                              {sendMedia && mediaUrl && (
                                <div className="border-b border-black/5">
                                  {mediaType === 'image' && <img src={mediaUrl} alt="" className="w-full max-h-[120px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
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
                              {value && (
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
