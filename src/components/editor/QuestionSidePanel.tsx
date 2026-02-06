import { useCallback, useState } from 'react';
import { Question, QUESTION_TYPE_LABELS, InputMask, QuestionType, RoutingMode } from '@/types/form';
import GraphicSidePanelSection from './GraphicSidePanelSection';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, X, ArrowRight, GitBranch } from 'lucide-react';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import { getNodeCategoryStyle } from './nodeCategoryStyles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import DeleteConfirmDialog from './DeleteConfirmDialog';

interface RoutingTarget {
  id: string;
  label: string;
}

interface Props {
  question: Question;
  index: number;
  onChange: (patch: Partial<Question>) => void;
  onDelete: () => void;
  onClose: () => void;
  /** All possible routing targets (other question nodes, condition nodes, etc.) */
  routingTargets: RoutingTarget[];
}

const MASK_OPTIONS: { value: InputMask['type']; label: string }[] = [
  { value: 'none', label: 'Nenhuma' },
  { value: 'cpf', label: 'CPF (000.000.000-00)' },
  { value: 'cnpj', label: 'CNPJ (00.000.000/0000-00)' },
  { value: 'cep', label: 'CEP (00000-000)' },
  { value: 'phone', label: 'Telefone ((00) 00000-0000)' },
  { value: 'currency', label: 'Moeda (R$ 0.000,00)' },
  { value: 'custom', label: 'Personalizada' },
];

const SUPPORTS_MASK: QuestionType[] = ['short_text', 'phone', 'number', 'contact_info'];
const SUPPORTS_PLACEHOLDER: QuestionType[] = [
  'short_text', 'long_text', 'email', 'phone', 'address', 'website',
  'number', 'contact_info', 'dropdown',
];
const SUPPORTS_VALIDATION: QuestionType[] = [
  'short_text', 'long_text', 'email', 'phone', 'number', 'website',
];
const NO_CONTENT_TYPES: QuestionType[] = ['welcome_screen', 'end_screen', 'statement', 'redirect_url', 'graphic'];
const CHOICE_TYPES: QuestionType[] = ['multiple_choice', 'single_choice', 'dropdown', 'ranking', 'yes_no'];

export default function QuestionSidePanel({ question, index, onChange, onDelete, onClose, routingTargets }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const Icon = QUESTION_TYPE_ICONS[question.type];
  const catStyle = getNodeCategoryStyle(question.type);
  const hasMask = SUPPORTS_MASK.includes(question.type);
  const hasPlaceholder = SUPPORTS_PLACEHOLDER.includes(question.type);
  const hasValidation = SUPPORTS_VALIDATION.includes(question.type);
  const isStructural = NO_CONTENT_TYPES.includes(question.type);
  const isChoice = CHOICE_TYPES.includes(question.type);

  const addOption = useCallback(() => {
    const options = [...(question.options || [])];
    options.push({ id: crypto.randomUUID(), label: `Opção ${options.length + 1}` });
    onChange({ options });
  }, [question.options, onChange]);

  const updateOption = useCallback((optionId: string, label: string) => {
    const options = (question.options || []).map(o =>
      o.id === optionId ? { ...o, label } : o
    );
    onChange({ options });
  }, [question.options, onChange]);

  const removeOption = useCallback((optionId: string) => {
    onChange({ options: (question.options || []).filter(o => o.id !== optionId) });
  }, [question.options, onChange]);

  const updateOptionRouting = useCallback((optionId: string, nextNodeId: string | undefined) => {
    const options = (question.options || []).map(o =>
      o.id === optionId ? { ...o, nextNodeId } : o
    );
    onChange({ options });
  }, [question.options, onChange]);

  const routingMode = question.routingMode || 'all_next';

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${catStyle.bg} ${catStyle.border}`}>
        <Icon className={`h-4 w-4 ${catStyle.accent}`} />
        <span className={`text-xs font-medium uppercase tracking-wide ${catStyle.accent}`}>
          {QUESTION_TYPE_LABELS[question.type]}
        </span>
        <span className="text-xs text-muted-foreground/60 ml-1">#{index + 1}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input
              value={question.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="Título da pergunta"
              className="text-sm font-medium"
            />
          </div>

          {/* Description */}
          {!isStructural && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Textarea
                value={question.description || ''}
                onChange={e => onChange({ description: e.target.value })}
                placeholder="Descrição opcional..."
                className="text-xs"
                rows={2}
              />
            </div>
          )}

          {/* Redirect URL */}
          {question.type === 'redirect_url' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">URL de redirecionamento</Label>
              <Input
                value={question.redirectUrl || ''}
                onChange={e => onChange({ redirectUrl: e.target.value })}
                placeholder="https://exemplo.com"
                className="text-xs"
              />
            </div>
          )}

          {/* Webhook config */}
          {question.type === 'webhook' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">URL do Webhook</Label>
                <Input
                  value={question.webhookUrl || ''}
                  onChange={e => onChange({ webhookUrl: e.target.value })}
                  placeholder="https://api.exemplo.com/webhook"
                  className="text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Método HTTP</Label>
                <Select
                  value={question.webhookMethod || 'POST'}
                  onValueChange={v => onChange({ webhookMethod: v as 'GET' | 'POST' | 'PUT' })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200] bg-popover">
                    <SelectItem value="GET" className="text-xs">GET</SelectItem>
                    <SelectItem value="POST" className="text-xs">POST</SelectItem>
                    <SelectItem value="PUT" className="text-xs">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Button text */}
          {(question.type === 'welcome_screen' || question.type === 'end_screen' || question.type === 'statement') && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Texto do botão</Label>
              <Input
                value={question.buttonText || ''}
                onChange={e => onChange({ buttonText: e.target.value })}
                placeholder="Texto do botão"
                className="text-xs"
              />
            </div>
          )}

          {/* Graphic config */}
          {question.type === 'graphic' && (
            <GraphicSidePanelSection question={question} onChange={onChange} />
          )}

          {/* Options */}
          {isChoice && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Opções</Label>
              {(question.options || []).map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/60 w-4 text-right">{i + 1}</span>
                  <Input
                    value={opt.label}
                    onChange={e => updateOption(opt.id, e.target.value)}
                    className="text-xs flex-1"
                  />
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeOption(opt.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs border-dashed" onClick={addOption}>
                <Plus className="mr-1 h-3 w-3" />
                Adicionar opção
              </Button>
            </div>
          )}

          {/* Routing config for choice types */}
          {isChoice && (
            <div className="space-y-3">
              <div className="border-t border-border" />
              <div className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                <Label className="text-xs font-medium">Roteamento</Label>
              </div>

              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <Button
                    variant={routingMode === 'all_next' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-[11px] h-7"
                    onClick={() => onChange({ routingMode: 'all_next' })}
                  >
                    <ArrowRight className="mr-1 h-3 w-3" />
                    Todos → próximo
                  </Button>
                  <Button
                    variant={routingMode === 'per_option' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-[11px] h-7"
                    onClick={() => onChange({ routingMode: 'per_option' })}
                  >
                    <GitBranch className="mr-1 h-3 w-3" />
                    Por opção
                  </Button>
                </div>

                {routingMode === 'per_option' && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Conecte cada opção ao destino arrastando do ponto no canvas.
                  </p>
                )}
              </div>
            </div>
          )}


          {question.type === 'rating' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Número de estrelas</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={question.maxRating || 5}
                onChange={e => onChange({ maxRating: Number(e.target.value) })}
                className="text-xs w-24"
              />
            </div>
          )}

          {/* NPS / Opinion Scale config */}
          {(question.type === 'nps' || question.type === 'opinion_scale') && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Valor mín.</Label>
                  <Input type="number" value={question.scaleMin ?? 0} onChange={e => onChange({ scaleMin: Number(e.target.value) })} className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Valor máx.</Label>
                  <Input type="number" value={question.scaleMax ?? 10} onChange={e => onChange({ scaleMax: Number(e.target.value) })} className="text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Label mín.</Label>
                  <Input value={question.labelMin || ''} onChange={e => onChange({ labelMin: e.target.value })} className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Label máx.</Label>
                  <Input value={question.labelMax || ''} onChange={e => onChange({ labelMax: e.target.value })} className="text-xs" />
                </div>
              </div>
            </div>
          )}

          {/* File upload config */}
          {question.type === 'file_upload' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tamanho máximo (MB)</Label>
              <Input
                type="number"
                value={question.maxFileSize ?? 10}
                onChange={e => onChange({ maxFileSize: Number(e.target.value) })}
                className="text-xs w-24"
              />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Placeholder */}
          {hasPlaceholder && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Placeholder</Label>
              <Input
                value={question.placeholder || ''}
                onChange={e => onChange({ placeholder: e.target.value })}
                placeholder="Texto do placeholder..."
                className="text-xs"
              />
            </div>
          )}

          {/* Mask */}
          {hasMask && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Máscara de entrada</Label>
              <Select
                value={question.mask?.type || 'none'}
                onValueChange={v => onChange({ mask: { ...question.mask, type: v as InputMask['type'] } })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200] bg-popover">
                  {MASK_OPTIONS.map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {question.mask?.type === 'custom' && (
                <Input
                  value={question.mask?.pattern || ''}
                  onChange={e => onChange({ mask: { type: 'custom', pattern: e.target.value } })}
                  placeholder="Ex: 000.000.000-00"
                  className="text-xs mt-1"
                />
              )}
            </div>
          )}

          {/* Validation */}
          {hasValidation && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Validação</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Mín. caracteres</Label>
                  <Input
                    type="number"
                    value={question.validation?.minLength ?? ''}
                    onChange={e => onChange({ validation: { ...question.validation, minLength: e.target.value ? Number(e.target.value) : undefined } })}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Máx. caracteres</Label>
                  <Input
                    type="number"
                    value={question.validation?.maxLength ?? ''}
                    onChange={e => onChange({ validation: { ...question.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } })}
                    className="text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground/70">Mensagem de erro</Label>
                <Input
                  value={question.validation?.customError || ''}
                  onChange={e => onChange({ validation: { ...question.validation, customError: e.target.value } })}
                  placeholder="Ex: Campo inválido"
                  className="text-xs"
                />
              </div>
            </div>
          )}

          {/* Required toggle */}
          {!isStructural && (
            <>
              <div className="border-t border-border" />
              <div className="flex items-center justify-between">
                <Label className="text-xs">Obrigatória</Label>
                <Switch
                  checked={question.required}
                  onCheckedChange={v => onChange({ required: v })}
                />
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        title="Excluir pergunta"
        description={`Tem certeza que deseja excluir "${question.title || 'Sem título'}"? As conexões associadas também serão removidas.`}
        onConfirm={() => { setShowDeleteConfirm(false); onDelete(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
