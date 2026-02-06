import { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Question, QUESTION_TYPE_LABELS, InputMask } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Settings2 } from 'lucide-react';
import InlineAddMenu from './InlineAddMenu';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface QuestionNodeData {
  question: Question;
  index: number;
  onChange: (patch: Partial<Question>) => void;
  onDelete: () => void;
  onAddAfter: (question: Question) => void;
  onAddCondition: () => void;
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

const SUPPORTS_MASK: string[] = ['short_text', 'phone', 'number', 'contact_info'];
const SUPPORTS_PLACEHOLDER: string[] = [
  'short_text', 'long_text', 'email', 'phone', 'address', 'website',
  'number', 'contact_info', 'dropdown',
];
const SUPPORTS_VALIDATION: string[] = [
  'short_text', 'long_text', 'email', 'phone', 'number', 'website',
];

// Types that have no handles (structural nodes)
const NO_CONTENT_TYPES: string[] = ['welcome_screen', 'end_screen', 'statement', 'redirect_url'];

function QuestionNode({ data, selected }: NodeProps & { data: QuestionNodeData }) {
  const { question, index, onChange, onDelete, onAddAfter, onAddCondition } = data;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const Icon = QUESTION_TYPE_ICONS[question.type];
  const hasMask = SUPPORTS_MASK.includes(question.type);
  const hasPlaceholder = SUPPORTS_PLACEHOLDER.includes(question.type);
  const hasValidation = SUPPORTS_VALIDATION.includes(question.type);
  const isStructural = NO_CONTENT_TYPES.includes(question.type);

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

  return (
    <div className="relative">
      <div
        className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
          selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
        }`}
      >
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 rounded-t-xl">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wide">
            {QUESTION_TYPE_LABELS[question.type]}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground/60 ml-auto">#{index + 1}</span>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 ${showAdvanced ? 'text-primary' : 'text-muted-foreground'} hover:text-primary`}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Settings2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        <Input
          value={question.title}
          onChange={e => onChange({ title: e.target.value })}
          placeholder="Título da pergunta"
          className="text-sm font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent h-8"
        />

        {!isStructural && (
          <Input
            value={question.description || ''}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="Descrição (opcional)"
            className="text-xs border-0 px-0 shadow-none focus-visible:ring-0 text-muted-foreground bg-transparent h-7"
          />
        )}

        {/* Structural types */}
        {question.type === 'redirect_url' && (
          <Input
            value={question.redirectUrl || ''}
            onChange={e => onChange({ redirectUrl: e.target.value })}
            placeholder="https://exemplo.com"
            className="text-xs h-7"
          />
        )}

        {(question.type === 'welcome_screen' || question.type === 'end_screen' || question.type === 'statement') && (
          <Input
            value={question.buttonText || ''}
            onChange={e => onChange({ buttonText: e.target.value })}
            placeholder="Texto do botão"
            className="text-xs h-7"
          />
        )}

        {/* Options for choice types */}
        {(question.type === 'multiple_choice' || question.type === 'single_choice' || question.type === 'dropdown' || question.type === 'ranking') && (
          <div className="space-y-1.5">
            {(question.options || []).map(opt => (
              <div key={opt.id} className="flex items-center gap-1.5">
                <div className={`h-3 w-3 flex-shrink-0 border border-border ${
                  question.type === 'single_choice' ? 'rounded-full' : 'rounded-sm'
                }`} />
                <Input
                  value={opt.label}
                  onChange={e => updateOption(opt.id, e.target.value)}
                  className="h-7 text-xs flex-1"
                />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={() => removeOption(opt.id)}>
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-[11px] h-6 text-muted-foreground px-0" onClick={addOption}>
              <Plus className="mr-1 h-2.5 w-2.5" />
              Adicionar opção
            </Button>
          </div>
        )}

        {/* Yes/No */}
        {question.type === 'yes_no' && (
          <div className="flex gap-2">
            <div className="flex-1 text-center py-1.5 rounded border border-border text-xs text-muted-foreground">Sim</div>
            <div className="flex-1 text-center py-1.5 rounded border border-border text-xs text-muted-foreground">Não</div>
          </div>
        )}

        {/* Legal */}
        {question.type === 'legal' && (
          <div className="flex items-start gap-2">
            <div className="h-3.5 w-3.5 rounded-sm border border-border mt-0.5 flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground">Aceito os termos e condições</span>
          </div>
        )}

        {/* Rating */}
        {question.type === 'rating' && (
          <div className="flex gap-1">
            {Array.from({ length: question.maxRating || 5 }).map((_, i) => (
              <div key={i} className="h-6 w-6 rounded border border-border flex items-center justify-center text-[10px] text-muted-foreground">
                {i + 1}
              </div>
            ))}
          </div>
        )}

        {/* NPS / Opinion Scale */}
        {(question.type === 'nps' || question.type === 'opinion_scale') && (
          <div className="space-y-1">
            <div className="flex gap-0.5">
              {Array.from({ length: (question.scaleMax || 10) - (question.scaleMin || 0) + 1 }).map((_, i) => (
                <div key={i} className="flex-1 h-6 rounded border border-border flex items-center justify-center text-[9px] text-muted-foreground">
                  {(question.scaleMin || 0) + i}
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground">{question.labelMin}</span>
              <span className="text-[9px] text-muted-foreground">{question.labelMax}</span>
            </div>
          </div>
        )}

        {/* Text input previews */}
        {(question.type === 'short_text' || question.type === 'email' || question.type === 'number' || question.type === 'phone' || question.type === 'website' || question.type === 'address') && (
          <Input disabled placeholder={question.placeholder || 'Resposta...'} className="text-xs h-7" />
        )}

        {question.type === 'long_text' && (
          <Textarea disabled placeholder={question.placeholder || 'Resposta...'} className="text-xs" rows={2} />
        )}

        {question.type === 'date' && (
          <Input disabled type="date" className="text-xs h-7 w-36" />
        )}

        {question.type === 'contact_info' && (
          <div className="space-y-1">
            <Input disabled placeholder="Nome" className="text-xs h-6" />
            <Input disabled placeholder="Email" className="text-xs h-6" />
            <Input disabled placeholder="Telefone" className="text-xs h-6" />
          </div>
        )}

        {question.type === 'file_upload' && (
          <div className="border border-dashed border-border rounded-lg p-3 text-center">
            <span className="text-[10px] text-muted-foreground">Arraste ou clique para enviar</span>
          </div>
        )}

        {question.type === 'checkbox' && (
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 rounded-sm border border-border" />
            <span className="text-xs text-muted-foreground">Marcar opção</span>
          </div>
        )}

        {/* Advanced Config Panel */}
        {showAdvanced && (
          <div className="border-t border-border pt-2.5 mt-2.5 space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Configurações avançadas</p>

            {/* Placeholder */}
            {hasPlaceholder && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Placeholder</Label>
                <Input
                  value={question.placeholder || ''}
                  onChange={e => onChange({ placeholder: e.target.value })}
                  placeholder="Texto do placeholder..."
                  className="text-xs h-7"
                />
              </div>
            )}

            {/* Mask */}
            {hasMask && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Máscara</Label>
                <Select
                  value={question.mask?.type || 'none'}
                  onValueChange={v => onChange({ mask: { ...question.mask, type: v as InputMask['type'] } })}
                >
                  <SelectTrigger className="h-7 text-xs">
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
                    className="text-xs h-7 mt-1"
                  />
                )}
              </div>
            )}

            {/* Validation */}
            {hasValidation && (
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Validação</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[9px] text-muted-foreground/70">Mín. caracteres</Label>
                    <Input
                      type="number"
                      value={question.validation?.minLength ?? ''}
                      onChange={e => onChange({ validation: { ...question.validation, minLength: e.target.value ? Number(e.target.value) : undefined } })}
                      className="text-xs h-6"
                    />
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground/70">Máx. caracteres</Label>
                    <Input
                      type="number"
                      value={question.validation?.maxLength ?? ''}
                      onChange={e => onChange({ validation: { ...question.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } })}
                      className="text-xs h-6"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[9px] text-muted-foreground/70">Mensagem de erro</Label>
                  <Input
                    value={question.validation?.customError || ''}
                    onChange={e => onChange({ validation: { ...question.validation, customError: e.target.value } })}
                    placeholder="Ex: Campo inválido"
                    className="text-xs h-6"
                  />
                </div>
              </div>
            )}

            {/* Rating config */}
            {question.type === 'rating' && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Número de estrelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={question.maxRating || 5}
                  onChange={e => onChange({ maxRating: Number(e.target.value) })}
                  className="text-xs h-7 w-20"
                />
              </div>
            )}

            {/* NPS / Opinion Scale config */}
            {(question.type === 'nps' || question.type === 'opinion_scale') && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[9px] text-muted-foreground/70">Valor mín.</Label>
                    <Input type="number" value={question.scaleMin ?? 0} onChange={e => onChange({ scaleMin: Number(e.target.value) })} className="text-xs h-6" />
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground/70">Valor máx.</Label>
                    <Input type="number" value={question.scaleMax ?? 10} onChange={e => onChange({ scaleMax: Number(e.target.value) })} className="text-xs h-6" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[9px] text-muted-foreground/70">Label mín.</Label>
                    <Input value={question.labelMin || ''} onChange={e => onChange({ labelMin: e.target.value })} className="text-xs h-6" />
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground/70">Label máx.</Label>
                    <Input value={question.labelMax || ''} onChange={e => onChange({ labelMax: e.target.value })} className="text-xs h-6" />
                  </div>
                </div>
              </div>
            )}

            {/* File upload config */}
            {question.type === 'file_upload' && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Tamanho máx. (MB)</Label>
                <Input
                  type="number"
                  value={question.maxFileSize ?? 10}
                  onChange={e => onChange({ maxFileSize: Number(e.target.value) })}
                  className="text-xs h-7 w-20"
                />
              </div>
            )}
          </div>
        )}

        {/* Footer — Required toggle */}
        {!isStructural && (
          <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">Obrigatória</span>
            <Switch
              checked={question.required}
              onCheckedChange={v => onChange({ required: v })}
              className="scale-75 origin-right"
            />
          </div>
        )}
      </div>
      </div>
      {/* Inline add button */}
      <div className="absolute -right-4 top-1/2 translate-x-full -translate-y-1/2 z-10">
        <InlineAddMenu onAdd={onAddAfter} onAddCondition={onAddCondition} size="sm" />
      </div>
    </div>
  );
}

export default memo(QuestionNode);
