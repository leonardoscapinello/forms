import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
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

/** Animated cloud upload SVG icon */
function CloudUploadIcon({ active, uploading }: { active: boolean; uploading: boolean }) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible">
      {/* Cloud body */}
      <motion.path
        d="M16 40C10.477 40 6 35.523 6 30C6 25.166 9.443 21.153 14.014 20.21C14.005 20.14 14 20.07 14 20C14 13.373 19.373 8 26 8C31.088 8 35.432 11.163 37.16 15.596C38.368 14.588 39.91 14 41.6 14C45.794 14 49.2 17.406 49.2 21.6C49.2 21.87 49.186 22.136 49.16 22.4C53.486 23.37 56.8 27.23 56.8 31.8C56.8 37.102 52.502 41.4 47.2 41.4H16Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={active || uploading ? 'text-primary' : 'text-muted-foreground/40'}
        animate={{
          y: active ? -2 : 0,
          scale: active ? 1.03 : 1,
        }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />

      {/* Arrow shaft */}
      <motion.line
        x1="32" y1="52" x2="32" y2="32"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className={active || uploading ? 'text-primary' : 'text-muted-foreground/40'}
        animate={uploading ? {
          y2: [32, 28, 32],
          y1: [52, 48, 52],
        } : { y2: 32, y1: 52 }}
        transition={uploading ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      />
      {/* Arrow head */}
      <motion.polyline
        points="24,38 32,30 40,38"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={active || uploading ? 'text-primary' : 'text-muted-foreground/40'}
        animate={uploading ? {
          y: [-2, -6, -2],
        } : { y: 0 }}
        transition={uploading ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      />

      {/* Uploading particles */}
      {uploading && (
        <>
          {[0, 1, 2].map(i => (
            <motion.circle
              key={i}
              cx={28 + i * 4}
              cy={50}
              r="1.5"
              fill="currentColor"
              className="text-primary/60"
              animate={{
                y: [-5, -25],
                opacity: [1, 0],
                scale: [1, 0.3],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.3,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      )}
    </svg>
  );
}

/** Circular progress ring */
function ProgressRing({ progress }: { progress: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="flex-shrink-0">
      <circle cx="14" cy="14" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
      <motion.circle
        cx="14" cy="14" r={radius}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 14 14)"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.3 }}
      />
    </svg>
  );
}

export default function FileUploadPreview({ value, onChange, maxFileSize = 10, allowedFileTypes }: Props) {
  const files = value || [];
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const uploadFile = useCallback(async (file: globalThis.File) => {
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

    const ext = file.name.split('.').pop() || 'bin';
    const path = `uploads/${crypto.randomUUID()}.${ext}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

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

    return { name: file.name, size: file.size, type: file.type, url: data.url, path: data.path };
  }, [maxFileSize, allowedFileTypes]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    setError('');
    setUploading(true);
    setUploadProgress(0);

    const totalFiles = fileList.length;
    const results: UploadedFile[] = [];

    for (let i = 0; i < totalFiles; i++) {
      setUploadProgress(Math.round((i / totalFiles) * 100));
      const result = await uploadFile(fileList[i]);
      if (result) results.push(result);
    }

    setUploadProgress(100);

    if (results.length > 0) {
      onChange([...files, ...results]);
    }

    setTimeout(() => {
      setUploading(false);
      setUploadProgress(0);
    }, 400);
  }, [files, onChange, uploadFile]);

  const removeFile = useCallback(async (index: number) => {
    const file = files[index];
    await supabase.functions.invoke('minio-delete', { body: { path: file.path } });
    onChange(files.filter((_, i) => i !== index));
  }, [files, onChange]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <motion.div
        onDragEnter={handleDragEnter}
        onDragOver={e => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        animate={{
          scale: dragging ? 1.015 : 1,
          borderColor: dragging ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`relative border-2 border-dashed rounded-2xl px-6 py-12 text-center transition-colors cursor-pointer overflow-hidden ${
          dragging ? 'bg-primary/[0.03]' : 'hover:bg-muted/20'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={allowedFileTypes?.join(',') || undefined}
          onChange={e => e.target.files?.length && handleFiles(e.target.files)}
          className="hidden"
        />

        {/* Animated background circles on drag */}
        <AnimatePresence>
          {dragging && (
            <>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-primary/5"
                  style={{
                    width: 120 + i * 80,
                    height: 120 + i * 80,
                    left: '50%',
                    top: '50%',
                    marginLeft: -(60 + i * 40),
                    marginTop: -(60 + i * 40),
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        <div className="relative z-10 flex flex-col items-center gap-4">
          <CloudUploadIcon active={dragging} uploading={uploading} />

          <div>
            <motion.p
              className="text-lg font-medium"
              animate={{ color: dragging || uploading ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
              transition={{ duration: 0.2 }}
            >
              {uploading ? 'Enviando...' : dragging ? 'Solte para enviar' : 'Arraste arquivos ou clique aqui'}
            </motion.p>
            <p className="text-sm text-muted-foreground/50 mt-1.5">
              Até {maxFileSize}MB por arquivo
              {allowedFileTypes?.length ? ` · ${allowedFileTypes.join(', ')}` : ''}
            </p>
          </div>

          {/* Upload progress bar */}
          <AnimatePresence>
            {uploading && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 200 }}
                exit={{ opacity: 0 }}
                className="h-1 rounded-full bg-border overflow-hidden"
              >
                <motion.div
                  className="h-full bg-primary rounded-full"
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
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
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploaded files */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {files.map((file, i) => (
            <motion.div
              key={file.path}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.9 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 group hover:border-primary/20 transition-colors"
            >
              {/* Thumbnail or emoji */}
              {file.type.startsWith('image/') ? (
                <div className="h-11 w-11 rounded-lg overflow-hidden bg-muted flex-shrink-0 ring-1 ring-border">
                  <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-11 w-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-lg">
                  {getFileEmoji(file.type)}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">{formatSize(file.size)}</p>
              </div>

              {/* Check + remove */}
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 300 }}>
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
              </motion.div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); removeFile(i); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
