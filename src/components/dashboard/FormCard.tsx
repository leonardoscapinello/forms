import { MoreHorizontal, Trash2, Tag, FolderInput, Folder, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { FormTagsPicker, MoveToFolderMenu } from './FormMenus';

const STATUS_MAP = {
  draft: { label: 'Rascunho', variant: 'secondary' as const },
  published: { label: 'Publicado', variant: 'default' as const },
  archived: { label: 'Arquivado', variant: 'outline' as const },
};

interface FormCardProps {
  form: { id: string; title: string; status: string; questions: any[]; responseCount: number; folderId?: string | null };
  tags: { id: string; name: string; color: string }[];
  tagIds: string[];
  folders: { id: string; name: string; parent_folder_id: string | null }[];
  selectedFolderId: string | null;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  onDelete: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onToggleTag: (tagId: string, isActive: boolean) => void;
}

export function FormCard({ form, tags, tagIds, folders, selectedFolderId, isDragging, onDragStart, onDragEnd, onClick, onDelete, onMoveToFolder, onToggleTag }: FormCardProps) {
  const status = STATUS_MAP[form.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.draft;
  const formTags = tags.filter(t => tagIds.includes(t.id));
  const folderName = form.folderId ? folders.find(f => f.id === form.folderId)?.name : null;

  return (
    <div
      draggable
      onDragStart={e => {
        onDragStart();
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'form', id: form.id }));
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group cursor-pointer rounded-2xl border border-border bg-background p-5 transition-all hover:shadow-md hover:border-primary/30 ${isDragging ? 'opacity-50' : ''}`}
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">
                <FolderInput className="h-3.5 w-3.5 mr-2" />
                Mover para pasta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                <MoveToFolderMenu
                  folders={folders}
                  currentFolderId={form.folderId}
                  onMove={onMoveToFolder}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">
                <Tag className="h-3.5 w-3.5 mr-2" />
                Tags
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <FormTagsPicker tags={tags} formTagIds={tagIds} onToggle={onToggleTag} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete()}>
              <Trash2 className="mr-2 h-4 w-4" />Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="font-semibold text-foreground truncate mb-1">{form.title}</h3>
      <p className="text-xs text-muted-foreground mb-3">
        {form.questions.length} pergunta{form.questions.length !== 1 ? 's' : ''} · {form.responseCount} resposta{form.responseCount !== 1 ? 's' : ''}
      </p>

      {folderName && !selectedFolderId && (
        <div className="flex items-center gap-1 mb-2">
          <Folder className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground truncate">{folderName}</span>
        </div>
      )}

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
}
