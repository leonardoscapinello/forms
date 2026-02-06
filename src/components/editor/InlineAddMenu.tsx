import { Question, QuestionType, QUESTION_CATEGORIES, createDefaultQuestion } from '@/types/form';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import { Button } from '@/components/ui/button';
import { Plus, GitBranch } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { QUESTION_TYPE_LABELS } from '@/types/form';

const CATEGORY_ORDER = ['contact_info', 'text', 'choice', 'rating_ranking', 'other'] as const;

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
      <DropdownMenuContent align="start" side="bottom" className="w-64 max-h-96 overflow-y-auto bg-popover z-[100]">
        <DropdownMenuItem onClick={onAddCondition}>
          <GitBranch className="h-4 w-4 mr-2 flex-shrink-0 text-primary" />
          <span className="font-medium">Condicional</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {CATEGORY_ORDER.map((catKey, catIdx) => {
          const cat = QUESTION_CATEGORIES[catKey];
          return (
            <div key={catKey}>
              {catIdx > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </DropdownMenuLabel>
              {cat.types.map(type => {
                const Icon = QUESTION_TYPE_ICONS[type];
                return (
                  <DropdownMenuItem key={type} onClick={() => onAdd(createDefaultQuestion(type))}>
                    <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{QUESTION_TYPE_LABELS[type]}</span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
