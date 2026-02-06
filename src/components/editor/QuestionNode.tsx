import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Question, QUESTION_TYPE_LABELS } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Type, AlignLeft, List, CircleDot, Star, Mail, Hash, Calendar } from 'lucide-react';
import { QuestionType } from '@/types/form';

const ICONS: Record<QuestionType, React.ReactNode> = {
  short_text: <Type className="h-3.5 w-3.5" />,
  long_text: <AlignLeft className="h-3.5 w-3.5" />,
  multiple_choice: <List className="h-3.5 w-3.5" />,
  single_choice: <CircleDot className="h-3.5 w-3.5" />,
  rating: <Star className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  number: <Hash className="h-3.5 w-3.5" />,
  date: <Calendar className="h-3.5 w-3.5" />,
};

interface QuestionNodeData {
  question: Question;
  index: number;
  onChange: (patch: Partial<Question>) => void;
  onDelete: () => void;
}

function QuestionNode({ data, selected }: NodeProps & { data: QuestionNodeData }) {
  const { question, index, onChange, onDelete } = data;

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
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm transition-all ${
        selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 rounded-t-xl">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {ICONS[question.type]}
          <span className="text-[11px] font-medium uppercase tracking-wide">
            {QUESTION_TYPE_LABELS[question.type]}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground/60 ml-auto mr-1">#{index + 1}</span>
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
      <div className="p-4 space-y-3">
        <Input
          value={question.title}
          onChange={e => onChange({ title: e.target.value })}
          placeholder="Título da pergunta"
          className="text-sm font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent"
        />

        <Input
          value={question.description || ''}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Descrição (opcional)"
          className="text-xs border-0 px-0 shadow-none focus-visible:ring-0 text-muted-foreground bg-transparent"
        />

        {/* Options for choice types */}
        {(question.type === 'multiple_choice' || question.type === 'single_choice') && (
          <div className="space-y-1.5">
            {(question.options || []).map(opt => (
              <div key={opt.id} className="flex items-center gap-1.5">
                <div className={`h-3 w-3 rounded-${question.type === 'single_choice' ? 'full' : 'sm'} border border-border flex-shrink-0`} />
                <Input
                  value={opt.label}
                  onChange={e => updateOption(opt.id, e.target.value)}
                  className="h-7 text-xs flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground"
                  onClick={() => removeOption(opt.id)}
                >
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

        {/* Rating preview */}
        {question.type === 'rating' && (
          <div className="flex gap-1">
            {Array.from({ length: question.maxRating || 5 }).map((_, i) => (
              <div key={i} className="h-6 w-6 rounded border border-border flex items-center justify-center text-[10px] text-muted-foreground">
                {i + 1}
              </div>
            ))}
          </div>
        )}

        {/* Text input preview */}
        {(question.type === 'short_text' || question.type === 'email' || question.type === 'number') && (
          <Input disabled placeholder="Resposta..." className="text-xs h-7" />
        )}

        {question.type === 'long_text' && (
          <Textarea disabled placeholder="Resposta..." className="text-xs" rows={2} />
        )}

        {question.type === 'date' && (
          <Input disabled type="date" className="text-xs h-7 w-36" />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">Obrigatória</span>
          <Switch
            checked={question.required}
            onCheckedChange={v => onChange({ required: v })}
            className="scale-75 origin-right"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(QuestionNode);
