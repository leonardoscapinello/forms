import { Check, Folder, FolderOpen } from 'lucide-react';
import {
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export function FormTagsPicker({ tags, formTagIds, onToggle }: {
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

export function MoveToFolderMenu({ folders, currentFolderId, onMove }: {
  folders: { id: string; name: string; parent_folder_id: string | null }[];
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
