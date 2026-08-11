import { useState, useRef, useCallback } from 'react';
import { FolderNode, useFolders } from '@/hooks/useFolders';
import {
  Folder, FolderOpen, FolderPlus, ChevronRight, ChevronDown,
  MoreHorizontal, Pencil, Trash2, Plus, Check, X, FolderInput,
  Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Props {
  selectedFolderId: string | null; // null = root "All forms"
  onSelectFolder: (id: string | null) => void;
  useFoldersState: ReturnType<typeof useFolders>;
}

interface NodeProps {
  node: FolderNode;
  depth: number;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  useFoldersState: ReturnType<typeof useFolders>;
  onDrop: (folderId: string, targetId: string | null) => void;
}

function FolderTreeNode({ node, depth, selectedFolderId, onSelectFolder, useFoldersState, onDrop }: NodeProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [creatingChild, setCreatingChild] = useState(false);
  const [childName, setChildName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const { renameFolder, deleteFolder, createFolder } = useFoldersState;

  const confirmRename = async () => {
    if (editName.trim() && editName.trim() !== node.name) {
      await renameFolder(node.id, editName.trim());
    }
    setEditing(false);
  };

  const confirmChild = async () => {
    if (childName.trim()) await createFolder(childName.trim(), node.id);
    setCreatingChild(false);
    setChildName('');
    setOpen(true);
  };

  const isSelected = selectedFolderId === node.id;
  const hasChildren = node.children.length > 0 || creatingChild;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg cursor-pointer transition-colors select-none',
          isSelected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          dragOver && 'bg-accent text-accent-foreground ring-1 ring-accent-foreground/40',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '4px', paddingTop: '5px', paddingBottom: '5px' }}
        onClick={() => !editing && onSelectFolder(node.id)}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const data = e.dataTransfer.getData('text/plain');
          if (data) {
            try {
              const { type, id } = JSON.parse(data);
              if (type === 'form' || type === 'folder') onDrop(id, node.id);
            } catch {
              // Ignore malformed drag payloads from outside the app.
            }
          }
        }}
      >
        {/* Expand toggle */}
        <button
          className="flex-shrink-0 p-0.5 rounded hover:bg-muted hover:text-foreground"
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        >
          {hasChildren
            ? open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
            : <span className="w-3 h-3" />
          }
        </button>

        {open ? (
          <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <Folder className="h-3.5 w-3.5 flex-shrink-0" />
        )}

        {editing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
            <Input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="h-5 text-xs px-1 py-0 flex-1 min-w-0"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditing(false); }}
            />
            <button
              onClick={confirmRename}
              className="rounded bg-background p-0.5 text-foreground hover:bg-muted flex-shrink-0"
              aria-label="Salvar nome da pasta"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded bg-background p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground flex-shrink-0"
              aria-label="Cancelar edição da pasta"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="flex-1 min-w-0 text-xs font-medium truncate">{node.name}</span>
        )}

        {!editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <button className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); setCreatingChild(true); setOpen(true); }}>
                <FolderPlus className="h-3.5 w-3.5 mr-2" />Nova subpasta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditName(node.name); setEditing(true); }}>
                <Pencil className="h-3.5 w-3.5 mr-2" />Renomear
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={async e => {
                  e.stopPropagation();
                  const deleted = await deleteFolder(node.id);
                  if (deleted && selectedFolderId === node.id) onSelectFolder(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {open && (
        <div>
          {node.children.map(child => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              useFoldersState={useFoldersState}
              onDrop={onDrop}
            />
          ))}
          {creatingChild && (
            <div
              className="flex items-center gap-1 px-2 py-1"
              style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
            >
              <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <Input
                value={childName}
                onChange={e => setChildName(e.target.value)}
                placeholder="Nome da subpasta..."
                className="h-5 text-xs px-1 py-0 flex-1"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') confirmChild(); if (e.key === 'Escape') { setCreatingChild(false); setChildName(''); } }}
              />
              <button onClick={confirmChild} className="text-primary hover:text-primary/80 flex-shrink-0"><Check className="h-3 w-3" /></button>
              <button onClick={() => { setCreatingChild(false); setChildName(''); }} className="text-muted-foreground flex-shrink-0"><X className="h-3 w-3" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FolderTree({ selectedFolderId, onSelectFolder, useFoldersState }: Props) {
  const { tree, createFolder } = useFoldersState;
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [rootName, setRootName] = useState('');

  const confirmRoot = async () => {
    if (rootName.trim()) await createFolder(rootName.trim(), null);
    setCreatingRoot(false);
    setRootName('');
  };

  const handleDrop = useCallback(async (itemId: string, targetFolderId: string | null) => {
    // This will be handled by the parent (Dashboard) via drag state
    // We emit a custom event for Dashboard to handle
    window.dispatchEvent(new CustomEvent('folder-drop', {
      detail: { itemId, targetFolderId }
    }));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pastas</span>
        <button
          onClick={() => setCreatingRoot(true)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Nova pasta"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
        {/* All forms */}
        <div
          className={cn(
            'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-xs font-medium',
            selectedFolderId === null
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          onClick={() => onSelectFolder(null)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const data = e.dataTransfer.getData('text/plain');
            if (data) {
              try {
                const { type, id } = JSON.parse(data);
                if (type === 'form') handleDrop(id, null);
              } catch {
                // Ignore malformed drag payloads from outside the app.
              }
            }
          }}
        >
          <Home className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Todos os formulários</span>
        </div>

        {/* Folder tree */}
        {tree.map(node => (
          <FolderTreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            useFoldersState={useFoldersState}
            onDrop={handleDrop}
          />
        ))}

        {/* Creating root folder */}
        {creatingRoot && (
          <div className="flex items-center gap-1 px-2 py-1">
            <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              value={rootName}
              onChange={e => setRootName(e.target.value)}
              placeholder="Nome da pasta..."
              className="h-6 text-xs px-1.5 py-0 flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmRoot(); if (e.key === 'Escape') { setCreatingRoot(false); setRootName(''); } }}
            />
            <button onClick={confirmRoot} className="text-primary hover:text-primary/80 flex-shrink-0"><Check className="h-3 w-3" /></button>
            <button onClick={() => { setCreatingRoot(false); setRootName(''); }} className="text-muted-foreground flex-shrink-0"><X className="h-3 w-3" /></button>
          </div>
        )}

        {tree.length === 0 && !creatingRoot && (
          <div className="text-center py-6 px-3">
            <Folder className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">Nenhuma pasta ainda</p>
            <button
              onClick={() => setCreatingRoot(true)}
              className="text-[11px] text-primary hover:text-primary/80 hover:underline mt-1"
            >
              + Criar pasta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
