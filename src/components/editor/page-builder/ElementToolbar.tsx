import { PageElementType, PAGE_ELEMENT_LABELS, createDefaultPageElement, PageElement } from '@/types/pageElements';
import { Heading, Type, Image, MousePointerClick, Minus, Video, ArrowUpDown, FormInput } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-wrap gap-1.5 p-3 bg-card border border-border rounded-xl">
      {ELEMENT_TYPES.map(type => {
        const Icon = ELEMENT_ICONS[type];
        return (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            className="flex flex-col items-center gap-1 h-auto py-2 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => onAdd(createDefaultPageElement(type))}
          >
            <Icon className="h-4 w-4" />
            <span>{PAGE_ELEMENT_LABELS[type]}</span>
          </Button>
        );
      })}
    </div>
  );
}
