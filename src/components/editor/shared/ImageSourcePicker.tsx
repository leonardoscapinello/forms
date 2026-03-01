import { useState, useRef } from 'react';
import { Upload, FolderOpen, Link, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGallery } from '@/hooks/useGallery';
import GalleryPicker from '@/components/editor/GalleryPicker';
import { toast } from 'sonner';

interface Props {
  value: string;
  onChange: (url: string) => void;
  /** Gallery accept filter, e.g. 'image/*' */
  accept?: string;
  /** Show a preview of the current image */
  showPreview?: boolean;
  /** Preview max height class, default 'max-h-40' */
  previewMaxH?: string;
  /** Alt text shown on preview */
  alt?: string;
}

export default function ImageSourcePicker({
  value,
  onChange,
  accept = 'image/*',
  showPreview = true,
  previewMaxH = 'max-h-40',
  alt = '',
}: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useGallery();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const gf = await uploadFile(file);
      if (gf) {
        onChange(gf.url);
        toast.success('Arquivo enviado e salvo na galeria');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveToGallery = async () => {
    if (!value) { toast.error('Nenhum arquivo para salvar'); return; }
    try {
      setUploading(true);
      const response = await fetch(value);
      const blob = await response.blob();
      const ext = value.split('.').pop()?.split('?')[0] || 'png';
      const file = new File([blob], `gallery-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
      const gf = await uploadFile(file);
      if (gf) toast.success('Salvo na galeria');
    } catch {
      toast.error('Erro ao salvar na galeria');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Preview */}
      {showPreview && value && (
        <div className="rounded-md border border-border overflow-hidden bg-muted/30">
          <img src={value} alt={alt} className={`w-full ${previewMaxH} object-contain`} />
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-3 w-3" /> Upload
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={() => setGalleryOpen(true)}>
          <FolderOpen className="h-3 w-3" /> Galeria
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={() => setShowUrlInput(!showUrlInput)}>
          <Link className="h-3 w-3" /> URL
        </Button>
      </div>

      {/* Save to gallery */}
      {value && (
        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 w-full" onClick={handleSaveToGallery} disabled={uploading}>
          <Save className="h-3 w-3" /> Salvar na galeria
        </Button>
      )}

      <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileUpload} />

      <GalleryPicker
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSelect={(file) => onChange(file.url)}
        accept={accept}
      />

      {/* URL input (togglable) */}
      {showUrlInput && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">URL</label>
          <Input value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." className="h-8 text-xs mt-1" />
        </div>
      )}
    </div>
  );
}
