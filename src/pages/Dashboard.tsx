import { useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useTags, useAllFormTags } from '@/hooks/useTags';
import { useFolders } from '@/hooks/useFolders';
import { supabase } from '@/integrations/supabase/client';
import { useState, useCallback, useEffect } from 'react';
import {
  Plus, FileText, MoreHorizontal, Trash2, BarChart3, CheckCircle,
  Tag, X, Check, FolderInput, Folder, FolderOpen, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import FolderTree from '@/components/FolderTree';
import { FormTagsPicker, MoveToFolderMenu } from '@/components/dashboard/FormMenus';
import { FormCard } from '@/components/dashboard/FormCard';

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

  const formsInFolder = selectedFolderId === null
    ? forms
    : forms.filter(f => f.folderId === selectedFolderId);

  const filteredForms = filterTagId
    ? formsInFolder.filter(f => getFormTagIds(f.id).includes(filterTagId))
    : formsInFolder;

  const selectedFolderName = selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

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
        <div className="p-6 sm:p-8 lg:p-10 max-w-[1400px]">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              {selectedFolderId ? (
                <>
                  <Folder className="h-5 w-5 text-muted-foreground" />
                  {selectedFolderName}
                </>
              ) : (
                <>{greeting}! 👋</>
              )}
            </h1>
            {!selectedFolderId && (
              <p className="text-sm text-muted-foreground mt-1">Aqui está o resumo dos seus formulários.</p>
            )}
          </div>

          {/* Stats row — matching twobrain card style */}
          {!selectedFolderId && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {[
                { icon: FileText, label: 'Total de formulários', value: forms.length },
                { icon: CheckCircle, label: 'Publicados', value: publishedCount },
                { icon: BarChart3, label: 'Total de respostas', value: totalResponses },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-5 flex items-start justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
                  </div>
                  <Icon className="h-4 w-4 text-muted-foreground mt-1" />
                </div>
              ))}
            </div>
          )}

          {/* Tag filter */}
          {tags.length > 0 && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
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

          {/* Recent form — hero card like twobrain */}
          {!selectedFolderId && filteredForms.length > 0 && (
            <div
              className="rounded-xl border border-border bg-card p-6 mb-6 flex items-center gap-4 cursor-pointer hover:shadow-sm transition-all"
              onClick={() => navigate(`/editor/${filteredForms[0].id}`)}
            >
              <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-foreground/60" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{filteredForms[0].title}</h3>
                <p className="text-sm text-muted-foreground">
                  {filteredForms[0].questions.length} perguntas · {filteredForms[0].responseCount} respostas
                </p>
              </div>
              <Button size="sm" className="flex-shrink-0">
                Editar formulário <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Forms section */}
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">
              {filterTagId ? `Com a tag "${tags.find(t => t.id === filterTagId)?.name}"` : 'Formulários'}
            </h2>
            <span className="text-[11px] text-muted-foreground bg-accent px-2 py-0.5 rounded-full font-medium">
              {filteredForms.length}
            </span>
            <div className="flex-1" />
            <Button onClick={handleCreate} size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Novo formulário
            </Button>
          </div>

          {filteredForms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border bg-card">
              <div className="rounded-full bg-accent p-4 mb-4">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredForms.map(form => (
                <FormCard
                  key={form.id}
                  form={form}
                  tags={tags}
                  tagIds={getFormTagIds(form.id)}
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  isDragging={draggingFormId === form.id}
                  onDragStart={() => setDraggingFormId(form.id)}
                  onDragEnd={() => setDraggingFormId(null)}
                  onClick={() => navigate(`/editor/${form.id}`)}
                  onDelete={() => deleteForm(form.id)}
                  onMoveToFolder={(folderId) => moveFormToFolder(form.id, folderId)}
                  onToggleTag={(tagId, isActive) => toggleTag(form.id, tagId, isActive)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
