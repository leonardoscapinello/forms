import { memo, useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  MessageSquare, Trash2, Phone, FileText, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, Upload, X, Paperclip, Send, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { WhatsAppNodeData, FormVariable, IntegrationNodeData, TrackedParam } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { VariableInput } from './shared';
import WhatsAppMessageEditor from './whatsapp/WhatsAppMessageEditor';
import WhatsAppPreviewCard from './whatsapp/WhatsAppPreviewCard';
import { LocalInput } from './shared/LocalInput';
import { toast } from 'sonner';
import type { InputElementGroup } from './VariableAssignPanel';

interface EvolutionInstance {
  id: string;
  label: string;
  config: { apiUrl: string; apiKey: string; instanceName: string };
  is_active: boolean;
}

export interface WhatsAppNodeProps {
  nodeData: WhatsAppNodeData;
  onChange: (patch: Partial<WhatsAppNodeData>) => void;
  onDelete: () => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
}

function WhatsAppNode({ data, selected }: NodeProps & { data: WhatsAppNodeProps }) {
  const { nodeData, onChange, onDelete, variables = [], integrationNodes = [], allInputElements = [], trackedParams } = data;
  const [expanded, setExpanded] = useState(true);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const GalleryPicker = useMemo(() => lazy(() => import('./GalleryPicker')), []);

  useEffect(() => {
    supabase.from('integration_settings')
      .select('*')
      .eq('integration_type', 'evolution_api')
      .then(({ data: rows }) => {
        if (rows) {
          setInstances(rows.map(r => ({
            id: r.id, label: r.label,
            config: r.config as any, is_active: r.is_active,
          })));
        }
      });
  }, []);

  const activeInstances = useMemo(() => instances.filter(i => i.is_active), [instances]);
  const elementLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of allInputElements) {
      for (const el of group.elements) {
        map[el.elementId] = el.elementLabel;
      }
    }
    return map;
  }, [allInputElements]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `whatsapp/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      const { data: res, error } = await supabase.functions.invoke('minio-upload', { body: formData });
      if (error || !res?.success) { toast.error(res?.message || 'Falha no upload'); return; }
      onChange({ mediaUrl: res.url, mediaFileName: file.name });
      toast.success('Arquivo enviado');
    } catch { toast.error('Erro ao enviar arquivo'); }
    finally { setUploading(false); }
  }, [onChange]);

  const handleTest = useCallback(async () => {
    if (!nodeData.instanceId || !nodeData.recipientNumber) return;
    setTesting(true); setTestResult(null);
    try {
      const { data: res } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          instanceId: nodeData.instanceId, recipientNumber: nodeData.recipientNumber,
          messageText: nodeData.messageText || 'Teste de conexão',
          mediaUrl: nodeData.mediaUrl, mediaType: nodeData.mediaType, testMode: true,
        },
      });
      setTestResult(res?.success ? 'success' : 'error');
    } catch { setTestResult('error'); }
    setTesting(false);
  }, [nodeData]);

  const hasMedia = nodeData.sendMedia && nodeData.mediaUrl;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative">
        <div className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
          selected
            ? 'border-node-whatsapp-accent shadow-md ring-2 ring-node-whatsapp-accent/20'
            : 'border-border'
        }`}>

          <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-node-whatsapp-accent !border-2 !border-card" />
          <Handle type="source" position={Position.Right} id="default" className="!w-3 !h-3 !bg-node-whatsapp-accent !border-2 !border-card" />

          {/* Header — matches other nodes */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-node-whatsapp-accent/30 bg-node-whatsapp rounded-t-xl">
            <MessageSquare className="h-3.5 w-3.5 text-node-whatsapp-accent" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-node-whatsapp-accent">WhatsApp</span>

            {/* Collapsed summary chips */}
            {!expanded && (
              <div className="flex items-center gap-1 ml-1">
                {nodeData.recipientNumber && (
                  <span className="text-[9px] bg-node-whatsapp-accent/15 text-node-whatsapp-accent px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
                    {nodeData.recipientNumber.startsWith('{{') ? nodeData.recipientNumber : `+${nodeData.recipientNumber.slice(0, 6)}…`}
                  </span>
                )}
                {hasMedia && <Paperclip className="h-3 w-3 text-node-whatsapp-accent/60" />}
              </div>
            )}

            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setExpanded(!expanded)} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="nodrag nopan nowheel" onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>

              {/* Body */}
              <div className="px-3 py-3 space-y-3">

                {/* Connection */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Instância
                  </span>
                  {activeInstances.length === 0 ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                      <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                      <p className="text-[10px] text-destructive/80">Nenhuma instância configurada</p>
                    </div>
                  ) : (
                    <Select value={nodeData.instanceId || ''} onValueChange={v => onChange({ instanceId: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar instância…" /></SelectTrigger>
                      <SelectContent>
                        {activeInstances.map(inst => (
                          <SelectItem key={inst.id} value={inst.id} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-node-whatsapp-accent inline-block" />
                              {inst.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Recipient */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Destinatário
                  </span>
                  <VariableInput
                    value={nodeData.recipientNumber || ''}
                    onChange={v => onChange({ recipientNumber: v })}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    allInputElements={allInputElements}
                    trackedParams={trackedParams}
                    placeholder="5511999999999 ou {{telefone}}"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Message */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Mensagem
                  </span>
                  <WhatsAppMessageEditor
                    value={nodeData.messageText || ''}
                    onChange={v => onChange({ messageText: v })}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    allInputElements={allInputElements}
                    trackedParams={trackedParams}
                    placeholder="Olá {{nome}}, obrigado!"
                    sendMedia={nodeData.sendMedia}
                    mediaType={nodeData.mediaType}
                    mediaUrl={nodeData.mediaUrl}
                    mediaFileName={nodeData.mediaFileName}
                  />
                </div>

                {/* Media toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Mídia
                    </span>
                    <Switch
                      checked={nodeData.sendMedia || false}
                      onCheckedChange={v => onChange({ sendMedia: v })}
                      id={`media-${nodeData.id}`}
                      className="scale-75 origin-right"
                    />
                  </div>

                  {nodeData.sendMedia && (
                    <div className="space-y-2">
                      {/* Media type pills */}
                      <div className="flex gap-1">
                        {([
                          { v: 'image', l: '🖼️ Imagem' },
                          { v: 'document', l: '📄 Doc' },
                          { v: 'video', l: '🎥 Vídeo' },
                          { v: 'audio', l: '🔊 Áudio' },
                        ] as const).map(opt => (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => onChange({ mediaType: opt.v })}
                            className={`flex-1 text-[10px] py-1 rounded-md border transition-colors ${
                              (nodeData.mediaType || 'image') === opt.v
                                ? 'bg-node-whatsapp text-node-whatsapp-accent border-node-whatsapp-accent/30 font-medium'
                                : 'border-border text-muted-foreground hover:border-node-whatsapp-accent/40'
                            }`}
                          >
                            {opt.l}
                          </button>
                        ))}
                      </div>

                      {/* File upload / preview */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={
                          nodeData.mediaType === 'image' ? 'image/*' :
                          nodeData.mediaType === 'video' ? 'video/*' :
                          nodeData.mediaType === 'audio' ? 'audio/*' : '*'
                        }
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleFileUpload(f);
                          e.target.value = '';
                        }}
                      />

                      {nodeData.mediaUrl ? (
                        <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
                          {nodeData.mediaType === 'image' && (
                            <img src={nodeData.mediaUrl} alt="" className="w-full max-h-[80px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          {nodeData.mediaType === 'video' && (
                            <video src={nodeData.mediaUrl} className="w-full max-h-[80px] object-cover" muted preload="metadata" />
                          )}
                          {nodeData.mediaType === 'audio' && (
                            <div className="px-2 py-2">
                              <audio src={nodeData.mediaUrl} controls className="w-full h-7" preload="metadata" />
                            </div>
                          )}
                          {nodeData.mediaType === 'document' && (
                            <div className="flex items-center gap-2 px-3 py-2">
                              <FileText className="h-4 w-4 text-node-whatsapp-accent flex-shrink-0" />
                              <span className="text-[10px] text-foreground truncate flex-1">{nodeData.mediaFileName || 'Documento'}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border bg-card">
                            <CheckCircle2 className="h-3 w-3 text-node-whatsapp-accent flex-shrink-0" />
                            <span className="text-[9px] text-muted-foreground truncate flex-1">{nodeData.mediaFileName || 'Arquivo enviado'}</span>
                            <button onClick={() => fileInputRef.current?.click()} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Trocar">
                              <Upload className="h-3 w-3" />
                            </button>
                            <button onClick={() => onChange({ mediaUrl: '', mediaFileName: '' })} className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors" title="Remover">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border hover:border-node-whatsapp-accent/40 text-muted-foreground hover:text-node-whatsapp-accent transition-colors text-xs"
                          >
                            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {uploading ? 'Enviando…' : 'Upload'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setGalleryOpen(true)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border hover:border-node-whatsapp-accent/40 text-muted-foreground hover:text-node-whatsapp-accent transition-colors text-xs"
                          >
                            <ImageIcon className="h-3.5 w-3.5" /> Galeria
                          </button>
                        </div>
                      )}

                      {nodeData.mediaType === 'document' && nodeData.mediaUrl && (
                        <LocalInput
                          value={nodeData.mediaFileName || ''}
                          onCommit={v => onChange({ mediaFileName: v })}
                          placeholder="Nome do arquivo"
                          className="h-7 text-xs"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: Test button */}
              <div className="border-t border-border px-3 py-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-2"
                  disabled={testing || !nodeData.instanceId || !nodeData.recipientNumber}
                  onClick={handleTest}
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : testResult === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-node-whatsapp-accent" />
                  ) : testResult === 'error' ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {testing ? 'Enviando…' : testResult === 'success' ? 'Enviado!' : testResult === 'error' ? 'Falhou' : 'Enviar teste'}
                </Button>
              </div>
              {/* Fire once toggle */}
              <div className="flex items-center gap-2 px-3 pb-2">
                <Switch
                  checked={nodeData.fireOnce !== false}
                  onCheckedChange={v => onChange({ ...nodeData, fireOnce: v })}
                  className="scale-75"
                />
                <span className="text-[10px] text-muted-foreground">Disparar apenas 1× por sessão</span>
              </div>
            </div>
          )}
        </div>

        {/* Preview card */}
        {selected && expanded && (
          <WhatsAppPreviewCard
            messageText={nodeData.messageText}
            sendMedia={nodeData.sendMedia}
            mediaType={nodeData.mediaType}
            mediaUrl={nodeData.mediaUrl}
            mediaFileName={nodeData.mediaFileName}
            elementLookup={elementLookup}
          />
        )}

        {/* Gallery Picker */}
        {galleryOpen && (
          <Suspense fallback={null}>
            <GalleryPicker
              open={galleryOpen}
              onClose={() => setGalleryOpen(false)}
              accept={
                nodeData.mediaType === 'image' ? 'image/*' :
                nodeData.mediaType === 'video' ? 'video/*' :
                nodeData.mediaType === 'audio' ? 'audio/*' : undefined
              }
              onSelect={file => {
                onChange({ mediaUrl: file.url, mediaFileName: file.name });
                setGalleryOpen(false);
              }}
            />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}

export default memo(WhatsAppNode);
