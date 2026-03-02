import { useState, useRef } from 'react';
import { Upload, FolderOpen, Link, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGallery } from '@/hooks/useGallery';
import { useImageUpload } from '@/hooks/useImageUpload';
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
  /**
   * Compact / inline mode: shows a single-line Input + Upload + Gallery
   * instead of the full picker with preview, URL toggle, etc.
   */
  compact?: boolean;
  /** Path prefix for raw uploads (compact mode), default 'images' */
  pathPrefix?: string;
  /** Placeholder for the URL input */
  placeholder?: string;
  /** Hide the "Save to gallery" button */
  hideSaveToGallery?: boolean;
}

export default function ImageSourcePicker({
  value,
  onChange,
  accept = 'image/*',
  showPreview = true,
  previewMaxH = 'max-h-40',
  alt = '',
  compact = false,
  pathPrefix = 'images',
  placeholder = 'URL da imagem...',
  hideSaveToGallery = false,
}: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useGallery();

  // Compact mode uses lightweight raw upload; full mode uses gallery upload
  const { uploading: compactUploading, handleFileChange: compactFileChange } = useImageUpload({
    pathPrefix,
    onSuccess: onChange,
  });

  const [fullUploading, setFullUploading] = useState(false);
  const uploading = compact ? compactUploading : fullUploading;

  const handleFullFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFullUploading(true);
    try {
      const gf = await uploadFile(file);
      if (gf) {
        onChange(gf.url);
        toast.success('Arquivo enviado e salvo na galeria');
      }
    } finally {
      setFullUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveToGallery = async () => {
    if (!value) { toast.error('Nenhum arquivo para salvar'); return; }
    try {
      setFullUploading(true);
      const response = await fetch(value);
      const blob = await response.blob();
      const ext = value.split('.').pop()?.split('?')[0] || 'png';
      const file = new File([blob], `gallery-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
      const gf = await uploadFile(file);
      if (gf) toast.success('Salvo na galeria');
    } catch {
      toast.error('Erro ao salvar na galeria');
    } finally {
      setFullUploading(false);
    }
  };

  const galleryPicker = (
    <GalleryPicker
      open={galleryOpen}
      onClose={() => setGalleryOpen(false)}
      onSelect={(file) => onChange(file.url)}
      accept={accept}
    />
  );

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={accept}
      className="hidden"
      onChange={compact ? compactFileChange : handleFullFileUpload}
    />
  );

  // ── Compact / inline mode ──
  if (compact) {
    return (
      <div className="space-y-1.5">
        {showPreview && value && (
          <img src={value} alt={alt} className="w-full h-20 object-cover rounded-lg" />
        )}
        <div className="flex items-center gap-1.5">
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            className="h-8 text-xs flex-1"
            placeholder={placeholder}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0 rounded-lg"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0 rounded-lg"
            onClick={() => setGalleryOpen(true)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
        {hiddenInput}
        {galleryPicker}
      </div>
    );
  }

  // ── Full mode (original layout) ──
  return (
    <div className="space-y-2 min-w-0 w-full overflow-hidden">
      {/* Preview */}
      {showPreview && value && (
        <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
          <img src={value} alt={alt} className={`w-full ${previewMaxH} object-contain`} />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1 flex-1 min-w-[90px] rounded-lg" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-3 w-3" /> Upload
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1 flex-1 min-w-[90px] rounded-lg" onClick={() => setGalleryOpen(true)}>
          <FolderOpen className="h-3 w-3" /> Galeria
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1 flex-1 min-w-[90px] rounded-lg" onClick={() => setShowUrlInput(!showUrlInput)}>
          <Link className="h-3 w-3" /> URL
        </Button>
      </div>

      {/* Save to gallery */}
      {value && !hideSaveToGallery && (
        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 w-full" onClick={handleSaveToGallery} disabled={uploading}>
          <Save className="h-3 w-3" /> Salvar na galeria
        </Button>
      )}

      {hiddenInput}
      {galleryPicker}

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
