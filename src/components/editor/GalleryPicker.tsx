import { useState, useMemo, useRef } from 'react';
import { useGallery, GalleryFile } from '@/hooks/useGallery';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Image, FileText, Film, Music, File as FileIcon, FolderOpen, Check, FolderPlus, Upload, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (file: GalleryFile) => void;
  accept?: string; // e.g. 'image/*,video/*'
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Film;
  if (type.startsWith('audio/')) return Music;
  if (type.includes('pdf') || type.includes('document')) return FileText;
  return FileIcon;
}

function matchesAccept(fileType: string, accept?: string) {
  if (!accept) return true;
  return accept.split(',').some(a => {
    const t = a.trim();
    if (t.endsWith('/*')) return fileType.startsWith(t.replace('/*', '/'));
    return fileType === t;
  });
}

export default function GalleryPicker({ open, onClose, onSelect, accept }: Props) {
  const { folders, files, loading, createFolder, uploadFile } = useGallery();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFolders = useMemo(() =>
    folders.filter(f => f.parent_folder_id === currentFolderId),
    [folders, currentFolderId]
  );

  const currentFiles = useMemo(() => {
    let result = files.filter(f => f.folder_id === currentFolderId && matchesAccept(f.file_type, accept));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }
    return result;
  }, [files, currentFolderId, search, accept]);

  const breadcrumb = useMemo(() => {
    const trail: typeof folders = [];
    let id = currentFolderId;
    while (id) {
      const f = folders.find(fo => fo.id === id);
      if (f) { trail.unshift(f); id = f.parent_folder_id; } else break;
    }
    return trail;
  }, [folders, currentFolderId]);

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    await Promise.all(Array.from(fileList).map(file => uploadFile(file, currentFolderId)));
    setUploading(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), currentFolderId);
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const handleConfirm = () => {
    const file = files.find(f => f.id === selected);
    if (file) {
      onSelect(file);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Selecionar da Galeria</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreatingFolder(true)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1" /> Nova pasta
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Enviar
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

        {creatingFolder && (
          <div className="flex items-center gap-2">
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Nome da pasta..."
              className="h-8 text-xs"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
              }}
            />
            <button onClick={handleCreateFolder} className="text-primary">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm px-1">
          <button onClick={() => setCurrentFolderId(null)} className={cn('hover:text-primary', !currentFolderId && 'font-medium text-foreground')}>
            Galeria
          </button>
          {breadcrumb.map(f => (
            <span key={f.id} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <button onClick={() => setCurrentFolderId(f.id)} className={cn('hover:text-primary', currentFolderId === f.id && 'font-medium text-foreground')}>
                {f.name}
              </button>
            </span>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="h-8 text-xs pl-8" />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Folders */}
          {currentFolders.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {currentFolders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => setCurrentFolderId(folder.id)}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:border-primary/30 transition-colors text-left"
                >
                  <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-xs font-medium truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Files */}
          <div className="grid grid-cols-4 gap-2">
            {currentFiles.map(file => {
              const Icon = getFileIcon(file.file_type);
              const isImage = file.file_type.startsWith('image/');
              const isSelected = selected === file.id;
              return (
                <button
                  key={file.id}
                  onClick={() => setSelected(file.id)}
                  className={cn(
                    'rounded-lg border overflow-hidden transition-all text-left relative',
                    isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/30'
                  )}
                >
                  <div className="aspect-square bg-muted/50 flex items-center justify-center overflow-hidden">
                    {isImage ? (
                      <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Icon className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="text-[10px] font-medium truncate">{file.name}</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {currentFolders.length === 0 && currentFiles.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {loading ? 'Carregando...' : 'Nenhum arquivo encontrado'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!selected}>Selecionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
