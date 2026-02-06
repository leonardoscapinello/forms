import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { QuestionType, QUESTION_TYPE_LABELS, createDefaultQuestion, Question } from '@/types/form';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Type, AlignLeft, List, CircleDot, Star, Mail, Hash, Calendar } from 'lucide-react';

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

interface AddNodeData {
  onAdd: (question: Question) => void;
}

function AddNode({ data }: NodeProps & { data: AddNodeData }) {
  return (
    <div className="flex items-center justify-center">
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-border !border-2 !border-card" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full border-dashed border-2 border-border text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {TYPES.map(type => (
            <DropdownMenuItem key={type} onClick={() => data.onAdd(createDefaultQuestion(type))}>
              {ICONS[type]}
              <span className="ml-2">{QUESTION_TYPE_LABELS[type]}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-border !border-2 !border-card" />
    </div>
  );
}

export default memo(AddNode);
