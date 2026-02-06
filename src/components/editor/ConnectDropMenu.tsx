import { Question, QuestionType, QUESTION_CATEGORIES, createDefaultQuestion, QUESTION_TYPE_LABELS } from '@/types/form';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import { GitBranch } from 'lucide-react';

const CATEGORY_ORDER = ['contact_info', 'text', 'choice', 'rating_ranking', 'other'] as const;

interface Props {
  position: { x: number; y: number };
  onAdd: (question: Question) => void;
  onAddCondition: () => void;
  onClose: () => void;
}

export default function ConnectDropMenu({ position, onAdd, onAddCondition, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 w-64 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
        style={{ left: position.x, top: position.y }}
      >
        {/* Condition */}
        <button
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
          onClick={() => { onAddCondition(); onClose(); }}
        >
          <GitBranch className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="font-medium">Condicional</span>
        </button>
        <div className="h-px bg-border my-1" />

        {CATEGORY_ORDER.map((catKey, catIdx) => {
          const cat = QUESTION_CATEGORIES[catKey];
          return (
            <div key={catKey}>
              {catIdx > 0 && <div className="h-px bg-border my-1" />}
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </div>
              {cat.types.map(type => {
                const Icon = QUESTION_TYPE_ICONS[type];
                return (
                  <button
                    key={type}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left"
                    onClick={() => { onAdd(createDefaultQuestion(type)); onClose(); }}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{QUESTION_TYPE_LABELS[type]}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
