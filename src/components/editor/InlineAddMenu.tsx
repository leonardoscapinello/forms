import { Question, QuestionType, QUESTION_CATEGORIES, createDefaultQuestion } from '@/types/form';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import { Button } from '@/components/ui/button';
import { Plus, GitBranch } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { QUESTION_TYPE_LABELS } from '@/types/form';

const CATEGORY_ORDER = ['contact_info', 'text', 'choice', 'rating_ranking', 'other'] as const;

const CATEGORY_STYLES: Record<string, { accent: string; iconBg: string }> = {
  contact_info: { accent: 'text-node-contact-accent', iconBg: 'bg-node-contact-accent/15' },
  text: { accent: 'text-node-text-accent', iconBg: 'bg-node-text-accent/15' },
  choice: { accent: 'text-node-choice-accent', iconBg: 'bg-node-choice-accent/15' },
  rating_ranking: { accent: 'text-node-rating-accent', iconBg: 'bg-node-rating-accent/15' },
  other: { accent: 'text-node-other-accent', iconBg: 'bg-node-other-accent/15' },
};

interface Props {
  onAdd: (question: Question) => void;
  onAddCondition: () => void;
  size?: 'sm' | 'md';
}

export default function InlineAddMenu({ onAdd, onAddCondition, size = 'sm' }: Props) {
  const btnSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`${btnSize} rounded-full border-dashed border-2 border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all`}
          onClick={e => e.stopPropagation()}
        >
          <Plus className={iconSize} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-72 max-h-[28rem] overflow-y-auto bg-popover z-[100] p-2">
        {/* Condition */}
        <button
          className="flex items-center gap-3 w-full px-2 py-2 text-sm hover:bg-accent rounded-lg text-left transition-colors"
          onClick={onAddCondition}
        >
          <div className="h-8 w-8 rounded-lg bg-node-condition flex items-center justify-center flex-shrink-0">
            <GitBranch className="h-4 w-4 text-node-condition-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">Condicional</span>
            <p className="text-[10px] text-muted-foreground">Ramificar o fluxo</p>
          </div>
        </button>
        <DropdownMenuSeparator className="my-1.5" />

        {CATEGORY_ORDER.map((catKey, catIdx) => {
          const cat = QUESTION_CATEGORIES[catKey];
          const style = CATEGORY_STYLES[catKey];
          return (
            <div key={catKey}>
              {catIdx > 0 && <DropdownMenuSeparator className="my-1.5" />}
              <div className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${style.accent}`}>
                {cat.label}
              </div>
              {cat.types.map(type => {
                const Icon = QUESTION_TYPE_ICONS[type];
                return (
                  <button
                    key={type}
                    className="flex items-center gap-3 w-full px-2 py-1.5 text-sm hover:bg-accent rounded-lg text-left transition-colors group"
                    onClick={() => onAdd(createDefaultQuestion(type))}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
