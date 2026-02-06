import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Question, QUESTION_TYPE_LABELS } from '@/types/form';
import { getNodeCategoryStyle } from './nodeCategoryStyles';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import { GitBranch } from 'lucide-react';

interface QuestionNodeData {
  question: Question;
  index: number;
  onChange: (patch: Partial<Question>) => void;
  onDelete: () => void;
  onSelect: () => void;
}

function QuestionNode({ data, selected }: NodeProps & { data: QuestionNodeData }) {
  const { question, index, onSelect } = data;

  const Icon = QUESTION_TYPE_ICONS[question.type];
  const catStyle = getNodeCategoryStyle(question.type);

  return (
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm transition-all cursor-pointer hover:shadow-md ${
        selected ? 'border-primary shadow-md ring-2 ring-primary/10' : catStyle.border
      }`}
      onDoubleClick={onSelect}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b rounded-t-xl ${catStyle.bg} ${catStyle.border}`}>
        <div className={`flex items-center gap-1.5 ${catStyle.accent}`}>
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wide">
            {QUESTION_TYPE_LABELS[question.type]}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground/60 ml-auto">#{index + 1}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Title */}
        <p className="text-sm font-medium text-foreground truncate">
          {question.title || 'Sem título'}
        </p>
        {question.description && (
          <p className="text-[11px] text-muted-foreground truncate">
            {question.description}
          </p>
        )}

        {/* Summary preview per type */}
        <NodeSummary question={question} />

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {question.required && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
              Obrigatória
            </span>
          )}
          {question.routingMode === 'per_option' && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <GitBranch className="h-2 w-2" />
              Roteamento
            </span>
          )}
          {question.mask?.type && question.mask.type !== 'none' && (
            <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {question.mask.type.toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact visual summary of the field content */
function NodeSummary({ question }: { question: Question }) {
  const q = question;

  // Choice types: show options list
  if (['multiple_choice', 'single_choice', 'dropdown', 'ranking'].includes(q.type) && q.options?.length) {
    return (
      <div className="space-y-0.5">
        {q.options.slice(0, 4).map((opt, i) => (
          <div key={opt.id} className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 flex-shrink-0 border border-border ${
              q.type === 'single_choice' ? 'rounded-full' : 'rounded-[2px]'
            }`} />
            <span className="text-[10px] text-muted-foreground truncate">{opt.label}</span>
          </div>
        ))}
        {q.options.length > 4 && (
          <span className="text-[9px] text-muted-foreground/50">+{q.options.length - 4} mais</span>
        )}
      </div>
    );
  }

  // Yes/No
  if (q.type === 'yes_no') {
    return (
      <div className="flex gap-1.5">
        <div className="flex-1 text-center py-1 rounded border border-border text-[10px] text-muted-foreground">Sim</div>
        <div className="flex-1 text-center py-1 rounded border border-border text-[10px] text-muted-foreground">Não</div>
      </div>
    );
  }

  // Rating
  if (q.type === 'rating') {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: Math.min(q.maxRating || 5, 10) }).map((_, i) => (
          <div key={i} className="h-4 w-4 rounded border border-border flex items-center justify-center text-[8px] text-muted-foreground">
            ★
          </div>
        ))}
      </div>
    );
  }

  // NPS / Opinion Scale
  if (q.type === 'nps' || q.type === 'opinion_scale') {
    const min = q.scaleMin ?? 0;
    const max = q.scaleMax ?? 10;
    const count = Math.min(max - min + 1, 11);
    return (
      <div className="space-y-0.5">
        <div className="flex gap-px">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex-1 h-4 rounded-[2px] border border-border flex items-center justify-center text-[7px] text-muted-foreground">
              {min + i}
            </div>
          ))}
        </div>
        {(q.labelMin || q.labelMax) && (
          <div className="flex justify-between">
            <span className="text-[8px] text-muted-foreground/50">{q.labelMin}</span>
            <span className="text-[8px] text-muted-foreground/50">{q.labelMax}</span>
          </div>
        )}
      </div>
    );
  }

  // Text inputs
  if (['short_text', 'email', 'number', 'phone', 'website', 'address'].includes(q.type)) {
    return (
      <div className="rounded border border-dashed border-border px-2 py-1">
        <span className="text-[10px] text-muted-foreground/40">{q.placeholder || 'Resposta...'}</span>
      </div>
    );
  }

  if (q.type === 'long_text') {
    return (
      <div className="rounded border border-dashed border-border px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground/40">{q.placeholder || 'Resposta longa...'}</span>
      </div>
    );
  }

  // Date
  if (q.type === 'date') {
    return (
      <div className="rounded border border-dashed border-border px-2 py-1">
        <span className="text-[10px] text-muted-foreground/40">DD/MM/AAAA</span>
      </div>
    );
  }

  // Contact info
  if (q.type === 'contact_info') {
    return (
      <div className="space-y-0.5">
        {['Nome', 'Email', 'Telefone'].map(f => (
          <div key={f} className="rounded border border-dashed border-border px-2 py-0.5">
            <span className="text-[9px] text-muted-foreground/40">{f}</span>
          </div>
        ))}
      </div>
    );
  }

  // File upload
  if (q.type === 'file_upload') {
    return (
      <div className="rounded border border-dashed border-border px-2 py-2 text-center">
        <span className="text-[9px] text-muted-foreground/50">📎 Upload de arquivo</span>
      </div>
    );
  }

  // Legal / Checkbox
  if (q.type === 'legal' || q.type === 'checkbox') {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-[2px] border border-border" />
        <span className="text-[10px] text-muted-foreground/50">
          {q.type === 'legal' ? 'Aceitar termos' : 'Marcar opção'}
        </span>
      </div>
    );
  }

  // Structural: welcome, end, statement, redirect
  if (q.type === 'welcome_screen' || q.type === 'end_screen' || q.type === 'statement') {
    return q.buttonText ? (
      <div className="rounded bg-primary/10 px-2 py-1 text-center">
        <span className="text-[10px] text-primary font-medium">{q.buttonText}</span>
      </div>
    ) : null;
  }

  if (q.type === 'redirect_url' && q.redirectUrl) {
    return (
      <div className="rounded bg-muted px-2 py-1 truncate">
        <span className="text-[9px] text-muted-foreground">{q.redirectUrl}</span>
      </div>
    );
  }

  return null;
}

export default memo(QuestionNode);
