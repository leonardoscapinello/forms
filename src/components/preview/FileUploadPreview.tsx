import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X, FileText, Image, Film, Music, File, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  maxFileSize?: number; // MB
  allowedFileTypes?: string[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Film;
  if (type.startsWith('audio/')) return Music;
  if (type.includes('pdf')) return FileText;
  return File;
}

export default function FileUploadPreview({ value, onChange, maxFileSize = 10, allowedFileTypes }: Props) {
  const files = value || [];
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: globalThis.File) => {
    // Validate size
    if (file.size > maxFileSize * 1024 * 1024) {
      setError(`Arquivo muito grande. Máximo: ${maxFileSize}MB`);
      return null;
    }

    // Validate type
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

    // Upload via MinIO edge function
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const res = await supabase.functions.invoke('minio-upload', {
      body: formData,
    });

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
      name: file.name,
      size: file.size,
      type: file.type,
      url: data.url,
      path: data.path,
    };
  }, [maxFileSize, allowedFileTypes]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    setError('');
    setUploading(true);

    const results: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const result = await uploadFile(file);
      if (result) results.push(result);
    }

    if (results.length > 0) {
      onChange([...files, ...results]);
    }
    setUploading(false);
  }, [files, onChange, uploadFile]);

  const removeFile = useCallback(async (index: number) => {
    const file = files[index];
    // Delete from MinIO via edge function
    await supabase.functions.invoke('minio-delete', {
      body: { path: file.path },
    });
    onChange(files.filter((_, i) => i !== index));
  }, [files, onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
          dragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/40 hover:bg-muted/30'
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

        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            </div>
          ) : (
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-colors ${
              dragging ? 'bg-primary/15' : 'bg-muted'
            }`}>
              <Upload className={`h-7 w-7 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
          )}

          <div>
            <p className={`text-lg font-medium transition-colors ${dragging ? 'text-primary' : 'text-foreground'}`}>
              {uploading ? 'Enviando para MinIO...' : dragging ? 'Solte aqui' : 'Arraste ou clique para enviar'}
            </p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Máx: {maxFileSize}MB
              {allowedFileTypes?.length ? ` · ${allowedFileTypes.join(', ')}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive animate-fade-in">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Uploaded files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => {
            const FileIcon = getFileIcon(file.type);
            const isImage = file.type.startsWith('image/');

            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 group hover:border-primary/20 transition-colors"
              >
                {isImage ? (
                  <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <FileIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                </div>

                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); removeFile(i); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
