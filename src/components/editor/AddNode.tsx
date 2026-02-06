import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { QUESTION_CATEGORIES, createDefaultQuestion, Question, QuestionType } from '@/types/form';
import { GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { QUESTION_TYPE_ICONS } from '@/components/editor/questionIcons';

interface AddNodeData {
  onAdd: (question: Question) => void;
  onAddCondition: () => void;
}

const CATEGORY_ORDER = ['contact_info', 'text', 'choice', 'rating_ranking', 'other'] as const;

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
        <DropdownMenuContent align="start" className="w-64 max-h-96 overflow-y-auto bg-popover z-50">
          {/* Condition node */}
          <DropdownMenuItem onClick={() => data.onAddCondition()}>
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
                  const labels: Record<QuestionType, string> = {
                    contact_info: 'Informações de Contato',
                    email: 'Email',
                    phone: 'Telefone',
                    address: 'Endereço',
                    website: 'Website',
                    short_text: 'Texto curto',
                    long_text: 'Texto longo',
                    multiple_choice: 'Múltipla escolha',
                    single_choice: 'Seleção única',
                    dropdown: 'Dropdown',
                    yes_no: 'Sim/Não',
                    legal: 'Termos legais',
                    checkbox: 'Checkbox',
                    nps: 'NPS',
                    opinion_scale: 'Escala de opinião',
                    rating: 'Avaliação',
                    ranking: 'Ranking',
                    number: 'Número',
                    date: 'Data',
                    file_upload: 'Upload de arquivo',
                    statement: 'Statement',
                    welcome_screen: 'Tela de boas-vindas',
                    end_screen: 'Tela final',
                    redirect_url: 'Redirecionar URL',
                  };
                  return (
                    <DropdownMenuItem key={type} onClick={() => data.onAdd(createDefaultQuestion(type))}>
                      <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>{labels[type]}</span>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-border !border-2 !border-card" />
    </div>
  );
}

export default memo(AddNode);
