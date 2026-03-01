import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { FormVariable, IntegrationNodeData, TrackedParam, DEFAULT_TRACKED_PARAMS } from '@/types/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Braces, Copy, Check, Webhook, FileText, Globe, Monitor } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useVariableAutocomplete } from './useVariableAutocomplete';
import { VariableHighlightOverlay } from './VariableHighlightOverlay';
import { CONTEXT_KEYS } from '@/lib/sessionContext';
import type { InputElementGroup } from '../VariableAssignPanel';

interface BaseProps {
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
  className?: string;
}

interface InputProps extends BaseProps {
  as?: 'input';
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

interface TextareaProps extends BaseProps {
  as: 'textarea';
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}

type Props = InputProps | TextareaProps;

export default function VariableInput(props: Props) {
  const { variables = [], integrationNodes = [], allInputElements = [], trackedParams, className, value, onChange, placeholder } = props;
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Build a lookup map: elementId → label for human-readable highlights
  const elementLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of allInputElements) {
      for (const el of group.elements) {
        map[el.elementId] = el.elementLabel;
      }
    }
    return map;
  }, [allInputElements]);

  const [local, setLocal] = useState(value);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) setLocal(value);
  }, [value]);

  const commitValue = useCallback((v?: string) => {
    const val = v ?? local;
    if (val !== value) onChange(val);
  }, [local, value, onChange]);

  const { handleChange, handleKeyDown: acHandleKeyDown, handleClick: acHandleClick, dismiss, DropdownUI } = useVariableAutocomplete({
    inputRef,
    localValue: local,
    setLocalValue: setLocal,
    onCommit: (v) => onChange(v),
    variables,
    integrationNodes,
    allInputElements,
    trackedParams,
  });

  const insertSyntax = (syntax: string) => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? local.length;
      const end = el.selectionEnd ?? local.length;
      const next = local.slice(0, start) + syntax + local.slice(end);
      setLocal(next);
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + syntax.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      const next = local + syntax;
      setLocal(next);
      onChange(next);
    }
    setOpen(false);
  };

  const insertVariable = (varName: string) => insertSyntax(`{{${varName}}}`);
  const insertFieldRef = (elementId: string) => insertSyntax(`{{field:${elementId}}}`);
  const insertWebhookRef = (nodeId: string, path: string) => insertSyntax(`{{webhook:${nodeId}:${path}}}`);

  const copyVar = (syntax: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(syntax);
    setCopied(syntax);
    toast.success(`${syntax} copiado!`);
    setTimeout(() => setCopied(null), 1500);
  };

  const webhookNodesWithFields = (integrationNodes || []).filter(n => (n.responseFields?.length ?? 0) > 0);
  const activeParams = (trackedParams ?? DEFAULT_TRACKED_PARAMS).filter(p => p.enabled && p.key);
  const hasVars = variables.length > 0 || webhookNodesWithFields.length > 0 || allInputElements.some(g => g.elements.length > 0) || activeParams.length > 0 || CONTEXT_KEYS.length > 0;

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  const inputHandlers = {
    onFocus: () => {
      isFocusedRef.current = true;
    },
    onBlur: () => {
      isFocusedRef.current = false;
      dismiss();
      commitValue();
    },
    onKeyDown: (e: React.KeyboardEvent) => { acHandleKeyDown(e); e.stopPropagation(); },
    onClick: () => { acHandleClick(); },
    onMouseDown: stopProp,
    onPointerDown: stopProp,
  };

  const hasHighlight = local.includes('{{');
  const showReadableOverlay = hasHighlight;

  const PopoverRow = ({ syntax, icon, label, detail, onClick }: { syntax: string; icon: React.ReactNode; label: string; detail?: string; onClick: () => void }) => (
    <div className="group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors" onClick={onClick}>
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-[10px] text-foreground truncate">{label}</span>
        {detail && <span className="text-[9px] text-muted-foreground truncate">{detail}</span>}
      </div>
      <button onClick={(e) => copyVar(syntax, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted-foreground/10 transition-all" title="Copiar sintaxe">
        {copied === syntax ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  );

  return (
    <div className="relative flex items-start gap-1 nodrag nopan nowheel">
      <div className="relative flex-1">
        {props.as === 'textarea' ? (
          <>
            {hasHighlight && (
              <VariableHighlightOverlay
                text={local}
                elementLookup={elementLookup}
                displayFieldLabels={showReadableOverlay}
                className={cn(
                  'var-highlight-backdrop rounded-md border border-transparent px-3 py-2 text-base md:text-sm',
                  showReadableOverlay && 'var-highlight-readable',
                  className
                )}
              />
            )}
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={local}
              onChange={e => handleChange(e.target.value)}
              placeholder={placeholder}
              rows={props.rows ?? 2}
              spellCheck={false}
              className={cn('nodrag nopan nowheel relative', showReadableOverlay ? 'bg-transparent text-transparent caret-foreground selection:bg-transparent selection:text-transparent' : hasHighlight && 'bg-transparent', className)}
              {...inputHandlers}
            />
          </>
        ) : (
          <>
            {hasHighlight && (
              <VariableHighlightOverlay
                text={local}
                elementLookup={elementLookup}
                displayFieldLabels={showReadableOverlay}
                className={cn(
                  'var-highlight-backdrop rounded-md border border-transparent px-3 py-2 text-base md:text-sm whitespace-nowrap',
                  showReadableOverlay && 'var-highlight-readable',
                  className
                )}
              />
            )}
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={local}
              onChange={e => handleChange(e.target.value)}
              placeholder={placeholder}
              spellCheck={false}
              className={cn('nodrag nopan nowheel relative', showReadableOverlay ? 'bg-transparent text-transparent caret-foreground selection:bg-transparent selection:text-transparent' : hasHighlight && 'bg-transparent', className)}
              {...inputHandlers}
            />
          </>
        )}
        {DropdownUI}
      </div>

      {/* Variable picker trigger — always render Popover to keep hook count stable */}
      <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors',
                props.as === 'textarea' ? 'mt-0.5' : '',
                open && 'text-primary bg-primary/10'
              )}
              title="Inserir variável"
            >
              <Braces className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="w-72 p-0">
            <div className="p-2 border-b border-border">
              <p className="text-xs font-semibold text-foreground">Inserir referência</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Clique para inserir no cursor</p>
            </div>
            <div className="p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
              {/* Variables */}
              {variables.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1">Variáveis</p>
                  {variables.map(v => {
                    const syntax = `{{${v.name}}}`;
                    return (
                      <PopoverRow key={v.id} syntax={syntax} label={syntax} detail={v.type} onClick={() => insertVariable(v.name)}
                        icon={<span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium flex-shrink-0">{v.name}</span>}
                      />
                    );
                  })}
                </>
              )}
              {/* Fields */}
              {allInputElements.some(g => g.elements.length > 0) && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Campos do formulário</p>
                  {allInputElements.filter(g => g.elements.length > 0).map(group => (
                    <div key={group.pageId}>
                      <p className="text-[8px] text-muted-foreground/60 px-2 pt-1">📄 {group.pageTitle}</p>
                      {group.elements.map(el => {
                        const syntax = `{{field:${el.elementId}}}`;
                        return (
                          <PopoverRow key={el.elementId} syntax={syntax} label={el.elementLabel} onClick={() => insertFieldRef(el.elementId)}
                            icon={<FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                          />
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
              {/* Webhooks */}
              {webhookNodesWithFields.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Retorno Webhook</p>
                  {webhookNodesWithFields.map(wn => {
                    const host = wn.webhookUrl ? (() => { try { return new URL(wn.webhookUrl).hostname; } catch { return wn.id.slice(0, 8); } })() : wn.id.slice(0, 8);
                    return (wn.responseFields || []).map(field => {
                      const syntax = `{{webhook:${wn.id}:${field}}}`;
                      return (
                        <PopoverRow key={`${wn.id}-${field}`} syntax={syntax} label={field} detail={host} onClick={() => insertWebhookRef(wn.id, field)}
                          icon={<Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />}
                        />
                      );
                    });
                  })}
                </>
              )}
              {/* GET Params */}
              {activeParams.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Parâmetros GET</p>
                  {activeParams.map(p => {
                    const syntax = `{{param.${p.key}}}`;
                    return (
                      <PopoverRow key={p.id} syntax={syntax} label={p.label || p.key} detail={p.key} onClick={() => insertSyntax(syntax)}
                        icon={<Globe className="h-3 w-3 text-orange-500 flex-shrink-0" />}
                      />
                    );
                  })}
                </>
              )}
              {/* Context */}
              {(() => {
                const categories = [...new Set(CONTEXT_KEYS.map(c => c.category))];
                return (
                  <>
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Contexto</p>
                    {categories.map(cat => (
                      <div key={cat}>
                        <p className="text-[8px] text-muted-foreground/60 px-2 pt-1">{cat}</p>
                        {CONTEXT_KEYS.filter(c => c.category === cat).map(ctx => {
                          const syntax = `{{ctx.${ctx.key}}}`;
                          return (
                            <PopoverRow key={ctx.key} syntax={syntax} label={ctx.label} onClick={() => insertSyntax(syntax)}
                              icon={<Monitor className="h-3 w-3 text-blue-500 flex-shrink-0" />}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
            <div className="p-2 border-t border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground">
                Use <code className="font-mono bg-muted px-1 rounded">{`{{nome}}`}</code>, <code className="font-mono bg-muted px-1 rounded">{`{{ctx.device}}`}</code> ou <code className="font-mono bg-muted px-1 rounded">{`{{param.utm_source}}`}</code>
              </p>
            </div>
          </PopoverContent>
      </Popover>
    </div>
  );
}
