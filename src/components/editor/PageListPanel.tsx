import { FunnelPage, FormVariable, FormVariableType } from '@/types/form';
import { COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import { Plus, FileText, Trash2, Home, Variable, Pencil, Check, X, Copy, Braces, CheckCircle, Settings2, ChevronDown, ChevronRight, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState, useEffect } from 'react';
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
  disconnectedPageIds?: Set<string>;
  /** Called when an element is dropped onto a page row to move it there */
  onMoveElementToPage?: (element: PageElement, targetPageId: string) => void;
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

function SectionHeader({
  title,
  count,
  open,
  onToggle,
  action,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 select-none">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left group"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        }
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium ml-0.5">
            {count}
          </span>
        )}
      </button>
      {action}
    </div>
  );
}

export default function PageListPanel({
  pages, selectedPageId, onSelectPage, onAddPage, onDeletePage, onRenamePage,
  showWelcomeScreen, onToggleWelcomeScreen, isWelcomeSelected, onSelectWelcome,
  isThankYouSelected, onSelectThankYou,
  variables = [], onAddVariable, onUpdateVariable, onDeleteVariable,
  disconnectedPageIds = new Set(),
  onMoveElementToPage,
}: Props) {
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);
  const [dndKitHoverPageId, setDndKitHoverPageId] = useState<string | null>(null);
  const [pagesOpen, setPagesOpen] = useState(true);
  const [varsOpen, setVarsOpen] = useState(false);
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editingVarName, setEditingVarName] = useState('');
  const [settingsVarId, setSettingsVarId] = useState<string | null>(null);

  // Listen for dnd-kit drag hover events from PageBuilder
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDndKitHoverPageId(detail?.pageId || null);
    };
    window.addEventListener('element-drag-over-page', handler);
    return () => window.removeEventListener('element-drag-over-page', handler);
  }, []);

  const activeDropPageId = dragOverPageId || dndKitHoverPageId;

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
    <div className="w-64 border-r border-border bg-card flex flex-col h-full">
      <div className="flex-1 overflow-auto py-2">

        {/* ─── PAGES SECTION ─── */}
        <SectionHeader
          title="Páginas"
          count={pages.length}
          open={pagesOpen}
          onToggle={() => setPagesOpen(v => !v)}
          action={
            <button
              onClick={onAddPage}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Nova página"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          }
        />

        {pagesOpen && (
          <div className="pb-2 space-y-0.5 px-2">
            {/* Welcome screen */}
            <div
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                isWelcomeSelected
                  ? 'bg-accent text-foreground border border-border'
                  : 'hover:bg-muted border border-transparent'
              }`}
              onClick={() => showWelcomeScreen && onSelectWelcome?.()}
            >
              <Home className={`h-3.5 w-3.5 flex-shrink-0 ${!showWelcomeScreen ? 'opacity-30' : ''}`} />
              <span className={`text-xs font-medium truncate flex-1 ${!showWelcomeScreen ? 'opacity-40' : ''}`}>
                Tela de início
              </span>
              <Switch
                checked={!!showWelcomeScreen}
                onCheckedChange={(checked) => { onToggleWelcomeScreen?.(checked); }}
                className="scale-[0.65] flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {pages.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                <p className="text-xs">Nenhuma página</p>
              </div>
            ) : (
              pages.map((page, index) => {
                const isDisconnected = disconnectedPageIds.has(page.id);
                return (
                <div
                  key={page.id}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                    activeDropPageId === page.id
                      ? 'bg-primary/15 border-2 border-primary/50 ring-2 ring-primary/20 scale-[1.03] shadow-sm'
                      : selectedPageId === page.id
                        ? 'bg-accent text-foreground border border-border'
                        : isDisconnected
                          ? 'hover:bg-muted border border-destructive/30 bg-destructive/5'
                          : 'hover:bg-muted border border-transparent'
                  }`}
                  data-page-drop-id={page.id}
                  onClick={() => onSelectPage(page.id)}
                  title={isDisconnected ? 'Esta página não está conectada ao fluxo e não será exibida' : undefined}
                  onDragOver={(e) => {
                    const hasElementData = Array.from(e.dataTransfer.types).includes('element-move-json');
                    if (hasElementData) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverPageId(page.id);
                    }
                  }}
                  onDragEnter={(e) => {
                    const hasElementData = Array.from(e.dataTransfer.types).includes('element-move-json');
                    if (hasElementData) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverPageId(page.id);
                    }
                  }}
                  onDragLeave={() => setDragOverPageId(prev => prev === page.id ? null : prev)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverPageId(null);
                    const moveJson = e.dataTransfer.getData('element-move-json');
                    if (moveJson && onMoveElementToPage) {
                      try {
                        const element = JSON.parse(moveJson) as PageElement;
                        onMoveElementToPage(element, page.id);
                        toast.success(`Elemento movido para "${page.title || 'Sem título'}"`);
                      } catch { /* ignore */ }
                    }
                  }}
                >
                  {activeDropPageId === page.id ? (
                    <>
                      <span className="text-[10px] text-primary font-semibold w-4 text-center flex-shrink-0">↓</span>
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <span className="text-xs font-semibold text-primary truncate flex-1">Soltar aqui</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-muted-foreground font-mono w-4 text-center flex-shrink-0">
                        {index + 1}
                      </span>
                      {isDisconnected ? (
                        <Unplug className="h-3.5 w-3.5 flex-shrink-0 text-destructive/70" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className={`text-xs font-medium truncate flex-1 ${isDisconnected ? 'text-destructive/70' : ''}`}>{page.title || 'Sem título'}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-muted-foreground">{page.elements?.length || 0}</span>
                        {pages.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); }}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                );
              })
            )}

            {/* Thank you page */}
            <div
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                isThankYouSelected
                  ? 'bg-accent text-foreground border border-border'
                  : 'hover:bg-muted border border-transparent'
              }`}
              onClick={() => onSelectThankYou?.()}
            >
              <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="text-xs font-medium truncate flex-1">Tela de obrigado</span>
            </div>
          </div>
        )}

        {/* ─── DIVIDER ─── */}
        <div className="mx-3 my-1 h-px bg-border/60" />

        {/* ─── VARIABLES SECTION ─── */}
        <SectionHeader
          title="Variáveis"
          count={variables.length}
          open={varsOpen}
          onToggle={() => setVarsOpen(v => !v)}
          action={
            <button
              onClick={() => { onAddVariable?.(); setVarsOpen(true); }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Nova variável"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          }
        />

        {varsOpen && (
          <div className="pb-2 space-y-0.5 px-2">
            {variables.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground px-3">
                <Braces className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                <p className="text-xs font-medium">Nenhuma variável</p>
                <p className="text-[11px] mt-0.5 leading-relaxed">
                  Use <code className="font-mono bg-muted px-0.5 rounded">{`{{nome}}`}</code> nos textos para valores dinâmicos
                </p>
              </div>
            ) : (
              variables.map(v => (
                <div
                  key={v.id}
                  className="group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors"
                >
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide flex-shrink-0 ${TYPE_BADGE[v.type]}`}>
                    {VARIABLE_TYPE_LABELS[v.type].slice(0, 3)}
                  </span>

                  {editingVarId === v.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={editingVarName}
                        onChange={e => setEditingVarName(e.target.value)}
                        className="h-6 text-xs px-1.5 py-0"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') confirmEditVar(); if (e.key === 'Escape') setEditingVarId(null); }}
                      />
                      <button onClick={confirmEditVar} className="p-0.5 text-foreground flex-shrink-0"><Check className="h-3 w-3" /></button>
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

                  {editingVarId !== v.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditVar(v)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Renomear">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => setSettingsVarId(v.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Configurar">
                        <Settings2 className="h-3 w-3" />
                      </button>
                      <button onClick={() => onDeleteVariable?.(v.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Excluir">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ─── VARIABLE SETTINGS MODAL ─── */}
      <Dialog open={!!settingsVarId} onOpenChange={open => !open && setSettingsVarId(null)}>
        <DialogContent className="max-w-sm">
          {settingsVar && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <Braces className="h-4 w-4 text-foreground" />
                  <code className="font-mono">{`{{${settingsVar.name}}}`}</code>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-1">
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
                        {allFields.flatMap(f => {
                          const subKeys = COMPOUND_FIELD_SUB_KEYS[f.element.type];
                          const baseLabel = f.element.label || f.element.type;
                          if (subKeys) {
                            return [
                              <SelectItem key={f.element.id} value={f.element.id} className="text-xs">
                                {f.pageTitle} → {baseLabel} (completo)
                              </SelectItem>,
                              ...subKeys.map(sub => (
                                <SelectItem key={`${f.element.id}.${sub.key}`} value={`${f.element.id}.${sub.key}`} className="text-xs pl-6">
                                  {f.pageTitle} → {baseLabel} → {sub.label}
                                </SelectItem>
                              )),
                            ];
                          }
                          return [
                            <SelectItem key={f.element.id} value={f.element.id} className="text-xs">
                              {f.pageTitle} → {baseLabel}
                            </SelectItem>,
                          ];
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

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
