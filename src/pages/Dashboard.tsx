import { useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useTags, useAllFormTags } from '@/hooks/useTags';
import { useFolders } from '@/hooks/useFolders';
import { supabase } from '@/integrations/supabase/client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, FileText, MoreHorizontal, Trash2,
  Tag, X, Folder, FolderInput,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import FolderTree from '@/components/FolderTree';
import { FormTagsPicker, MoveToFolderMenu } from '@/components/dashboard/FormMenus';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

/* ── Inline sparkline chart ── */
function InlineChart({ responses, dropoffs }: { responses: number[]; dropoffs: number[] }) {
  const maxVal = Math.max(...responses, ...dropoffs, 1);
  const w = 100;
  const h = 28;
  const barW = 8;
  const gap = (w - barW * 7) / 6;

  // Smooth cubic bezier path from dropoff points
  const dPoints = dropoffs.map((v, i) => ({
    x: i * (barW + gap) + barW / 2,
    y: h - (v / maxVal) * (h - 2) - 1,
  }));

  function smoothPath(pts: { x: number; y: number }[]) {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      d += ` C${cx},${pts[i].y} ${cx},${pts[i + 1].y} ${pts[i + 1].x},${pts[i + 1].y}`;
    }
    return d;
  }

  const barColor = 'hsl(var(--primary))';
  const lineColor = 'hsl(var(--destructive) / 0.35)';

  return (
    <svg width={w} height={h} className="flex-shrink-0" viewBox={`0 0 ${w} ${h}`}>
      {/* Response bars */}
      {responses.map((v, i) => {
        const barH = Math.max((v / maxVal) * (h - 2), v > 0 ? 2 : 0);
        const x = i * (barW + gap);
        const y = h - barH;
        return (
          <rect
            key={i}
            x={x} y={y}
            width={barW} height={barH}
            rx={2}
            fill={barColor}
            opacity={0.85}
          />
        );
      })}
      {/* Dropoff smooth line */}
      {dropoffs.some(v => v > 0) && (
        <path
          d={smoothPath(dPoints)}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.8}
        />
      )}
      {/* Dropoff dots */}
      {dropoffs.map((v, i) => {
        if (v === 0) return null;
        return <circle key={i} cx={dPoints[i].x} cy={dPoints[i].y} r={1.5} fill={lineColor} />;
      })}
    </svg>
  );
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  published: { label: 'Ativo', className: 'bg-success/10 text-success border border-success/30' },
  closed: { label: 'Fechado', className: 'bg-destructive/10 text-destructive border border-destructive/20' },
  archived: { label: 'Arquivado', className: 'bg-muted/50 text-muted-foreground/60' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { forms, homeSummaries: sparkData, createForm, deleteForm, moveFormToFolder } = useFormStore();
  const { tags } = useTags();
  const foldersState = useFolders();
  const { folders } = foldersState;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [localTagsMap, setLocalTagsMap] = useState<Record<string, string[]>>({});
  const [draggingFormId, setDraggingFormId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const formIds = useMemo(() => forms.map(f => f.id), [forms]);
  const formTagsMap = useAllFormTags(formIds);

  const getFormTagIds = useCallback((formId: string) => localTagsMap[formId] ?? formTagsMap[formId] ?? [], [localTagsMap, formTagsMap]);

  const toggleTag = useCallback(async (formId: string, tagId: string, isActive: boolean) => {
    const current = getFormTagIds(formId);
    const next = isActive ? current.filter(id => id !== tagId) : [...current, tagId];
    setLocalTagsMap(prev => ({ ...prev, [formId]: next }));
    const { data, error } = isActive
      ? await supabase.from('form_tags').delete().eq('form_id', formId).eq('tag_id', tagId).select('form_id, tag_id').maybeSingle()
      : await supabase.from('form_tags').insert({ form_id: formId, tag_id: tagId }).select('form_id, tag_id').maybeSingle();
    if (error || data?.form_id !== formId || data?.tag_id !== tagId) {
      setLocalTagsMap(prev => ({ ...prev, [formId]: current }));
      toast.error('Não foi possível atualizar a etiqueta. A seleção anterior foi restaurada.');
    }
  }, [getFormTagIds]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { itemId, targetFolderId } = (e as CustomEvent).detail;
      moveFormToFolder(itemId, targetFolderId);
    };
    window.addEventListener('folder-drop', handler);
    return () => window.removeEventListener('folder-drop', handler);
  }, [moveFormToFolder]);

  const handleCreate = async () => {
    const form = await createForm(selectedFolderId);
    if (form) navigate(`/editor/${form.id}`);
  };

  const formsInFolder = selectedFolderId === null
    ? forms
    : forms.filter(f => f.folderId === selectedFolderId);

  const filteredForms = filterTagId
    ? formsInFolder.filter(f => getFormTagIds(f.id).includes(filterTagId))
    : formsInFolder;

  const selectedFolderName = selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Folder sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r border-border bg-card flex-col">
        <FolderTree
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          useFoldersState={foldersState}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1100px] p-6 sm:p-8 lg:p-10">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              {selectedFolderId ? (
                <>
                  <Folder className="h-5 w-5 text-muted-foreground" />
                  {selectedFolderName}
                </>
              ) : (
                'Formulários'
              )}
            </h1>
            <span className="text-[11px] text-muted-foreground bg-[hsl(var(--paper-300))] px-2 py-0.5 rounded-full font-medium">
              {filteredForms.length}
            </span>
            <div className="flex-1" />
            <Button onClick={handleCreate} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Novo formulário
            </Button>
          </div>

          {/* Tag filter */}
          {tags.length > 0 && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                  style={filterTagId === tag.id
                    ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' }
                    : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filterTagId === tag.id ? 'rgba(255,255,255,0.8)' : tag.color }} />
                  {tag.name}
                  {filterTagId === tag.id && <X className="h-3 w-3 ml-0.5" />}
                </button>
              ))}
            </div>
          )}

          {/* Form list — table style */}
          {filteredForms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border bg-card">
              <div className="rounded-full bg-[hsl(var(--paper-300))] p-4 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">
                {filterTagId ? 'Nenhum formulário com essa tag' : 'Nenhum formulário aqui'}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {filterTagId ? 'Adicione a tag a um formulário.' : selectedFolderId ? 'Crie um formulário diretamente nesta pasta.' : 'Crie seu primeiro formulário para começar.'}
              </p>
              {!filterTagId && (
                <Button onClick={handleCreate} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar formulário
                </Button>
              )}
            </div>
          ) : (
            <div className="w-full space-y-1">
              {filteredForms.map(form => {
                const status = STATUS_MAP[form.status] ?? STATUS_MAP.draft;
                const formTags = tags.filter(t => getFormTagIds(form.id).includes(t.id));
                const folderName = form.folderId && !selectedFolderId ? folders.find(f => f.id === form.folderId)?.name : null;

                return (
                  <div
                    key={form.id}
                    draggable
                    onDragStart={e => {
                      setDraggingFormId(form.id);
                      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'form', id: form.id }));
                    }}
                    onDragEnd={() => setDraggingFormId(null)}
                    onClick={() => navigate(`/editor/${form.id}`)}
                    className={`group flex min-h-16 w-full items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-colors hover:bg-[hsl(var(--paper-300)/0.5)] ${draggingFormId === form.id ? 'opacity-50' : ''}`}
                  >
                    {/* Icon */}
                    <div className="h-10 w-10 rounded-xl bg-[hsl(var(--paper-300))] flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-[hsl(var(--paper-800))]" />
                    </div>

                    {/* Name + meta */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{form.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        <span className={`font-semibold px-1.5 py-px rounded ${status.className}`}>
                          {status.label}
                        </span>
                        <span className="tabular-nums">{form.responseCount ?? 0} respostas</span>
                        <span>·</span>
                        <span>
                          {form.updatedAt
                            ? formatDistanceToNow(new Date(form.updatedAt), { addSuffix: true, locale: ptBR })
                            : '—'}
                        </span>
                        {folderName && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Folder className="h-2.5 w-2.5" />
                              {folderName}
                            </span>
                          </>
                        )}
                        {formTags.length > 0 && (
                          <div className="flex items-center gap-1 ml-1">
                            {formTags.slice(0, 3).map(tag => (
                              <span
                                key={tag.id}
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: tag.color }}
                                title={tag.name}
                              />
                            ))}
                            {formTags.length > 3 && (
                              <span className="text-[10px]">+{formTags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Sparkline */}
                    <div className="flex-shrink-0 hidden sm:block" title="Últimos 7 dias: barras = respostas, linha = abandonos">
                      {sparkData[form.id] ? (
                        <InlineChart responses={sparkData[form.id].responses} dropoffs={sparkData[form.id].dropoffs} />
                      ) : (
                        <div className="w-[100px] h-7" />
                      )}
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-xs">
                            <FolderInput className="h-3.5 w-3.5 mr-2" />
                            Mover para pasta
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                            <MoveToFolderMenu
                              folders={folders}
                              currentFolderId={form.folderId}
                              onMove={(folderId) => moveFormToFolder(form.id, folderId)}
                            />
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-xs">
                            <Tag className="h-3.5 w-3.5 mr-2" />
                            Tags
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <FormTagsPicker tags={tags} formTagIds={getFormTagIds(form.id)} onToggle={(tagId, isActive) => toggleTag(form.id, tagId, isActive)} />
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ id: form.id, title: form.title })}>
                          <Trash2 className="mr-2 h-4 w-4" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir formulário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-semibold">"{deleteTarget?.title || 'este formulário'}"</span>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteForm(deleteTarget.id); setDeleteTarget(null); } }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
