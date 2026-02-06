import { Question, QUESTION_TYPE_LABELS } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface Props {
  question: Question;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Question>) => void;
  onDelete: () => void;
  dragHandleProps?: Record<string, any>;
}

export default function QuestionCard({
  question,
  index,
  isActive,
  onSelect,
  onChange,
  onDelete,
  dragHandleProps,
}: Props) {
  const addOption = () => {
    const options = [...(question.options || [])];
    options.push({ id: crypto.randomUUID(), label: `Opção ${options.length + 1}` });
    onChange({ options });
  };

  const updateOption = (optionId: string, label: string) => {
    const options = (question.options || []).map(o =>
      o.id === optionId ? { ...o, label } : o
    );
    onChange({ options });
  };

  const removeOption = (optionId: string) => {
    onChange({ options: (question.options || []).filter(o => o.id !== optionId) });
  };

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border bg-card p-4 transition-all cursor-pointer ${
        isActive ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div {...dragHandleProps} className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {index + 1}. {QUESTION_TYPE_LABELS[question.type]}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Obrigatória</Label>
            <Switch
              checked={question.required}
              onCheckedChange={v => onChange({ required: v })}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Input
        value={question.title}
        onChange={e => onChange({ title: e.target.value })}
        placeholder="Título da pergunta"
        className="mb-2 font-medium border-0 px-0 text-base shadow-none focus-visible:ring-0"
        onClick={e => e.stopPropagation()}
      />

      <Input
        value={question.description || ''}
        onChange={e => onChange({ description: e.target.value })}
        placeholder="Descrição (opcional)"
        className="mb-3 text-sm border-0 px-0 shadow-none focus-visible:ring-0 text-muted-foreground"
        onClick={e => e.stopPropagation()}
      />

      {(question.type === 'multiple_choice' || question.type === 'single_choice') && (
        <div className="space-y-2 ml-6">
          {(question.options || []).map(opt => (
            <div key={opt.id} className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded-${question.type === 'single_choice' ? 'full' : 'sm'} border border-border`} />
              <Input
                value={opt.label}
                onChange={e => updateOption(opt.id, e.target.value)}
                className="h-8 text-sm flex-1"
                onClick={e => e.stopPropagation()}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={e => {
                  e.stopPropagation();
                  removeOption(opt.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={e => {
              e.stopPropagation();
              addOption();
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            Adicionar opção
          </Button>
        </div>
      )}

      {question.type === 'rating' && (
        <div className="flex gap-1 ml-6">
          {Array.from({ length: question.maxRating || 5 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-8 rounded-md border border-border flex items-center justify-center text-xs text-muted-foreground"
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}

      {(question.type === 'short_text' || question.type === 'email' || question.type === 'number') && (
        <div className="ml-6">
          <Input disabled placeholder={question.placeholder || 'Resposta do usuário...'} className="text-sm" />
        </div>
      )}

      {question.type === 'long_text' && (
        <div className="ml-6">
          <Textarea disabled placeholder={question.placeholder || 'Resposta do usuário...'} className="text-sm" rows={3} />
        </div>
      )}

      {question.type === 'date' && (
        <div className="ml-6">
          <Input disabled type="date" className="text-sm w-48" />
        </div>
      )}
    </div>
  );
}
