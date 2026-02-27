import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MessageSquare, Trash2, Phone, Image, FileText, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { WhatsAppNodeData, FormVariable, IntegrationNodeData } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { VariableInput } from './shared';

/** Local input to prevent cursor jumping */
function LocalInput({ value, onCommit, ...rest }: Omit<React.ComponentProps<typeof Input>, 'onChange' | 'onBlur'> & { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <Input
      {...rest}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
    />
  );
}

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
          <div className="p-3 space-y-3 text-xs">
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
              <VariableInput
                as="textarea"
                value={nodeData.messageText || ''}
                onChange={v => onChange({ messageText: v })}
                variables={variables}
                integrationNodes={integrationNodes}
                placeholder="Olá {{nome}}, obrigado!"
                className="text-xs min-h-[60px]"
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
                  <Label className="text-[10px] text-muted-foreground">URL da mídia</Label>
                  <VariableInput
                    value={nodeData.mediaUrl || ''}
                    onChange={v => onChange({ mediaUrl: v })}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    placeholder="https://... ou {{url_variavel}}"
                    className="h-7 text-xs"
                  />
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
