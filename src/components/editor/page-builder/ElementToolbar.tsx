import { PageElementType, PAGE_ELEMENT_LABELS, createDefaultPageElement, PageElement } from '@/types/pageElements';
import { Heading, Type, Image, MousePointerClick, Minus, Video, ArrowUpDown, FormInput } from 'lucide-react';

const ELEMENT_ICONS: Record<PageElementType, React.ElementType> = {
  heading: Heading,
  text: Type,
  image: Image,
  button: MousePointerClick,
  divider: Minus,
  video: Video,
  spacer: ArrowUpDown,
  form_field: FormInput,
};

const ELEMENT_TYPES: PageElementType[] = [
  'heading', 'text', 'image', 'button', 'divider', 'video', 'spacer',
];

interface Props {
  onAdd: (element: PageElement) => void;
}

export default function ElementToolbar({ onAdd }: Props) {
  return (
    <div className="w-56 border-r border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Elementos</h3>
      </div>
      <div className="p-3 flex flex-col gap-1 overflow-auto flex-1">
        {ELEMENT_TYPES.map(type => {
          const Icon = ELEMENT_ICONS[type];
          return (
            <button
              key={type}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left group"
              onClick={() => onAdd(createDefaultPageElement(type))}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('element-type', type);
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <Icon className="h-4 w-4" />
              </div>
              <span className="font-medium">{PAGE_ELEMENT_LABELS[type]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
