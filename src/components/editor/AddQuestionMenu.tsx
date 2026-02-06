import { QuestionType, QUESTION_TYPE_LABELS, createDefaultQuestion } from '@/types/form';
import { Question } from '@/types/form';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Type, AlignLeft, List, CircleDot, Star, Mail, Hash, Calendar } from 'lucide-react';

const ICONS: Record<QuestionType, React.ReactNode> = {
  short_text: <Type className="h-4 w-4" />,
  long_text: <AlignLeft className="h-4 w-4" />,
  multiple_choice: <List className="h-4 w-4" />,
  single_choice: <CircleDot className="h-4 w-4" />,
  rating: <Star className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
};

const TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

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
      <DropdownMenuContent align="center" className="w-56">
        {TYPES.map(type => (
          <DropdownMenuItem key={type} onClick={() => onAdd(createDefaultQuestion(type))}>
            {ICONS[type]}
            <span className="ml-2">{QUESTION_TYPE_LABELS[type]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
