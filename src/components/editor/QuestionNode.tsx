import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Question, QUESTION_TYPE_LABELS } from '@/types/form';
import { getNodeCategoryStyle } from './nodeCategoryStyles';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';

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
      className={`w-64 rounded-xl border bg-card shadow-sm transition-all cursor-pointer hover:shadow-md ${
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

      {/* Body — compact */}
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-foreground truncate">
          {question.title || 'Sem título'}
        </p>
        {question.description && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {question.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {question.required && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
              Obrigatória
            </span>
          )}
          {question.options && question.options.length > 0 && (
            <span className="text-[9px] text-muted-foreground">
              {question.options.length} opções
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(QuestionNode);
