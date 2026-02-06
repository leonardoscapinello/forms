import { QuestionType, QUESTION_TYPE_LABELS, createDefaultQuestion } from '@/types/form';
import { Question, QUESTION_CATEGORIES } from '@/types/form';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Plus } from 'lucide-react';

const CATEGORY_ORDER = ['contact_info', 'text', 'choice', 'rating_ranking', 'other'] as const;

interface Props {
  onAdd: (question: Question) => void;
}

export default function AddQuestionMenu({ onAdd }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full border-dashed">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar pergunta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-64 max-h-96 overflow-y-auto bg-popover z-50">
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
                    <Icon className="h-4 w-4 mr-2" />
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
