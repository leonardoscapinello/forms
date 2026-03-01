import React, { useRef, useState, useCallback, useMemo } from 'react';
import { FormVariable, IntegrationNodeData, TrackedParam, DEFAULT_TRACKED_PARAMS } from '@/types/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Braces, Copy, Check, Webhook, FileText, Globe, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { VariableContentEditable, VariableContentEditableRef, VarTokenInfo, AutocompleteTriggerInfo } from './VariableContentEditable';
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

interface AcItem {
  id: string;
  label: string;
  syntax: string;
  category: string;
  detail?: string;
  icon: string;
}

interface AcState {
  show: boolean;
  filter: string;
  x: number;
  y: number;
  selectedIdx: number;
  textNode: Text;
  start: number;
  end: number;
}

export default function VariableInput(props: Props) {
  const { variables = [], integrationNodes = [], allInputElements = [], trackedParams, className, value, onChange, placeholder } = props;
  const ceRef = useRef<VariableContentEditableRef>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [acState, setAcState] = useState<AcState | null>(null);

  // Build element lookup for resolving field tokens
  const elementLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of allInputElements) {
      for (const el of group.elements) {
        map[el.elementId] = el.elementLabel;
      }
    }
    return map;
  }, [allInputElements]);

  // Context label map
  const ctxLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of CONTEXT_KEYS) map[c.key] = c.label;
    return map;
  }, []);

  // Resolve a raw token to display info
  const resolveToken = useCallback((raw: string): VarTokenInfo => {
    if (raw.startsWith('{{field:')) {
      const id = raw.slice(8, -2);
      const label = elementLookup[id] || id.slice(0, 8);
      return { label, varType: 'field' };
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
      const key = raw.slice(8, -2);
      return { label: key, varType: 'param' };
    }
    const name = raw.slice(2, -2);
    return { label: name, varType: 'variable' };
  }, [elementLookup, ctxLabelMap]);

  // Build autocomplete items
  const allAcItems = useMemo<AcItem[]>(() => {
    const items: AcItem[] = [];
    for (const v of variables) {
      items.push({ id: `var-${v.id}`, label: v.name, syntax: `{{${v.name}}}`, category: 'variable', detail: v.type, icon: 'var' });
    }
    for (const group of allInputElements) {
      for (const el of group.elements) {
        items.push({ id: `field-${el.elementId}`, label: el.elementLabel, syntax: `{{field:${el.elementId}}}`, category: 'field', detail: group.pageTitle, icon: 'field' });
      }
    }
    const whNodes = integrationNodes.filter(n => (n.responseFields?.length ?? 0) > 0);
    for (const wn of whNodes) {
      for (const field of (wn.responseFields || [])) {
        items.push({ id: `wh-${wn.id}-${field}`, label: field, syntax: `{{webhook:${wn.id}:${field}}}`, category: 'webhook', icon: 'webhook' });
      }
    }
    const activeParams = (trackedParams ?? DEFAULT_TRACKED_PARAMS).filter(p => p.enabled && p.key);
    for (const p of activeParams) {
      items.push({ id: `param-${p.id}`, label: p.label || p.key, syntax: `{{param.${p.key}}}`, category: 'param', icon: 'param' });
    }
    for (const ctx of CONTEXT_KEYS) {
      items.push({ id: `ctx-${ctx.key}`, label: ctx.label, syntax: `{{ctx.${ctx.key}}}`, category: 'context', icon: 'context' });
    }
    return items;
  }, [variables, allInputElements, integrationNodes, trackedParams]);

  const filteredAcItems = useMemo(() => {
    if (!acState?.show) return [];
    const f = acState.filter.toLowerCase();
    if (!f) return allAcItems.slice(0, 12);
    return allAcItems.filter(item => item.label.toLowerCase().includes(f) || item.syntax.toLowerCase().includes(f)).slice(0, 12);
  }, [acState?.show, acState?.filter, allAcItems]);

  const handleAutocompleteTrigger = useCallback((info: AutocompleteTriggerInfo) => {
    setAcState({
      show: true,
      filter: info.filter,
      x: info.x,
      y: info.y,
      selectedIdx: 0,
      textNode: info.textNode,
      start: info.start,
      end: info.end,
    });
  }, []);

  const handleAutocompleteDismiss = useCallback(() => {
    setAcState(null);
  }, []);

  const handleAcSelect = useCallback((item: AcItem) => {
    if (!acState) return;
    ceRef.current?.replaceRangeWithToken(acState.textNode, acState.start, acState.end, item.syntax);
    setAcState(null);
  }, [acState]);

  const handleAcKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!acState?.show || filteredAcItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAcState(prev => prev ? { ...prev, selectedIdx: (prev.selectedIdx + 1) % filteredAcItems.length } : null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAcState(prev => prev ? { ...prev, selectedIdx: (prev.selectedIdx - 1 + filteredAcItems.length) % filteredAcItems.length } : null);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleAcSelect(filteredAcItems[acState.selectedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAcState(null);
    }
  }, [acState, filteredAcItems, handleAcSelect]);

  // Popover insert
  const insertSyntax = (syntax: string) => {
    ceRef.current?.insertToken(syntax);
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

  const webhookNodesWithFields = integrationNodes.filter(n => (n.responseFields?.length ?? 0) > 0);
  const activeParams = (trackedParams ?? DEFAULT_TRACKED_PARAMS).filter(p => p.enabled && p.key);

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

  const acIconMap: Record<string, React.ReactNode> = {
    var: <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium flex-shrink-0">x</span>,
    field: <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />,
    webhook: <Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />,
    param: <Globe className="h-3 w-3 text-orange-500 flex-shrink-0" />,
    context: <Monitor className="h-3 w-3 text-blue-500 flex-shrink-0" />,
  };

  return (
    <div className="relative flex items-start gap-1 nodrag nopan nowheel">
      <div className="relative flex-1">
        <VariableContentEditable
          ref={ceRef}
          value={value}
          onChange={onChange}
          resolveToken={resolveToken}
          multiline={props.as === 'textarea'}
          rows={props.as === 'textarea' ? props.rows : undefined}
          placeholder={placeholder}
          className={className}
          onAutocompleteTrigger={handleAutocompleteTrigger}
          onAutocompleteDismiss={handleAutocompleteDismiss}
          onKeyDown={handleAcKeyDown}
        />

        {/* Autocomplete dropdown */}
        {acState?.show && filteredAcItems.length > 0 && (
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto min-w-[200px]"
            style={{ left: acState.x, top: acState.y + 4 }}
          >
            {filteredAcItems.map((item, i) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors',
                  i === acState.selectedIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
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

      {/* Variable picker popover */}
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
