import { useState, useRef, useMemo } from 'react';
import { useGallery, GalleryFile, GalleryFolder } from '@/hooks/useGallery';
import {
  FolderPlus, Upload, Trash2, ArrowLeft, Image, FileText, Film, Music,
  File as FileIcon, MoreHorizontal, Pencil, Check, X, Loader2, Search, Grid3X3, List, Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Film;
  if (type.startsWith('audio/')) return Music;
  if (type.includes('pdf') || type.includes('document') || type.includes('text')) return FileText;
  return FileIcon;
}

export default function Gallery() {
  const gallery = useGallery();
  const { folders, files, loading, createFolder, renameFolder, deleteFolder, uploadFile, deleteFile } = gallery;
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFolders = useMemo(() =>
    folders.filter(f => f.parent_folder_id === currentFolderId),
    [folders, currentFolderId]
  );

  const currentFiles = useMemo(() => {
    let result = files.filter(f => f.folder_id === currentFolderId);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }
    return result;
  }, [files, currentFolderId, search]);

  const breadcrumb = useMemo(() => {
    const trail: GalleryFolder[] = [];
    let id = currentFolderId;
    while (id) {
      const f = folders.find(fo => fo.id === id);
      if (f) { trail.unshift(f); id = f.parent_folder_id; } else break;
    }
    return trail;
  }, [folders, currentFolderId]);

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    const promises = Array.from(fileList).map(f => uploadFile(f, currentFolderId));
    await Promise.all(promises);
    setUploading(false);
    toast.success(`${fileList.length} arquivo(s) enviado(s)`);
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim(), currentFolderId);
      toast.success('Pasta criada');
    }
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'folder') await deleteFolder(deleteTarget.id);
    else await deleteFile(deleteTarget.id);
    setDeleteTarget(null);
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copiada!');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Galeria de Arquivos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie arquivos para usar no WhatsApp, E-mail e outros
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreatingFolder(true)}>
              <FolderPlus className="h-4 w-4 mr-1.5" /> Nova Pasta
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Enviar Arquivos
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => e.target.files && handleUpload(e.target.files)}
            />
          </div>
        </div>

        {/* Breadcrumb + search + view toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 text-sm min-w-0">
            <button
              onClick={() => setCurrentFolderId(null)}
              className={cn('hover:text-primary transition-colors', currentFolderId === null ? 'text-foreground font-medium' : 'text-muted-foreground')}
            >
              Galeria
            </button>
            {breadcrumb.map(f => (
              <span key={f.id} className="flex items-center gap-1">
                <span className="text-muted-foreground">/</span>
                <button
                  onClick={() => setCurrentFolderId(f.id)}
                  className={cn('hover:text-primary transition-colors', currentFolderId === f.id ? 'text-foreground font-medium' : 'text-muted-foreground')}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar arquivos..."
                className="h-8 text-xs pl-8 w-48"
              />
            </div>
            <div className="flex border border-border rounded-md">
              <button
                onClick={() => setViewMode('grid')}
                className={cn('p-1.5 rounded-l-md transition-colors', viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn('p-1.5 rounded-r-md transition-colors', viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6"
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={e => {
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
        }}
      >
        {/* Creating folder inline */}
        {creatingFolder && (
          <div className="flex items-center gap-2 mb-4 max-w-xs">
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Nome da pasta..."
              className="h-8 text-sm"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
            />
            <button onClick={handleCreateFolder} className="text-primary"><Check className="h-4 w-4" /></button>
            <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Folders */}
        {currentFolders.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pastas</h3>
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3' : 'space-y-1'}>
              {currentFolders.map(folder => (
                <div
                  key={folder.id}
                  className={cn(
                    'group cursor-pointer rounded-xl border border-border transition-all hover:border-primary/30 hover:shadow-sm',
                    viewMode === 'grid' ? 'p-4 text-center' : 'p-3 flex items-center gap-3'
                  )}
                  onClick={() => {
                    if (editingFolderId !== folder.id) setCurrentFolderId(folder.id);
                  }}
                >
                  <div className={cn(viewMode === 'grid' ? 'flex flex-col items-center gap-2' : 'flex items-center gap-3 flex-1 min-w-0')}>
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FolderPlus className="h-5 w-5 text-primary" />
                    </div>
                    {editingFolderId === folder.id ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Input
                          value={editFolderName}
                          onChange={e => setEditFolderName(e.target.value)}
                          className="h-6 text-xs px-1"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') { renameFolder(folder.id, editFolderName); setEditingFolderId(null); }
                            if (e.key === 'Escape') setEditingFolderId(null);
                          }}
                        />
                        <button onClick={() => { renameFolder(folder.id, editFolderName); setEditingFolderId(null); }} className="text-primary"><Check className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <span className="text-sm font-medium truncate">{folder.name}</span>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <button className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted flex-shrink-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-xs">
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditFolderName(folder.name); setEditingFolderId(folder.id); }}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name }); }}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        {currentFiles.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Arquivos</h3>
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3' : 'space-y-1'}>
              {currentFiles.map(file => {
                const Icon = getFileIcon(file.file_type);
                const isImage = file.file_type.startsWith('image/');
                return (
                  <div
                    key={file.id}
                    className={cn(
                      'group rounded-xl border border-border transition-all hover:border-primary/30 hover:shadow-sm overflow-hidden',
                      viewMode === 'list' && 'flex items-center gap-3 p-3'
                    )}
                  >
                    {viewMode === 'grid' ? (
                      <>
                        <div className="aspect-square bg-muted/50 flex items-center justify-center overflow-hidden">
                          {isImage ? (
                            <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Icon className="h-8 w-8 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="p-2.5 flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                            <p className="text-[10px] text-muted-foreground">{formatSize(file.file_size)}</p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted flex-shrink-0">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onClick={() => copyUrl(file.url)}>
                                <Copy className="h-3.5 w-3.5 mr-2" /> Copiar URL
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })}>
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {isImage ? (
                            <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Icon className="h-5 w-5 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatSize(file.file_size)} · {file.file_type.split('/')[1]?.toUpperCase()}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => copyUrl(file.url)} className="p-1.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })} className="p-1.5 rounded hover:bg-muted text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {currentFolders.length === 0 && currentFiles.length === 0 && !creatingFolder && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Image className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">
              {currentFolderId ? 'Pasta vazia' : 'Nenhum arquivo ainda'}
            </h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs">
              Arraste arquivos aqui ou clique em "Enviar Arquivos" para começar
            </p>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1.5" /> Enviar Arquivos
            </Button>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.type === 'folder' ? 'pasta' : 'arquivo'}</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
