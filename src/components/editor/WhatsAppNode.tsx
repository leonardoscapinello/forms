import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  MessageSquare, Trash2, Phone, FileText, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, Upload, X, Paperclip, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { WhatsAppNodeData, FormVariable, IntegrationNodeData } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { VariableInput } from './shared';
import WhatsAppMessageEditor from './whatsapp/WhatsAppMessageEditor';
import WhatsAppPreviewCard from './whatsapp/WhatsAppPreviewCard';
import { LocalInput } from './shared/LocalInput';
import { toast } from 'sonner';

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
}

function WhatsAppNode({ data, selected }: NodeProps & { data: WhatsAppNodeProps }) {
  const { nodeData, onChange, onDelete, variables = [], integrationNodes = [] } = data;
  const [expanded, setExpanded] = useState(true);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

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
        <div className={`w-[300px] rounded-2xl border transition-all duration-200 overflow-hidden ${
          selected
            ? 'border-node-whatsapp-accent shadow-[0_0_20px_-4px_hsl(var(--node-whatsapp-accent)/0.4)] ring-1 ring-node-whatsapp-accent/30'
            : 'border-border shadow-sm hover:shadow-md'
        } bg-card`}>

          <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-node-whatsapp-accent !border-2 !border-card" />
          <Handle type="source" position={Position.Right} id="default" className="!w-3 !h-3 !bg-node-whatsapp-accent !border-2 !border-card" />

          {/* Header — WhatsApp green bar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-node-whatsapp-accent/90 to-node-whatsapp-accent">
            <div className="h-6 w-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <MessageSquare className="h-3 w-3 text-white" />
            </div>
            <span className="text-[11px] font-semibold text-white flex-1 truncate tracking-wide">WhatsApp</span>

            {/* Collapsed summary chips */}
            {!expanded && (
              <div className="flex items-center gap-1">
                {nodeData.recipientNumber && (
                  <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
                    {nodeData.recipientNumber.startsWith('{{') ? nodeData.recipientNumber : `+${nodeData.recipientNumber.slice(0, 6)}…`}
                  </span>
                )}
                {hasMedia && <Paperclip className="h-3 w-3 text-white/70" />}
              </div>
            )}

            <button onClick={() => setExpanded(!expanded)} className="text-white/70 hover:text-white transition-colors">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onDelete} className="text-white/50 hover:text-white transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top"><p className="text-xs">Excluir</p></TooltipContent>
            </Tooltip>
          </div>

          {expanded && (
            <div className="nodrag nopan nowheel" onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>

              {/* Section: Connection */}
              <div className="px-3 pt-3 pb-2 space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="h-1 w-1 rounded-full bg-node-whatsapp-accent" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-node-whatsapp-accent">Conexão</span>
                </div>

                {activeInstances.length === 0 ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                    <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                    <p className="text-[10px] text-destructive/80">Nenhuma instância configurada</p>
                  </div>
                ) : (
                  <Select value={nodeData.instanceId || ''} onValueChange={v => onChange({ instanceId: v })}>
                    <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Selecionar instância…" /></SelectTrigger>
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

              <div className="h-px bg-border mx-3" />

              {/* Section: Recipient */}
              <div className="px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Destinatário</span>
                </div>
                <VariableInput
                  value={nodeData.recipientNumber || ''}
                  onChange={v => onChange({ recipientNumber: v })}
                  variables={variables}
                  integrationNodes={integrationNodes}
                  placeholder="5511999999999 ou {{telefone}}"
                  className="h-8 text-xs rounded-lg"
                />
              </div>

              <div className="h-px bg-border mx-3" />

              {/* Section: Message */}
              <div className="px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Mensagem</span>
                </div>
                <WhatsAppMessageEditor
                  value={nodeData.messageText || ''}
                  onChange={v => onChange({ messageText: v })}
                  variables={variables}
                  integrationNodes={integrationNodes}
                  placeholder="Olá {{nome}}, obrigado!"
                />
              </div>

              <div className="h-px bg-border mx-3" />

              {/* Section: Media */}
              <div className="px-3 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Mídia</span>
                  </div>
                  <Switch
                    checked={nodeData.sendMedia || false}
                    onCheckedChange={v => onChange({ sendMedia: v })}
                    id={`media-${nodeData.id}`}
                    className="scale-75 origin-right"
                  />
                </div>

                {nodeData.sendMedia && (
                  <div className="space-y-2">
                    {/* Media type as pill buttons */}
                    <div className="flex gap-1">
                      {([
                        { v: 'image', l: '🖼️', t: 'Imagem' },
                        { v: 'document', l: '📄', t: 'Doc' },
                        { v: 'video', l: '🎥', t: 'Vídeo' },
                        { v: 'audio', l: '🔊', t: 'Áudio' },
                      ] as const).map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => onChange({ mediaType: opt.v })}
                          className={`flex-1 text-[10px] py-1 rounded-md transition-all ${
                            (nodeData.mediaType || 'image') === opt.v
                              ? 'bg-node-whatsapp-accent/15 text-node-whatsapp-accent font-medium ring-1 ring-node-whatsapp-accent/30'
                              : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {opt.l} {opt.t}
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
                        {/* Visual preview */}
                        {nodeData.mediaType === 'image' && (
                          <img src={nodeData.mediaUrl} alt="" className="w-full max-h-[100px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        {nodeData.mediaType === 'video' && (
                          <video src={nodeData.mediaUrl} className="w-full max-h-[100px] object-cover" muted preload="metadata" />
                        )}
                        {nodeData.mediaType === 'audio' && (
                          <div className="px-2 py-2">
                            <audio src={nodeData.mediaUrl} controls className="w-full h-7" preload="metadata" />
                          </div>
                        )}
                        {nodeData.mediaType === 'document' && (
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <FileText className="h-5 w-5 text-node-whatsapp-accent flex-shrink-0" />
                            <span className="text-[10px] text-foreground truncate flex-1">{nodeData.mediaFileName || 'Documento'}</span>
                          </div>
                        )}

                        {/* File actions bar */}
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
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg border-2 border-dashed border-border hover:border-node-whatsapp-accent/40 hover:bg-node-whatsapp/30 text-muted-foreground hover:text-node-whatsapp-accent transition-all text-xs"
                      >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? 'Enviando…' : 'Selecionar arquivo'}
                      </button>
                    )}

                    {nodeData.mediaType === 'document' && nodeData.mediaUrl && (
                      <LocalInput
                        value={nodeData.mediaFileName || ''}
                        onCommit={v => onChange({ mediaFileName: v })}
                        placeholder="Nome do arquivo"
                        className="h-7 text-xs rounded-lg"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Footer: Test button */}
              <div className="px-3 pb-3 pt-1">
                <button
                  type="button"
                  disabled={testing || !nodeData.instanceId || !nodeData.recipientNumber}
                  onClick={handleTest}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all ${
                    testing || !nodeData.instanceId || !nodeData.recipientNumber
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-node-whatsapp-accent text-white hover:bg-node-whatsapp-accent/90 shadow-sm'
                  }`}
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : testResult === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : testResult === 'error' ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {testing ? 'Enviando…' : testResult === 'success' ? 'Enviado!' : testResult === 'error' ? 'Falhou' : 'Enviar teste'}
                </button>
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
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export default memo(WhatsAppNode);
