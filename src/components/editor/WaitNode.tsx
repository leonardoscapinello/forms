import { Handle, Position } from '@xyflow/react';
import { Clock, Trash2 } from 'lucide-react';
import { WaitNodeData, WaitUnit, WaitFeedbackMode, WaitSkipAction, FunnelPage } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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

export default function WaitNode({ data }: Props) {
  const { nodeData, onChange, onDelete, pages } = data;
  const feedback = nodeData.feedback || { mode: 'button_countdown' as WaitFeedbackMode };
  const mode = feedback.mode || 'button_countdown';
  const skipAction = feedback.skipAction || 'continue';

  const updateFeedback = (patch: Partial<typeof feedback>) => {
    onChange({ feedback: { ...feedback, ...patch } });
  };

  return (
    <div className="bg-card rounded-xl border border-node-wait-accent/30 shadow-sm w-64 overflow-hidden">
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-node-wait-accent !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-node-wait border-b border-node-wait-accent/20">
        <div className="h-6 w-6 rounded-md bg-node-wait-accent/20 flex items-center justify-center">
          <Clock className="h-3.5 w-3.5 text-node-wait-accent" />
        </div>
        <span className="text-sm font-medium text-foreground flex-1">
          {nodeData.label || 'Espera'}
        </span>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Duration */}
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={nodeData.duration || 5}
            onChange={e => onChange({ duration: Number(e.target.value) })}
            className="w-16 h-8 text-sm text-center nodrag nopan"
          />
          <Select value={nodeData.unit || 'seconds'} onValueChange={(v: WaitUnit) => onChange({ unit: v })}>
            <SelectTrigger className="h-8 text-sm flex-1 nodrag nopan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(UNIT_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Feedback mode */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Feedback visual</Label>
          <Select value={mode} onValueChange={(v: WaitFeedbackMode) => updateFeedback({ mode: v })}>
            <SelectTrigger className="h-8 text-sm nodrag nopan">
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
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground">Texto do botão</Label>
            <Input
              value={feedback.buttonText || (mode === 'button_countdown' ? 'Aguarde' : 'Processando...')}
              onChange={e => updateFeedback({ buttonText: e.target.value })}
              placeholder={mode === 'button_countdown' ? 'Aguarde' : 'Processando...'}
              className="h-8 text-sm nodrag nopan"
            />
          </div>
        )}

        {mode === 'loading_screen' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Estilo</Label>
              <Select
                value={feedback.loadingStyle || 'bar'}
                onValueChange={(v: 'bar' | 'circular' | 'infinite') => updateFeedback({ loadingStyle: v })}
              >
                <SelectTrigger className="h-8 text-sm nodrag nopan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Barra</SelectItem>
                  <SelectItem value="circular">Circular</SelectItem>
                  <SelectItem value="infinite">Infinito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Texto</Label>
              <Input
                value={feedback.loadingLabel || 'Carregando...'}
                onChange={e => updateFeedback({ loadingLabel: e.target.value })}
                placeholder="Carregando..."
                className="h-8 text-sm nodrag nopan"
              />
            </div>
          </>
        )}

        {/* Toast notification on enter */}
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] text-muted-foreground">Mostrar notificação</Label>
          <Switch
            checked={feedback.showToast || false}
            onCheckedChange={(v) => updateFeedback({ showToast: v })}
            className="nodrag nopan"
          />
        </div>

        {feedback.showToast && (
          <div className="space-y-2 pl-1 border-l-2 border-node-wait-accent/20 ml-1">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Título</Label>
              <Input
                value={feedback.toastTitle || ''}
                onChange={e => updateFeedback({ toastTitle: e.target.value })}
                placeholder="Processando..."
                className="h-8 text-sm nodrag nopan"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Descrição</Label>
              <Input
                value={feedback.toastDescription || ''}
                onChange={e => updateFeedback({ toastDescription: e.target.value })}
                placeholder="Estamos preparando tudo para você"
                className="h-8 text-sm nodrag nopan"
              />
            </div>
          </div>
        )}

        {/* Allow skip */}
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] text-muted-foreground">Permitir pular</Label>
          <Switch
            checked={feedback.allowSkip || false}
            onCheckedChange={(v) => updateFeedback({ allowSkip: v })}
            className="nodrag nopan"
          />
        </div>

        {/* Skip action config — only when allowSkip is true */}
        {feedback.allowSkip && (
          <div className="space-y-2 pl-1 border-l-2 border-node-wait-accent/20 ml-1">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ação ao pular</Label>
              <Select value={skipAction} onValueChange={(v: WaitSkipAction) => updateFeedback({ skipAction: v })}>
                <SelectTrigger className="h-8 text-sm nodrag nopan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SKIP_ACTION_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Go to page: select target */}
            {skipAction === 'go_to_page' && pages && pages.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Página destino</Label>
                <Select
                  value={feedback.skipTargetPageId || ''}
                  onValueChange={(v) => updateFeedback({ skipTargetPageId: v })}
                >
                  <SelectTrigger className="h-8 text-sm nodrag nopan">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pages.map((p, i) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title || `Página ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Reduce time: amount + unit */}
            {skipAction === 'reduce_time' && (
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Reduzir em</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={feedback.skipReduceAmount || 5}
                    onChange={e => updateFeedback({ skipReduceAmount: Number(e.target.value) })}
                    className="w-16 h-8 text-sm text-center nodrag nopan"
                  />
                  <Select
                    value={feedback.skipReduceUnit || 'seconds'}
                    onValueChange={(v: WaitUnit) => updateFeedback({ skipReduceUnit: v })}
                  >
                    <SelectTrigger className="h-8 text-sm flex-1 nodrag nopan">
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

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-node-wait-accent !border-2 !border-card" />
    </div>
  );
}
