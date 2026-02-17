import { useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useTags, useAllFormTags } from '@/hooks/useTags';
import { useFolders } from '@/hooks/useFolders';
import { supabase } from '@/integrations/supabase/client';
import { useState, useCallback, useEffect } from 'react';
import {
  Plus, FileText, MoreHorizontal, Trash2, BarChart3, CheckCircle,
  Tag, X, Check, FolderInput, Folder, FolderOpen, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import FolderTree from '@/components/FolderTree';
import { FormData } from '@/types/form';

const STATUS_MAP = {
  draft: { label: 'Rascunho', variant: 'secondary' as const },
  published: { label: 'Publicado', variant: 'default' as const },
  archived: { label: 'Arquivado', variant: 'outline' as const },
};

function FormTagsPicker({ tags, formTagIds, onToggle }: {
  tags: { id: string; name: string; color: string }[];
  formTagIds: string[];
  onToggle: (tagId: string, isActive: boolean) => void;
}) {
  if (tags.length === 0) return <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Nenhuma tag criada</DropdownMenuLabel>;
  return (
    <>
      {tags.map(tag => {
        const active = formTagIds.includes(tag.id);
        return (
          <DropdownMenuItem key={tag.id} onClick={e => { e.stopPropagation(); onToggle(tag.id, active); }} className="flex items-center gap-2 cursor-pointer">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
            <span className="flex-1 text-xs">{tag.name}</span>
            {active && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

function MoveToFolderMenu({ folders, currentFolderId, onMove }: {
  folders: ReturnType<typeof useFolders>['folders'];
  currentFolderId: string | null | undefined;
  onMove: (folderId: string | null) => void;
}) {
  const tree = buildSimpleTree(folders);
  const renderItems = (nodes: typeof tree, depth = 0) =>
    nodes.map(n => (
      <div key={n.id}>
        <DropdownMenuItem
          onClick={e => { e.stopPropagation(); onMove(n.id); }}
          className={`flex items-center gap-2 text-xs ${currentFolderId === n.id ? 'text-primary' : ''}`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <Folder className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{n.name}</span>
          {currentFolderId === n.id && <Check className="h-3 w-3 ml-auto flex-shrink-0" />}
        </DropdownMenuItem>
        {n.children && renderItems(n.children, depth + 1)}
      </div>
    ));

  return (
    <>
      <DropdownMenuItem onClick={e => { e.stopPropagation(); onMove(null); }} className="flex items-center gap-2 text-xs">
        <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
        <span>Raiz (sem pasta)</span>
        {!currentFolderId && <Check className="h-3 w-3 ml-auto flex-shrink-0" />}
      </DropdownMenuItem>
      {folders.length > 0 && <DropdownMenuSeparator />}
      {renderItems(tree)}
    </>
  );
}

type SimpleNode = { id: string; name: string; parent_folder_id: string | null; children: SimpleNode[] };
function buildSimpleTree(folders: { id: string; name: string; parent_folder_id: string | null }[]): SimpleNode[] {
  const map: Record<string, SimpleNode> = {};
  folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
  const roots: SimpleNode[] = [];
  folders.forEach(f => {
    if (f.parent_folder_id && map[f.parent_folder_id]) map[f.parent_folder_id].children.push(map[f.id]);
    else roots.push(map[f.id]);
  });
  return roots;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { forms, createForm, deleteForm, moveFormToFolder } = useFormStore();
  const { tags } = useTags();
  const foldersState = useFolders();
  const { folders } = foldersState;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [localTagsMap, setLocalTagsMap] = useState<Record<string, string[]>>({});
  const [draggingFormId, setDraggingFormId] = useState<string | null>(null);

  const formIds = forms.map(f => f.id);
  const formTagsMap = useAllFormTags(formIds);

  const getFormTagIds = useCallback((formId: string) => localTagsMap[formId] ?? formTagsMap[formId] ?? [], [localTagsMap, formTagsMap]);

  const toggleTag = useCallback(async (formId: string, tagId: string, isActive: boolean) => {
    const current = getFormTagIds(formId);
    setLocalTagsMap(prev => ({ ...prev, [formId]: isActive ? current.filter(id => id !== tagId) : [...current, tagId] }));
    if (isActive) await supabase.from('form_tags').delete().eq('form_id', formId).eq('tag_id', tagId);
    else await supabase.from('form_tags').insert({ form_id: formId, tag_id: tagId });
  }, [getFormTagIds]);

  // Listen for folder-drop events from FolderTree
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

  const totalResponses = forms.reduce((sum, f) => sum + f.responseCount, 0);
  const publishedCount = forms.filter(f => f.status === 'published').length;

  // Filter forms by folder
  const formsInFolder = selectedFolderId === null
    ? forms  // show all
    : forms.filter(f => f.folderId === selectedFolderId);

  // Then filter by tag
  const filteredForms = filterTagId
    ? formsInFolder.filter(f => getFormTagIds(f.id).includes(filterTagId))
    : formsInFolder;

  const selectedFolderName = selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ── Folder sidebar ── */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-muted/20 flex flex-col">
        <FolderTree
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          useFoldersState={foldersState}
        />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
                {selectedFolderId ? (
                  <>
                    <Folder className="h-5 w-5 text-muted-foreground" />
                    {selectedFolderName}
                  </>
                ) : (
                  <>Bom dia! 👋</>
                )}
              </h1>
              {!selectedFolderId && (
                <p className="text-sm text-muted-foreground mt-0.5">Aqui está o resumo dos seus formulários.</p>
              )}
            </div>
            <Button onClick={handleCreate} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Novo formulário
            </Button>
          </div>

          {/* Stats — only on root */}
          {!selectedFolderId && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><FileText className="h-3.5 w-3.5" />Total de formulários</div>
                <p className="text-2xl font-bold text-foreground">{forms.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><CheckCircle className="h-3.5 w-3.5" />Publicados</div>
                <p className="text-2xl font-bold text-foreground">{publishedCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><BarChart3 className="h-3.5 w-3.5" />Total de respostas</div>
                <p className="text-2xl font-bold text-foreground">{totalResponses}</p>
              </div>
            </div>
          )}

          {/* Tag filter */}
          {tags.length > 0 && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Tags:</span>
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

          {/* Forms section header */}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            {filterTagId ? `Com a tag "${tags.find(t => t.id === filterTagId)?.name}"` : 'Formulários'}
            <span className="ml-2 text-[10px] font-normal normal-case">{filteredForms.length}</span>
          </h2>

          {filteredForms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border bg-muted/20">
              <div className="rounded-full bg-muted p-4 mb-4">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredForms.map(form => {
                const status = STATUS_MAP[form.status];
                const tagIds = getFormTagIds(form.id);
                const formTags = tags.filter(t => tagIds.includes(t.id));
                const folderName = form.folderId ? folders.find(f => f.id === form.folderId)?.name : null;

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
                    className={`group cursor-pointer rounded-xl border border-border bg-card p-5 transition-all hover:shadow-sm ${draggingFormId === form.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                          {/* Move to folder */}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="text-xs">
                              <FolderInput className="h-3.5 w-3.5 mr-2" />
                              Mover para pasta
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                              <MoveToFolderMenu
                                folders={folders}
                                currentFolderId={form.folderId}
                                onMove={folderId => moveFormToFolder(form.id, folderId)}
                              />
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          {/* Tags */}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="text-xs">
                              <Tag className="h-3.5 w-3.5 mr-2" />
                              Tags
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <FormTagsPicker tags={tags} formTagIds={tagIds} onToggle={(tagId, isActive) => toggleTag(form.id, tagId, isActive)} />
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteForm(form.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <h3 className="font-medium text-foreground truncate mb-1">{form.title}</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      {form.questions.length} pergunta{form.questions.length !== 1 ? 's' : ''} · {form.responseCount} resposta{form.responseCount !== 1 ? 's' : ''}
                    </p>

                    {/* Folder badge */}
                    {folderName && !selectedFolderId && (
                      <div className="flex items-center gap-1 mb-2">
                        <Folder className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground truncate">{folderName}</span>
                      </div>
                    )}

                    {/* Tag pills */}
                    {formTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {formTags.map(tag => (
                          <span
                            key={tag.id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                          >
                            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
