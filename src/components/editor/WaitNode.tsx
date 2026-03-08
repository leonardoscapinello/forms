import { Handle, Position } from '@xyflow/react';
import { Clock, Trash2 } from 'lucide-react';
import { WaitNodeData, WaitUnit, WaitFeedbackMode, WaitSkipAction, FunnelPage } from '@/types/form';
import { Input } from '@/components/ui/input';
import { LocalInput } from '@/components/editor/shared/LocalInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

const UNIT_LABELS: Record<WaitUnit, string> = {
  seconds: 'segundos',
  minutes: 'minutos',
  hours: 'horas',
};

const FEEDBACK_LABELS: Record<WaitFeedbackMode, string> = {
  button_countdown: '⏱ Contagem no botão',
  button_text: '✏️ Trocar texto do botão',
  loading_screen: '🔄 Tela de carregamento',
};

const SKIP_ACTION_LABELS: Record<WaitSkipAction, string> = {
  continue: '▶ Continuar fluxo',
  go_to_page: '📄 Ir para página',
  reduce_time: '⏩ Diminuir tempo',
};

interface Props {
  data: {
    nodeData: WaitNodeData;
    onChange: (patch: Partial<WaitNodeData>) => void;
    onDelete: () => void;
    pages?: FunnelPage[];
  };
}

export default function WaitNode({ data }: Props & { data: Props['data'] & { isNodeDisabled?: boolean } }) {
  const { nodeData, onChange, onDelete, pages, isNodeDisabled = false } = data as any;
  const feedback = nodeData.feedback || { mode: 'button_countdown' as WaitFeedbackMode };
  const mode = feedback.mode || 'button_countdown';
  const skipAction = feedback.skipAction || 'continue';

  const updateFeedback = (patch: Partial<typeof feedback>) => {
    onChange({ feedback: { ...feedback, ...patch } });
  };

  return (
    <div className={`bg-card rounded-xl border border-node-wait-accent/30 shadow-sm w-64 overflow-hidden ${isNodeDisabled ? 'opacity-50 grayscale' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-node-wait border-b border-node-wait-accent/20 rounded-t-xl">
        <Clock className="h-3.5 w-3.5 text-node-wait-accent" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-node-wait-accent">
          {nodeData.label || 'Espera'}
        </span>
        <div className="ml-auto">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-3 space-y-3 nodrag nopan nowheel" onPointerDown={e => e.stopPropagation()}>
        {/* Duration */}
        <div className="space-y-1">
          <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Duração</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={nodeData.duration || 5}
              onChange={e => onChange({ duration: Number(e.target.value) })}
              className="w-16 h-8 text-xs text-center"
            />
            <Select value={nodeData.unit || 'seconds'} onValueChange={(v: WaitUnit) => onChange({ unit: v })}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(UNIT_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Feedback mode */}
        <div className="space-y-1">
          <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Feedback visual</Label>
          <Select value={mode} onValueChange={(v: WaitFeedbackMode) => updateFeedback({ mode: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FEEDBACK_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mode-specific config */}
        {(mode === 'button_countdown' || mode === 'button_text') && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Texto do botão</Label>
            <LocalInput
              value={feedback.buttonText || (mode === 'button_countdown' ? 'Aguarde' : 'Processando...')}
              onCommit={v => updateFeedback({ buttonText: v })}
              placeholder={mode === 'button_countdown' ? 'Aguarde' : 'Processando...'}
              className="h-8 text-xs"
            />
          </div>
        )}

        {mode === 'loading_screen' && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Estilo</Label>
              <Select
                value={feedback.loadingStyle || 'bar'}
                onValueChange={(v: 'bar' | 'circular' | 'infinite') => updateFeedback({ loadingStyle: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Barra</SelectItem>
                  <SelectItem value="circular">Circular</SelectItem>
                  <SelectItem value="infinite">Infinito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Texto</Label>
              <LocalInput
                value={feedback.loadingLabel || 'Carregando...'}
                onCommit={v => updateFeedback({ loadingLabel: v })}
                placeholder="Carregando..."
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        {/* Toast notification */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Notificação</span>
          <Switch
            checked={feedback.showToast || false}
            onCheckedChange={(v) => updateFeedback({ showToast: v })}
            className="scale-75 origin-right"
          />
        </div>

        {feedback.showToast && (
          <div className="space-y-2 pl-2 border-l-2 border-node-wait-accent/20 ml-0.5">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Título</Label>
              <LocalInput
                value={feedback.toastTitle || ''}
                onCommit={v => updateFeedback({ toastTitle: v })}
                placeholder="Processando..."
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Descrição</Label>
              <LocalInput
                value={feedback.toastDescription || ''}
                onCommit={v => updateFeedback({ toastDescription: v })}
                placeholder="Estamos preparando tudo para você"
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        {/* Allow skip */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Permitir pular</span>
          <Switch
            checked={feedback.allowSkip || false}
            onCheckedChange={(v) => updateFeedback({ allowSkip: v })}
            className="scale-75 origin-right"
          />
        </div>

        {feedback.allowSkip && (
          <div className="space-y-2 pl-2 border-l-2 border-node-wait-accent/20 ml-0.5">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Texto do botão pular</Label>
              <LocalInput
                value={feedback.skipButtonText || ''}
                onCommit={v => updateFeedback({ skipButtonText: v })}
                placeholder="Pular espera"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ação ao pular</Label>
              <Select value={skipAction} onValueChange={(v: WaitSkipAction) => updateFeedback({ skipAction: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SKIP_ACTION_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {skipAction === 'go_to_page' && pages && pages.length > 0 && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Página destino</Label>
                <Select
                  value={feedback.skipTargetPageId || ''}
                  onValueChange={(v) => updateFeedback({ skipTargetPageId: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pages.map((p: any, i: number) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title || `Página ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {skipAction === 'reduce_time' && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Reduzir em</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={feedback.skipReduceAmount || 5}
                    onChange={e => updateFeedback({ skipReduceAmount: Number(e.target.value) })}
                    className="w-16 h-8 text-xs text-center"
                  />
                  <Select
                    value={feedback.skipReduceUnit || 'seconds'}
                    onValueChange={(v: WaitUnit) => updateFeedback({ skipReduceUnit: v })}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(UNIT_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />
    </div>
  );
}
