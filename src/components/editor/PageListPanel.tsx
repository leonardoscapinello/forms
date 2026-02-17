import { FunnelPage, FormVariable, FormVariableType } from '@/types/form';
import { Plus, FileText, Trash2, Home, Variable, ChevronDown, ChevronRight, Pencil, Check, X, Copy, Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { PageElement } from '@/types/pageElements';
import { isValidVariableName } from '@/lib/variableInterpolation';
import { toast } from 'sonner';

interface Props {
  pages: FunnelPage[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
  showWelcomeScreen?: boolean;
  onToggleWelcomeScreen?: (enabled: boolean) => void;
  isWelcomeSelected?: boolean;
  onSelectWelcome?: () => void;
  // Variables
  variables?: FormVariable[];
  onAddVariable?: () => void;
  onUpdateVariable?: (id: string, patch: Partial<FormVariable>) => void;
  onDeleteVariable?: (id: string) => void;
}

const VARIABLE_TYPE_LABELS: Record<FormVariableType, string> = {
  text: 'Texto',
  number: 'Número',
  boolean: 'Sim/Não',
  response: 'Resposta',
};

export default function PageListPanel({
  pages, selectedPageId, onSelectPage, onAddPage, onDeletePage, onRenamePage,
  showWelcomeScreen, onToggleWelcomeScreen, isWelcomeSelected, onSelectWelcome,
  variables = [], onAddVariable, onUpdateVariable, onDeleteVariable,
}: Props) {
  const [pagesOpen, setPagesOpen] = useState(true);
  const [varsOpen, setVarsOpen] = useState(true);
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editingVarName, setEditingVarName] = useState('');

  // Gather all input elements across pages for the "response" source picker
  const allFields: { pageId: string; pageTitle: string; element: PageElement }[] = [];
  for (const page of pages) {
    for (const el of page.elements || []) {
      if (el.type.startsWith('input_')) {
        allFields.push({ pageId: page.id, pageTitle: page.title, element: el });
      }
    }
  }

  const startEditVar = (v: FormVariable) => {
    setEditingVarId(v.id);
    setEditingVarName(v.name);
  };

  const confirmEditVar = () => {
    if (editingVarId && editingVarName.trim()) {
      const sanitized = editingVarName.trim().replace(/\s+/g, '_');
      if (!isValidVariableName(sanitized)) {
        toast.error('Nome inválido. Use apenas letras, números e _');
        return;
      }
      // Check uniqueness
      const isDuplicate = variables.some(v => v.id !== editingVarId && v.name === sanitized);
      if (isDuplicate) {
        toast.error('Já existe uma variável com esse nome');
        return;
      }
      onUpdateVariable?.(editingVarId, { name: sanitized });
    }
    setEditingVarId(null);
  };

  const copyVarSyntax = (name: string) => {
    navigator.clipboard.writeText(`{{${name}}}`);
    toast.success(`{{${name}}} copiado!`);
  };

  return (
    <div className="w-72 border-r border-border bg-card flex flex-col h-full">
      {/* ─── PAGES SECTION ─── */}
      <button
        className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
        onClick={() => setPagesOpen(!pagesOpen)}
      >
        <div className="flex items-center gap-2">
          {pagesOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <h2 className="text-sm font-semibold text-foreground">Páginas</h2>
        </div>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onAddPage(); }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </button>

      {pagesOpen && (
        <div className="overflow-auto p-2 space-y-1">
          {/* Welcome screen toggle */}
          <div className="px-3 py-2 rounded-lg border border-border/50 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Tela de início</span>
              </div>
              <Switch
                checked={!!showWelcomeScreen}
                onCheckedChange={(checked) => onToggleWelcomeScreen?.(checked)}
                className="scale-75"
              />
            </div>
            {showWelcomeScreen && (
              <button
                className={`mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                  isWelcomeSelected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => onSelectWelcome?.()}
              >
                <Home className="h-3 w-3" />
                <span className="font-medium">Editar tela de início</span>
              </button>
            )}
          </div>

          {pages.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma página</p>
              <p className="text-xs mt-1">Clique em + para adicionar</p>
            </div>
          ) : (
            pages.map((page, index) => (
              <div
                key={page.id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  selectedPageId === page.id
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'hover:bg-muted border border-transparent'
                }`}
                onClick={() => onSelectPage(page.id)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground font-mono w-5 text-center flex-shrink-0">
                    {index + 1}
                  </span>
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{page.title || 'Sem título'}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-muted-foreground">
                    {page.elements?.length || 0}
                  </span>
                  {pages.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── DIVIDER ─── */}
      <div className="border-t border-border" />

      {/* ─── VARIABLES SECTION ─── */}
      <button
        className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
        onClick={() => setVarsOpen(!varsOpen)}
      >
        <div className="flex items-center gap-2">
          {varsOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <h2 className="text-sm font-semibold text-foreground">Variáveis</h2>
          {variables.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{variables.length}</span>
          )}
        </div>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onAddVariable?.(); }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </button>

      {varsOpen && (
        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {variables.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Variable className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma variável</p>
              <p className="text-xs mt-1">Crie variáveis e use <code className="font-mono bg-muted px-1 rounded">{`{{nome}}`}</code> nos textos</p>
            </div>
          ) : (
            variables.map(v => (
              <div key={v.id} className="group rounded-lg border border-border/50 p-2.5 space-y-2 hover:border-border transition-colors">
                {/* Variable name */}
                <div className="flex items-center gap-2">
                  <Variable className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  {editingVarId === v.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={editingVarName}
                        onChange={e => setEditingVarName(e.target.value)}
                        className="h-6 text-xs px-1.5 py-0"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') confirmEditVar(); if (e.key === 'Escape') setEditingVarId(null); }}
                      />
                      <button onClick={confirmEditVar} className="p-0.5 text-primary"><Check className="h-3 w-3" /></button>
                      <button onClick={() => setEditingVarId(null)} className="p-0.5 text-muted-foreground"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{v.name}</span>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditVar(v)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDeleteVariable?.(v.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Copyable syntax tag */}
                <button
                  onClick={() => copyVarSyntax(v.name)}
                  className="group/tag flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/8 border border-primary/20 hover:bg-primary/15 hover:border-primary/40 text-[11px] font-mono text-primary transition-all w-full justify-between"
                  title="Clique para copiar"
                >
                  <div className="flex items-center gap-1.5">
                    <Braces className="h-3 w-3 opacity-60" />
                    <span>{`{{${v.name}}}`}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover/tag:opacity-100 transition-opacity">
                    <Copy className="h-3 w-3" />
                    <span className="text-[10px] font-sans">copiar</span>
                  </div>
                </button>

                {/* Variable type */}
                <Select
                  value={v.type}
                  onValueChange={(val) => onUpdateVariable?.(v.id, {
                    type: val as FormVariableType,
                    sourceElementId: val === 'response' ? v.sourceElementId : undefined,
                    sourcePageId: val === 'response' ? v.sourcePageId : undefined,
                  })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VARIABLE_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Source element picker (for 'response' type) */}
                {v.type === 'response' && (
                  <Select
                    value={v.sourceElementId || ''}
                    onValueChange={(val) => {
                      const field = allFields.find(f => f.element.id === val);
                      onUpdateVariable?.(v.id, {
                        sourceElementId: val,
                        sourcePageId: field?.pageId,
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Selecione o campo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allFields.map(f => (
                        <SelectItem key={f.element.id} value={f.element.id} className="text-xs">
                          {f.pageTitle} → {f.element.label || f.element.type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Default value for non-response types */}
                {v.type !== 'response' && (
                  <Input
                    value={v.defaultValue || ''}
                    onChange={e => onUpdateVariable?.(v.id, { defaultValue: e.target.value })}
                    placeholder="Valor padrão"
                    className="h-7 text-xs"
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Add button at bottom */}
      <div className="p-3 border-t border-border space-y-1.5">
        <Button variant="outline" className="w-full border-dashed" size="sm" onClick={onAddPage}>
          <Plus className="mr-2 h-4 w-4" />
          Nova página
        </Button>
        <Button variant="outline" className="w-full border-dashed" size="sm" onClick={() => onAddVariable?.()}>
          <Variable className="mr-2 h-4 w-4" />
          Nova variável
        </Button>
      </div>
    </div>
  );
}
