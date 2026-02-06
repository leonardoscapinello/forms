import { Question, QuestionType, QUESTION_CATEGORIES, createDefaultQuestion, QUESTION_TYPE_LABELS } from '@/types/form';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import { GitBranch } from 'lucide-react';

const CATEGORY_ORDER = ['contact_info', 'text', 'choice', 'rating_ranking', 'other'] as const;

const CATEGORY_STYLES: Record<string, { bg: string; accent: string; iconBg: string }> = {
  contact_info: { bg: 'bg-node-contact', accent: 'text-node-contact-accent', iconBg: 'bg-node-contact-accent/15' },
  text: { bg: 'bg-node-text', accent: 'text-node-text-accent', iconBg: 'bg-node-text-accent/15' },
  choice: { bg: 'bg-node-choice', accent: 'text-node-choice-accent', iconBg: 'bg-node-choice-accent/15' },
  rating_ranking: { bg: 'bg-node-rating', accent: 'text-node-rating-accent', iconBg: 'bg-node-rating-accent/15' },
  other: { bg: 'bg-node-other', accent: 'text-node-other-accent', iconBg: 'bg-node-other-accent/15' },
};

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
        className="fixed z-50 w-72 max-h-[28rem] overflow-y-auto rounded-xl border border-border bg-popover shadow-xl py-2"
        style={{ left: position.x, top: position.y }}
      >
        {/* Condition */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddCondition(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-node-condition flex items-center justify-center flex-shrink-0">
            <GitBranch className="h-4 w-4 text-node-condition-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">Condicional</span>
            <p className="text-[10px] text-muted-foreground">Ramificar o fluxo</p>
          </div>
        </button>
        <div className="h-px bg-border my-1.5 mx-3" />

        {CATEGORY_ORDER.map((catKey, catIdx) => {
          const cat = QUESTION_CATEGORIES[catKey];
          const style = CATEGORY_STYLES[catKey];
          return (
            <div key={catKey}>
              {catIdx > 0 && <div className="h-px bg-border my-1.5 mx-3" />}
              <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${style.accent}`}>
                {cat.label}
              </div>
              {cat.types.map(type => {
                const Icon = QUESTION_TYPE_ICONS[type];
                return (
                  <button
                    key={type}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent text-left transition-colors group"
                    onClick={() => { onAdd(createDefaultQuestion(type)); onClose(); }}
                  >
                    <div className={`h-7 w-7 rounded-lg ${style.iconBg} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110`}>
                      <Icon className={`h-3.5 w-3.5 ${style.accent}`} />
                    </div>
                    <span className="text-foreground">{QUESTION_TYPE_LABELS[type]}</span>
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
