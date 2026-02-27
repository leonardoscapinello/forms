import { useState } from 'react';
import { FormVariable, VariableAssignment, VariableAssignmentSource } from '@/types/form';
import { Plus, Trash2, Variable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONTEXT_KEYS } from '@/lib/sessionContext';

export interface InputElementGroup {
  pageId: string;
  pageTitle: string;
  elements: { elementId: string; elementLabel: string }[];
}

interface Props {
  assignments: VariableAssignment[];
  variables: FormVariable[];
  /** Input elements grouped by page, only including previous pages */
  allInputElements: InputElementGroup[];
  onChange: (assignments: VariableAssignment[]) => void;
}

const SOURCE_LABELS: Record<VariableAssignmentSource, string> = {
  field: 'Campo do formulário',
  free: 'Valor livre',
  context: 'Fator de contexto',
  param: 'Parâmetro GET',
};

export default function VariableAssignPanel({ assignments, variables, allInputElements, onChange }: Props) {
  const [localAssignments, setLocalAssignments] = useState<VariableAssignment[]>(assignments);

  const commit = (next: VariableAssignment[]) => {
    setLocalAssignments(next);
    onChange(next);
  };

  const addAssignment = () => {
    if (variables.length === 0) return;
    const newA: VariableAssignment = {
      id: crypto.randomUUID(),
      variableId: variables[0].id,
      sourceType: 'free',
      value: '',
    };
    commit([...localAssignments, newA]);
  };

  const update = (id: string, patch: Partial<VariableAssignment>) => {
    commit(localAssignments.map(a => a.id === id ? { ...a, ...patch } : a));
  };

  const remove = (id: string) => {
    commit(localAssignments.filter(a => a.id !== id));
  };

  if (variables.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        <Variable className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
        Crie variáveis primeiro no painel de páginas
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {localAssignments.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-2">
          Nenhuma atribuição nesta página
        </p>
      ) : (
        <div className="space-y-2.5">
          {localAssignments.map((a) => {
            const variable = variables.find(v => v.id === a.variableId);
            return (
              <div key={a.id} className="rounded-lg border border-border/70 p-2.5 space-y-2 bg-muted/20">
                {/* Variable picker */}
                <div className="flex items-center gap-2">
                  <Select
                    value={a.variableId}
                    onValueChange={val => update(a.id, { variableId: val })}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Variável..." />
                    </SelectTrigger>
                    <SelectContent>
                      {variables.map(v => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          <span className="font-mono text-primary">{`{{${v.name}}}`}</span>
                          <span className="ml-1.5 text-muted-foreground">({v.type})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => remove(a.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Source type */}
                <Select
                  value={a.sourceType}
                  onValueChange={val => update(a.id, {
                    sourceType: val as VariableAssignmentSource,
                    sourceElementId: undefined,
                    value: '',
                  })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Source value */}
                {a.sourceType === 'field' ? (
                  <Select
                    value={a.sourceElementId || ''}
                    onValueChange={val => update(a.id, { sourceElementId: val })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Selecione o campo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allInputElements.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                          Nenhum campo de entrada nas páginas anteriores
                        </div>
                      ) : (
                        allInputElements.map(group => (
                          <SelectGroup key={group.pageId}>
                            <SelectLabel className="text-[10px] font-semibold text-muted-foreground px-2 py-1">
                              📄 {group.pageTitle}
                            </SelectLabel>
                            {group.elements.map(el => (
                              <SelectItem key={el.elementId} value={el.elementId} className="text-xs pl-4">
                                {el.elementLabel}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                ) : a.sourceType === 'context' ? (
                  <Select
                    value={a.value || ''}
                    onValueChange={val => update(a.id, { value: val })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Fator de contexto..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {(() => {
                        const categories = [...new Set(CONTEXT_KEYS.map(c => c.category))];
                        return categories.map(cat => (
                          <SelectGroup key={cat}>
                            <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">{cat}</SelectLabel>
                            {CONTEXT_KEYS.filter(c => c.category === cat).map(c => (
                              <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                ) : a.sourceType === 'param' ? (
                  <div className="space-y-1">
                    <Input
                      value={a.value || ''}
                      onChange={e => update(a.id, { value: e.target.value })}
                      placeholder="Nome do parâmetro (ex: utm_source)"
                      className="h-7 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Captura <code className="font-mono bg-muted px-0.5 rounded">?{a.value || 'param'}=valor</code> da URL
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input
                      value={a.value || ''}
                      onChange={e => update(a.id, { value: e.target.value })}
                      placeholder={`Valor para {{${variable?.name || ''}}}...`}
                      className="h-7 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Pode usar <code className="font-mono bg-muted px-0.5 rounded">{`{{outra_var}}`}</code>, <code className="font-mono bg-muted px-0.5 rounded">{`{{ctx.device}}`}</code> ou <code className="font-mono bg-muted px-0.5 rounded">{`{{param.utm_source}}`}</code>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed h-7 text-xs"
        onClick={addAssignment}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Adicionar atribuição
      </Button>
    </div>
  );
}
