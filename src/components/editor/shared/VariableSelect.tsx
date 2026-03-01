import { useState } from 'react';
import { FormVariable, FormVariableType, IntegrationNodeData } from '@/types/form';
import { Plus, Webhook } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Safely access nested value by dot/bracket path */
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split(/[.[\]]+/).filter(Boolean).reduce((o, k) => o?.[k], obj);
}

interface Props {
  value: string;
  variables: FormVariable[];
  onValueChange: (variableId: string) => void;
  onCreateVariable?: (variable: FormVariable) => void;
  /** Integration nodes from the workflow (upstream webhooks) */
  integrationNodes?: IntegrationNodeData[];
  placeholder?: string;
  className?: string;
  /** Accent class for the variable name display */
  accentClass?: string;
}

/**
 * A Select for picking a form variable, with an inline "create new" option
 * and webhook response field references.
 */
export default function VariableSelect({
  value,
  variables,
  onValueChange,
  onCreateVariable,
  integrationNodes = [],
  placeholder = 'Variável...',
  className,
  accentClass = 'text-primary',
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FormVariableType>('text');

  const webhookNodesWithFields = integrationNodes.filter(n => (n.responseFields?.length ?? 0) > 0);

  const handleCreate = () => {
    if (!newName.trim() || !onCreateVariable) return;
    const sanitized = newName.trim().replace(/\s+/g, '_').toLowerCase();
    const newVar: FormVariable = {
      id: crypto.randomUUID(),
      name: sanitized,
      type: newType,
      defaultValue: '',
    };
    onCreateVariable(newVar);
    onValueChange(newVar.id);
    setCreating(false);
    setNewName('');
    setNewType('text');
  };

  /** Format a sample value for display (truncated) */
  const formatSample = (val: any): string => {
    if (val === undefined || val === null) return '';
    const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return s.length > 30 ? s.slice(0, 27) + '…' : s;
  };

  if (creating) {
    return (
      <div className="flex items-center gap-1.5 flex-1">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="nome_variavel"
          className="h-7 text-xs font-mono flex-1"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') { setCreating(false); setNewName(''); }
          }}
        />
        <select
          value={newType}
          onChange={e => setNewType(e.target.value as FormVariableType)}
          className="h-7 text-[10px] bg-muted border border-border rounded px-1"
        >
          <option value="text">Texto</option>
          <option value="number">Número</option>
          <option value="boolean">Bool</option>
        </select>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCreate} disabled={!newName.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Build a display label for the currently selected value (if it's a webhook ref)
  const getDisplayLabel = () => {
    if (!value) return undefined;
    // Check if it's a variable
    const v = variables.find(v => v.id === value);
    if (v) return undefined; // default rendering handles it
    // Check if it's a webhook ref (format: webhook:<nodeId>:<path>)
    if (value.startsWith('webhook:')) {
      const parts = value.split(':');
      const path = parts.slice(2).join(':');
      return path || value;
    }
    return undefined;
  };

  return (
    <Select value={value} onValueChange={val => {
      if (val === '__create__') {
        setCreating(true);
      } else {
        onValueChange(val);
      }
    }}>
      <SelectTrigger className={`h-7 text-xs flex-1 ${className || ''}`}>
        <SelectValue placeholder={placeholder}>
          {(() => {
            const v = variables.find(v => v.id === value);
            if (v) return <span className={`font-mono ${accentClass}`}>{`{{${v.name}}}`}</span>;
            if (value?.startsWith('webhook:')) {
              const path = value.split(':').slice(2).join(':');
              return (
                <span className="flex items-center gap-1 font-mono text-xs">
                  <Webhook className="h-3 w-3 text-node-webhook-accent" />
                  {path}
                </span>
              );
            }
            return undefined;
          })()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" side="top" align="start" className="z-[9999] max-h-60">
        {/* Variables section */}
        {variables.length > 0 && (
          <div className="px-2 pt-1.5 pb-0.5">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Variáveis</span>
          </div>
        )}
        {variables.map(v => (
          <SelectItem key={v.id} value={v.id} className="text-xs">
            <span className={`font-mono ${accentClass}`}>{`{{${v.name}}}`}</span>
            <span className="ml-1.5 text-muted-foreground">({v.type})</span>
          </SelectItem>
        ))}

        {/* Webhook response fields section */}
        {webhookNodesWithFields.length > 0 && (
          <div className="px-2 pt-2 pb-0.5">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Retorno Webhook</span>
          </div>
        )}
        {webhookNodesWithFields.map(wn => {
          const host = wn.webhookUrl
            ? (() => { try { return new URL(wn.webhookUrl).hostname; } catch { return wn.id.slice(0, 8); } })()
            : wn.id.slice(0, 8);
          return (wn.responseFields || []).map(field => {
            const selectVal = `webhook:${wn.id}:${field}`;
            const sampleVal = wn.lastTestResponse ? getNestedValue(wn.lastTestResponse, field) : undefined;
            return (
              <SelectItem key={selectVal} value={selectVal} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <Webhook className="h-3 w-3 text-node-webhook-accent flex-shrink-0" />
                  <span className="font-mono text-foreground">{field}</span>
                  {sampleVal !== undefined && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                      = {formatSample(sampleVal)}
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          });
        })}

        {/* Create new variable */}
        {onCreateVariable && (
          <SelectItem value="__create__" className="text-xs text-primary">
            <span className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Nova variável
            </span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
