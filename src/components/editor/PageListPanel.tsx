import { FunnelPage, FormVariable, FormVariableType } from '@/types/form';
import { Plus, FileText, Trash2, Home, Variable, Pencil, Check, X, Copy, Braces, CheckCircle, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  isThankYouSelected?: boolean;
  onSelectThankYou?: () => void;
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

const TYPE_BADGE: Record<FormVariableType, string> = {
  text: 'bg-muted text-muted-foreground',
  number: 'bg-blue-500/10 text-blue-600',
  boolean: 'bg-purple-500/10 text-purple-600',
  response: 'bg-amber-500/10 text-amber-600',
};

export default function PageListPanel({
  pages, selectedPageId, onSelectPage, onAddPage, onDeletePage, onRenamePage,
  showWelcomeScreen, onToggleWelcomeScreen, isWelcomeSelected, onSelectWelcome,
  isThankYouSelected, onSelectThankYou,
  variables = [], onAddVariable, onUpdateVariable, onDeleteVariable,
}: Props) {
  const [activeTab, setActiveTab] = useState<'pages' | 'variables'>('pages');
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editingVarName, setEditingVarName] = useState('');
  const [settingsVarId, setSettingsVarId] = useState<string | null>(null);

  const allFields: { pageId: string; pageTitle: string; element: PageElement }[] = [];
  for (const page of pages) {
    for (const el of page.elements || []) {
      if (el.type.startsWith('input_')) {
        allFields.push({ pageId: page.id, pageTitle: page.title, element: el });
      }
    }
  }

  const settingsVar = variables.find(v => v.id === settingsVarId) ?? null;

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
      {/* ─── TAB SWITCHER ─── */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab('pages')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'pages'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Páginas
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            {pages.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('variables')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'variables'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Braces className="h-3.5 w-3.5" />
          Variáveis
          {variables.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {variables.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── PAGES TAB ─── */}
      {activeTab === 'pages' && (
        <>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {/* Welcome screen */}
            <div
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isWelcomeSelected
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'hover:bg-muted border border-transparent'
              }`}
              onClick={() => showWelcomeScreen && onSelectWelcome?.()}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground font-mono w-5 text-center flex-shrink-0 opacity-0 select-none">0</span>
                <Home className="h-4 w-4 flex-shrink-0" />
                <span className={`text-sm font-medium truncate ${!showWelcomeScreen ? 'opacity-40' : ''}`}>Tela de início</span>
              </div>
              <Switch
                checked={!!showWelcomeScreen}
                onCheckedChange={(checked) => { onToggleWelcomeScreen?.(checked); }}
                className="scale-75 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
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

            {/* Thank you page */}
            <div
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isThankYouSelected
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'hover:bg-muted border border-transparent'
              }`}
              onClick={() => onSelectThankYou?.()}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground font-mono w-5 text-center flex-shrink-0 opacity-0 select-none">0</span>
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium truncate">Tela de obrigado</span>
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-border">
            <Button variant="outline" className="w-full border-dashed" size="sm" onClick={onAddPage}>
              <Plus className="mr-2 h-4 w-4" />
              Nova página
            </Button>
          </div>
        </>
      )}

      {/* ─── VARIABLES TAB ─── */}
      {activeTab === 'variables' && (
        <>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {variables.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground px-4">
                <Braces className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Nenhuma variável</p>
                <p className="text-xs mt-1 leading-relaxed">
                  Use <code className="font-mono bg-muted px-1 rounded">{`{{nome}}`}</code> nos textos para inserir valores dinamicamente
                </p>
              </div>
            ) : (
              variables.map(v => (
                <div
                  key={v.id}
                  className="group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors"
                >
                  {/* Type badge */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide flex-shrink-0 ${TYPE_BADGE[v.type]}`}>
                    {VARIABLE_TYPE_LABELS[v.type].slice(0, 3)}
                  </span>

                  {/* Name / edit */}
                  {editingVarId === v.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={editingVarName}
                        onChange={e => setEditingVarName(e.target.value)}
                        className="h-6 text-xs px-1.5 py-0"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') confirmEditVar(); if (e.key === 'Escape') setEditingVarId(null); }}
                      />
                      <button onClick={confirmEditVar} className="p-0.5 text-primary flex-shrink-0"><Check className="h-3 w-3" /></button>
                      <button onClick={() => setEditingVarId(null)} className="p-0.5 text-muted-foreground flex-shrink-0"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <button
                      className="flex-1 min-w-0 text-left flex items-center gap-1.5 group/copy"
                      onClick={() => copyVarSyntax(v.name)}
                      title="Clique para copiar"
                    >
                      <span className="text-xs font-mono text-foreground truncate">{`{{${v.name}}}`}</span>
                      <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover/copy:opacity-100 flex-shrink-0 transition-opacity" />
                    </button>
                  )}

                  {/* Actions */}
                  {editingVarId !== v.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditVar(v)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Renomear"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setSettingsVarId(v.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Configurar"
                      >
                        <Settings2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDeleteVariable?.(v.id)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-border">
            <Button variant="outline" className="w-full border-dashed" size="sm" onClick={() => onAddVariable?.()}>
              <Variable className="mr-2 h-4 w-4" />
              Nova variável
            </Button>
          </div>
        </>
      )}

      {/* ─── VARIABLE SETTINGS MODAL ─── */}
      <Dialog open={!!settingsVarId} onOpenChange={open => !open && setSettingsVarId(null)}>
        <DialogContent className="max-w-sm">
          {settingsVar && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <Braces className="h-4 w-4 text-primary" />
                  <code className="font-mono">{`{{${settingsVar.name}}}`}</code>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                {/* Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                  <Select
                    value={settingsVar.type}
                    onValueChange={(val) => onUpdateVariable?.(settingsVar.id, {
                      type: val as FormVariableType,
                      sourceElementId: val === 'response' ? settingsVar.sourceElementId : undefined,
                      sourcePageId: val === 'response' ? settingsVar.sourcePageId : undefined,
                    })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VARIABLE_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Source element picker */}
                {settingsVar.type === 'response' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Campo de origem</label>
                    <Select
                      value={settingsVar.sourceElementId || ''}
                      onValueChange={(val) => {
                        const field = allFields.find(f => f.element.id === val);
                        onUpdateVariable?.(settingsVar.id, {
                          sourceElementId: val,
                          sourcePageId: field?.pageId,
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                  </div>
                )}

                {/* Default value */}
                {settingsVar.type !== 'response' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Valor padrão</label>
                    <Input
                      value={settingsVar.defaultValue || ''}
                      onChange={e => onUpdateVariable?.(settingsVar.id, { defaultValue: e.target.value })}
                      placeholder={`Valor inicial de {{${settingsVar.name}}}...`}
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Pode usar <code className="font-mono bg-muted px-0.5 rounded">{`{{outra_var}}`}</code> para referenciar outras variáveis
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
