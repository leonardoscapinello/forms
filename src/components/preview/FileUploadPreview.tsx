import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  url: string;
  path: string;
}

interface Props {
  value: UploadedFile[] | undefined;
  onChange: (files: UploadedFile[]) => void;
  maxFileSize?: number;
  allowedFileTypes?: string[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileEmoji(type: string) {
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📄';
  if (type.includes('spreadsheet') || type.includes('excel')) return '📊';
  if (type.includes('zip') || type.includes('rar')) return '📦';
  return '📎';
}

/** Animated cloud upload SVG */
function CloudUploadIcon({ active, uploading }: { active: boolean; uploading: boolean }) {
  const color = active || uploading ? 'text-primary' : 'text-muted-foreground/30';
  return (
    <motion.svg
      width="56" height="56" viewBox="0 0 64 64" fill="none"
      className="overflow-visible"
      animate={{ y: active ? -3 : 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <motion.path
        d="M16 40C10.477 40 6 35.523 6 30C6 25.166 9.443 21.153 14.014 20.21C14.005 20.14 14 20.07 14 20C14 13.373 19.373 8 26 8C31.088 8 35.432 11.163 37.16 15.596C38.368 14.588 39.91 14 41.6 14C45.794 14 49.2 17.406 49.2 21.6C49.2 21.87 49.186 22.136 49.16 22.4C53.486 23.37 56.8 27.23 56.8 31.8C56.8 37.102 52.502 41.4 47.2 41.4H16Z"
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={color}
        animate={{ scale: active ? 1.04 : 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.g
        animate={uploading ? { y: [0, -4, 0] } : { y: 0 }}
        transition={uploading ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      >
        <line x1="32" y1="50" x2="32" y2="32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={color} />
        <polyline points="24,38 32,30 40,38" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={color} />
      </motion.g>
      {uploading && [0, 1, 2].map(i => (
        <motion.circle
          key={i} cx={28 + i * 4} cy={48} r="1.5" fill="currentColor" className="text-primary/50"
          animate={{ y: [-2, -20], opacity: [0.8, 0], scale: [1, 0.2] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25, ease: 'easeOut' }}
        />
      ))}
    </motion.svg>
  );
}

export default function FileUploadPreview({ value, onChange, maxFileSize = 10, allowedFileTypes }: Props) {
  const files = value || [];
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingPaths, setRemovingPaths] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const compressImage = useCallback(async (file: globalThis.File): Promise<globalThis.File> => {
    // Only compress raster images (skip SVGs, PDFs, etc.)
    const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
    if (!COMPRESSIBLE.includes(file.type)) return file;

    try {
      const imageCompression = (await import('browser-image-compression')).default;
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 2048,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.82,
      });
      return compressed;
    } catch {
      // Fallback: upload original if compression fails
      return file;
    }
  }, []);

  const uploadFile = useCallback(async (file: globalThis.File): Promise<UploadedFile | null> => {
    if (file.size > maxFileSize * 1024 * 1024) {
      setError(`Arquivo muito grande. Máximo: ${maxFileSize}MB`);
      return null;
    }

    if (allowedFileTypes?.length) {
      const accepted = allowedFileTypes.some(t => {
        if (t.endsWith('/*')) return file.type.startsWith(t.replace('/*', '/'));
        return file.type === t;
      });
      if (!accepted) {
        setError('Tipo de arquivo não permitido.');
        return null;
      }
    }

    // Compress images/GIFs to WebP before upload
    const processedFile = await compressImage(file);
    const isConverted = processedFile.type === 'image/webp' && file.type !== 'image/webp';

    const originalExt = file.name.split('.').pop() || 'bin';
    const ext = isConverted ? 'webp' : originalExt;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const path = `uploads/${crypto.randomUUID()}-${baseName}.${ext}`;

    const formData = new FormData();
    formData.append('file', processedFile);
    formData.append('path', path);

    try {
      const res = await supabase.functions.invoke('minio-upload', { body: formData });
      if (res.error) {
        setError(`Erro ao enviar: ${res.error.message}`);
        return null;
      }
      const data = res.data as any;
      if (!data?.success) {
        setError(data?.message || 'Erro ao enviar arquivo.');
        return null;
      }
      return {
        name: isConverted ? `${baseName}.webp` : file.name,
        size: processedFile.size,
        type: processedFile.type,
        url: data.url,
        path: data.path,
      };
    } catch (err: any) {
      setError(`Erro de conexão: ${err.message}`);
      return null;
    }
  }, [maxFileSize, allowedFileTypes, compressImage]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    setError('');
    setUploading(true);
    setUploadProgress(0);

    const totalFiles = fileList.length;
    const results: UploadedFile[] = [];

    for (let i = 0; i < totalFiles; i++) {
      setUploadProgress(Math.round(((i + 0.5) / totalFiles) * 100));
      const result = await uploadFile(fileList[i]);
      if (result) results.push(result);
      setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
    }

    if (results.length > 0) {
      // Use functional update to avoid stale closure
      onChange([...(value || []), ...results]);
    }

    setTimeout(() => {
      setUploading(false);
      setUploadProgress(0);
    }, 300);
  }, [value, onChange, uploadFile]);

  const removeFile = useCallback((filePath: string) => {
    // Optimistic removal: update UI immediately, delete in background
    setRemovingPaths(prev => new Set(prev).add(filePath));

    // Remove from parent state immediately
    const updated = (value || []).filter(f => f.path !== filePath);
    onChange(updated);

    // Fire and forget the server-side delete
    supabase.functions.invoke('minio-delete', { body: { path: filePath } })
      .finally(() => {
        setRemovingPaths(prev => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      });
  }, [value, onChange]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFiles(e.target.files);
      // Reset input so the same file can be re-uploaded
      e.target.value = '';
    }
  }, [handleFiles]);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <motion.div
        onDragEnter={handleDragEnter}
        onDragOver={e => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        animate={{
          scale: dragging ? 1.01 : 1,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`relative border-2 border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer overflow-hidden transition-colors duration-200 ${
          dragging
            ? 'border-primary bg-primary/[0.03]'
            : 'border-border hover:border-muted-foreground/30 hover:bg-muted/10'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={allowedFileTypes?.join(',') || undefined}
          onChange={handleInputChange}
          className="hidden"
        />

        {/* Background rings on drag */}
        <AnimatePresence>
          {dragging && [0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-primary/[0.04] pointer-events-none"
              style={{
                width: 100 + i * 70, height: 100 + i * 70,
                left: '50%', top: '50%',
                marginLeft: -(50 + i * 35), marginTop: -(50 + i * 35),
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
            />
          ))}
        </AnimatePresence>

        <div className="relative z-10 flex flex-col items-center gap-3">
          <CloudUploadIcon active={dragging} uploading={uploading} />

          <div>
            <motion.p
              className="text-base font-medium"
              animate={{ color: dragging || uploading ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
              transition={{ duration: 0.15 }}
            >
              {uploading ? 'Enviando...' : dragging ? 'Solte para enviar' : 'Arraste arquivos ou clique aqui'}
            </motion.p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Até {maxFileSize}MB por arquivo
            </p>
          </div>

          {/* Progress bar */}
          <AnimatePresence>
            {uploading && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={{ opacity: 0, scaleX: 0 }}
                className="w-48 h-1 rounded-full bg-border overflow-hidden origin-center"
              >
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-sm text-destructive overflow-hidden"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-destructive/50 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploaded files */}
      <AnimatePresence mode="popLayout">
        {files.map((file) => {
          const isImage = file.type.startsWith('image/');
          const isRemoving = removingPaths.has(file.path);

          return (
            <motion.div
              key={file.path}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: isRemoving ? 0.4 : 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -30, scale: 0.9, height: 0, marginBottom: 0, padding: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 group hover:border-primary/15 transition-colors"
            >
              {/* Thumbnail */}
              {isImage ? (
                <motion.div
                  className="h-10 w-10 rounded-lg overflow-hidden bg-muted flex-shrink-0 ring-1 ring-border/50"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
                </motion.div>
              ) : (
                <motion.div
                  className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-base"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 20 }}
                >
                  {getFileEmoji(file.type)}
                </motion.div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-[11px] text-muted-foreground/60">{formatSize(file.size)}</p>
              </div>

              <motion.div
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 350, damping: 15 }}
              >
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
              </motion.div>

              <Button
                variant="ghost"
                size="icon"
                disabled={isRemoving}
                className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); removeFile(file.path); }}
              >
                {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </Button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
