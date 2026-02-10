import { PAGE_ELEMENT_LABELS, createDefaultPageElement, PageElement, ELEMENT_CATEGORIES, ElementCategory } from '@/types/pageElements';
import {
  Heading, Type, Image, MousePointerClick, Minus, Video, ArrowUpDown,
  Mail, Phone, MapPin, CheckSquare, ListFilter, CircleDot, Star, TextCursorInput,
  Hash, AlignLeft, Calendar, Ruler, Weight, ToggleLeft, ListChecks, Smile, ImagePlus,
  AlertTriangle, Bell, List, MessageSquareQuote, HelpCircle, CreditCard, Columns, GalleryHorizontal,
  LayoutGrid,
} from 'lucide-react';
import type { PageElementType } from '@/types/pageElements';

const ELEMENT_ICONS: Record<PageElementType, React.ElementType> = {
  heading: Heading,
  text: Type,
  image: Image,
  button: MousePointerClick,
  divider: Minus,
  video: Video,
  spacer: ArrowUpDown,
  alert: AlertTriangle,
  notification: Bell,
  columns: LayoutGrid,
  arguments: List,
  testimonials: MessageSquareQuote,
  faq: HelpCircle,
  pricing: CreditCard,
  before_after: Columns,
  carousel: GalleryHorizontal,
  input_text: TextCursorInput,
  input_email: Mail,
  input_phone: Phone,
  input_address: MapPin,
  input_checkbox: CheckSquare,
  input_select: ListFilter,
  input_radio: CircleDot,
  input_rating: Star,
  input_number: Hash,
  input_textarea: AlignLeft,
  input_date: Calendar,
  input_height: Ruler,
  input_weight: Weight,
  input_yes_no: ToggleLeft,
  input_multi_select: ListChecks,
  input_quiz_icon: Smile,
  input_quiz_image: ImagePlus,
};

interface Props {
  onAdd: (element: PageElement) => void;
}

export default function ElementToolbar({ onAdd }: Props) {
  return (
    <div className="w-56 border-r border-border bg-card flex flex-col h-full overflow-auto">
      {(Object.entries(ELEMENT_CATEGORIES) as [ElementCategory, typeof ELEMENT_CATEGORIES[ElementCategory]][]).map(
        ([catKey, cat]) => (
          <div key={catKey}>
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {cat.label}
              </h3>
            </div>
            <div className="px-2 pb-2 flex flex-col gap-0.5">
              {cat.types.map(type => {
                const Icon = ELEMENT_ICONS[type];
                return (
                  <button
                    key={type}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left group"
                    onClick={() => onAdd(createDefaultPageElement(type))}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('element-type', type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors flex-shrink-0">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[13px] font-medium">{PAGE_ELEMENT_LABELS[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
