import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MessageSquare, Trash2, Phone, Image, FileText, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Upload, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { WhatsAppNodeData, FormVariable, IntegrationNodeData } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { VariableInput } from './shared';
import WhatsAppMessageEditor from './whatsapp/WhatsAppMessageEditor';
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

  // Fetch Evolution API instances from settings
  useEffect(() => {
    supabase.from('integration_settings')
      .select('*')
      .eq('integration_type', 'evolution_api')
      .then(({ data: rows }) => {
        if (rows) {
          setInstances(rows.map(r => ({
            id: r.id,
            label: r.label,
            config: r.config as any,
            is_active: r.is_active,
          })));
        }
      });
  }, []);

  const activeInstances = useMemo(() => instances.filter(i => i.is_active), [instances]);

  // File upload state
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

      if (error || !res?.success) {
        toast.error(res?.message || 'Falha no upload do arquivo');
        return;
      }

      onChange({ mediaUrl: res.url, mediaFileName: file.name });
      toast.success('Arquivo enviado com sucesso');
    } catch {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleTest = useCallback(async () => {
    if (!nodeData.instanceId || !nodeData.recipientNumber) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data: res } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          instanceId: nodeData.instanceId,
          recipientNumber: nodeData.recipientNumber,
          messageText: nodeData.messageText || 'Teste de conexão',
          mediaUrl: nodeData.mediaUrl,
          mediaType: nodeData.mediaType,
          testMode: true,
        },
      });
      setTestResult(res?.success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    }
    setTesting(false);
  }, [nodeData]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`w-[320px] rounded-xl border-2 transition-shadow ${selected ? 'border-node-whatsapp-accent shadow-lg' : 'border-border shadow-sm'} bg-card`}>
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-node-whatsapp-accent !border-2 !border-card" />
        <Handle type="source" position={Position.Right} id="default" className="!w-3 !h-3 !bg-node-whatsapp-accent !border-2 !border-card" />

        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-node-whatsapp rounded-t-[10px]">
          <div className="h-7 w-7 rounded-lg bg-node-whatsapp-accent/20 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-3.5 w-3.5 text-node-whatsapp-accent" />
          </div>
          <span className="text-xs font-semibold text-foreground flex-1 truncate">WhatsApp</span>
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p className="text-xs">Excluir nó</p></TooltipContent>
          </Tooltip>
        </div>

        {expanded && (
          <div className="p-3 space-y-3 text-xs nodrag nopan nowheel" onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            {/* Instance selector */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Instância</Label>
              {activeInstances.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/70 italic">Nenhuma instância configurada. Configure em Configurações → Integrações.</p>
              ) : (
                <Select value={nodeData.instanceId || ''} onValueChange={v => onChange({ instanceId: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar instância" /></SelectTrigger>
                  <SelectContent>
                    {activeInstances.map(inst => (
                      <SelectItem key={inst.id} value={inst.id} className="text-xs">
                        {inst.label} ({inst.config.instanceName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Recipient */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Destinatário (nº ou variável)</Label>
              <VariableInput
                value={nodeData.recipientNumber || ''}
                onChange={v => onChange({ recipientNumber: v })}
                variables={variables}
                integrationNodes={integrationNodes}
                placeholder="5511999999999 ou {{telefone}}"
                className="h-8 text-xs"
              />
            </div>

            {/* Message */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Mensagem</Label>
              <WhatsAppMessageEditor
                value={nodeData.messageText || ''}
                onChange={v => onChange({ messageText: v })}
                variables={variables}
                integrationNodes={integrationNodes}
                placeholder="Olá {{nome}}, obrigado!"
              />
            </div>

            {/* Media toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={nodeData.sendMedia || false}
                onCheckedChange={v => onChange({ sendMedia: v })}
                id={`media-${nodeData.id}`}
              />
              <Label htmlFor={`media-${nodeData.id}`} className="text-[10px] text-muted-foreground cursor-pointer">Enviar mídia</Label>
            </div>

            {nodeData.sendMedia && (
              <div className="space-y-2 pl-2 border-l-2 border-node-whatsapp-accent/20">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Tipo de mídia</Label>
                  <Select value={nodeData.mediaType || 'image'} onValueChange={v => onChange({ mediaType: v as any })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image" className="text-xs">🖼️ Imagem</SelectItem>
                      <SelectItem value="document" className="text-xs">📄 Documento</SelectItem>
                      <SelectItem value="video" className="text-xs">🎥 Vídeo</SelectItem>
                      <SelectItem value="audio" className="text-xs">🔊 Áudio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Arquivo de mídia</Label>
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
                    <div className="space-y-1.5">
                      {/* Thumbnail preview for images/videos */}
                      {(nodeData.mediaType === 'image' || nodeData.mediaType === 'video') && (
                        <div className="relative rounded overflow-hidden border border-border bg-muted/30">
                          {nodeData.mediaType === 'image' ? (
                            <img
                              src={nodeData.mediaUrl}
                              alt={nodeData.mediaFileName || 'Preview'}
                              className="w-full max-h-[120px] object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <video
                              src={nodeData.mediaUrl}
                              className="w-full max-h-[120px] object-cover"
                              muted
                              preload="metadata"
                            />
                          )}
                        </div>
                      )}
                      {/* Audio preview */}
                      {nodeData.mediaType === 'audio' && (
                        <audio src={nodeData.mediaUrl} controls className="w-full h-7" preload="metadata" />
                      )}
                      {/* Document icon preview */}
                      {nodeData.mediaType === 'document' && (
                        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border">
                          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <span className="text-[10px] text-muted-foreground truncate">{nodeData.mediaFileName || 'Documento'}</span>
                        </div>
                      )}
                      {/* File info + remove */}
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                        <span className="truncate flex-1 text-muted-foreground" title={nodeData.mediaFileName || nodeData.mediaUrl}>
                          {nodeData.mediaFileName || 'Arquivo enviado'}
                        </span>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-muted-foreground hover:text-foreground flex-shrink-0"
                          title="Trocar arquivo"
                        >
                          <Upload className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => onChange({ mediaUrl: '', mediaFileName: '' })}
                          className="text-muted-foreground hover:text-destructive flex-shrink-0"
                          title="Remover"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-7"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Upload className="mr-1.5 h-3 w-3" />}
                      {uploading ? 'Enviando...' : 'Enviar arquivo'}
                    </Button>
                  )}
                </div>
                {nodeData.mediaType === 'document' && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Nome do arquivo</Label>
                    <LocalInput
                      value={nodeData.mediaFileName || ''}
                      onCommit={v => onChange({ mediaFileName: v })}
                      placeholder="arquivo.pdf"
                      className="h-7 text-xs"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Test button */}
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs h-7"
                disabled={testing || !nodeData.instanceId || !nodeData.recipientNumber}
                onClick={handleTest}
              >
                {testing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Phone className="mr-1.5 h-3 w-3" />}
                Enviar teste
                {testResult === 'success' && <CheckCircle2 className="ml-1.5 h-3 w-3 text-success" />}
                {testResult === 'error' && <XCircle className="ml-1.5 h-3 w-3 text-destructive" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default memo(WhatsAppNode);
