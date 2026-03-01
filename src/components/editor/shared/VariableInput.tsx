import React, { useRef, useState, useEffect, useCallback } from 'react';
import { FormVariable, IntegrationNodeData } from '@/types/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Braces, Copy, Check, Webhook } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useVariableAutocomplete } from './useVariableAutocomplete';
import { VariableHighlightOverlay } from './VariableHighlightOverlay';

interface BaseProps {
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
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
  const { variables = [], integrationNodes = [], className, value, onChange, placeholder } = props;
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [local, setLocal] = useState(value);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) setLocal(value);
  }, [value]);

  const commitValue = useCallback((v?: string) => {
    const val = v ?? local;
    if (val !== value) onChange(val);
  }, [local, value, onChange]);

  const { handleChange, handleKeyDown: acHandleKeyDown, dismiss, DropdownUI } = useVariableAutocomplete({
    inputRef,
    localValue: local,
    setLocalValue: setLocal,
    onCommit: (v) => onChange(v),
    variables,
    integrationNodes,
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
  const insertWebhookRef = (nodeId: string, path: string) => insertSyntax(`{{webhook:${nodeId}:${path}}}`);

  const copyVar = (syntax: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(syntax);
    setCopied(syntax);
    toast.success(`${syntax} copiado!`);
    setTimeout(() => setCopied(null), 1500);
  };

  const webhookNodesWithFields = (integrationNodes || []).filter(n => (n.responseFields?.length ?? 0) > 0);
  const hasVars = variables.length > 0 || webhookNodesWithFields.length > 0;

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  const inputHandlers = {
    onFocus: () => { isFocusedRef.current = true; },
    onBlur: () => { isFocusedRef.current = false; dismiss(); commitValue(); },
    onKeyDown: (e: React.KeyboardEvent) => { acHandleKeyDown(e); e.stopPropagation(); },
    onMouseDown: stopProp,
    onPointerDown: stopProp,
  };

  const hasHighlight = local.includes('{{');

  return (
    <div className="relative flex items-start gap-1 nodrag nopan nowheel">
      <div className="relative flex-1">
        {props.as === 'textarea' ? (
          <>
            {hasHighlight && (
              <VariableHighlightOverlay
                text={local}
                className={cn(
                  'var-highlight-backdrop rounded-md border border-transparent px-3 py-2 text-base md:text-sm',
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
              className={cn('nodrag nopan nowheel relative', hasHighlight && 'bg-transparent', className)}
              {...inputHandlers}
            />
          </>
        ) : (
          <>
            {hasHighlight && (
              <VariableHighlightOverlay
                text={local}
                className={cn(
                  'var-highlight-backdrop rounded-md border border-transparent px-3 py-2 text-base md:text-sm whitespace-nowrap',
                  className
                )}
              />
            )}
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={local}
              onChange={e => handleChange(e.target.value)}
              placeholder={placeholder}
              className={cn('nodrag nopan nowheel relative', hasHighlight && 'bg-transparent', className)}
              {...inputHandlers}
            />
          </>
        )}
        {DropdownUI}
      </div>

      {/* Variable picker trigger */}
      {hasVars && (
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
            <div className="p-1.5 space-y-0.5 max-h-52 overflow-y-auto">
              {variables.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1">Variáveis</p>
                  {variables.map(v => {
                    const syntax = `{{${v.name}}}`;
                    return (
                      <div key={v.id} className="group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors" onClick={() => insertVariable(v.name)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium flex-shrink-0">{syntax}</span>
                          <span className="text-xs text-muted-foreground truncate capitalize">{v.type}</span>
                        </div>
                        <button onClick={(e) => copyVar(syntax, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted-foreground/10 transition-all" title="Copiar sintaxe">
                          {copied === syntax ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
              {webhookNodesWithFields.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2">Retorno Webhook</p>
                  {webhookNodesWithFields.map(wn => {
                    const host = wn.webhookUrl ? (() => { try { return new URL(wn.webhookUrl).hostname; } catch { return wn.id.slice(0, 8); } })() : wn.id.slice(0, 8);
                    return (wn.responseFields || []).map(field => {
                      const syntax = `{{webhook:${wn.id}:${field}}}`;
                      return (
                        <div key={`${wn.id}-${field}`} className="group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors" onClick={() => insertWebhookRef(wn.id, field)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />
                            <span className="text-[10px] font-mono text-foreground truncate">{field}</span>
                            <span className="text-[9px] text-muted-foreground truncate">{host}</span>
                          </div>
                          <button onClick={(e) => copyVar(syntax, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted-foreground/10 transition-all" title="Copiar sintaxe">
                            {copied === syntax ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </div>
                      );
                    });
                  })}
                </>
              )}
            </div>
            <div className="p-2 border-t border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground">
                Use <code className="font-mono bg-muted px-1 rounded">{`{{nome}}`}</code> ou <code className="font-mono bg-muted px-1 rounded">{`{{webhook:id:campo}}`}</code>
              </p>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
