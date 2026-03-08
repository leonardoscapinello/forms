import { useState } from 'react';
import { CardItem, CardActionType } from '@/types/pageElements';
import { ChevronDown, X, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  items: CardItem[];
  columns?: 1 | 2 | 3;
  imageHeight?: number;
  /** Interactive mode — enable click actions */
  interactive?: boolean;
  onNavigate?: (action: 'specific', targetPageId?: string) => void;
}

export default function CardPreview({
  items,
  columns = 3,
  imageHeight = 200,
  interactive = false,
  onNavigate,
}: Props) {
  const [modalItem, setModalItem] = useState<CardItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleAction = (item: CardItem) => {
    if (!interactive) return;

    switch (item.actionType) {
      case 'go_to_page':
        if (item.actionTargetPageId && onNavigate) {
          onNavigate('specific', item.actionTargetPageId);
        }
        break;
      case 'open_modal':
        setModalItem(item);
        break;
      case 'copy_text':
        if (item.actionCopyText) {
          navigator.clipboard.writeText(item.actionCopyText).then(() => {
            setCopiedId(item.id);
            toast.success('Copiado!');
            setTimeout(() => setCopiedId(null), 2000);
          });
        }
        break;
    }
  };

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Nenhum card adicionado
      </div>
    );
  }

  const gridCols = columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <>
      <div className={`grid ${gridCols} gap-4`}>
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleAction(item)}
            className="group text-left rounded-2xl bg-card border border-border/60 overflow-hidden transition-all hover:shadow-lg hover:border-border hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {/* Image */}
            {item.imageUrl && (
              <div
                className="w-full overflow-hidden bg-muted"
                style={{ height: imageHeight }}
              >
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            )}

            {/* Content */}
            <div className="p-4 space-y-2">
              {/* Badges */}
              {item.badges && item.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.badges.map((badge, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}

              {/* Title */}
              <h3 className="text-sm font-semibold text-foreground leading-snug">
                {item.title}
              </h3>

              {/* Description */}
              {item.description && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {item.description}
                </p>
              )}

              {/* Action indicator */}
              <div className="flex items-center justify-end pt-1">
                {item.actionType === 'copy_text' ? (
                  copiedId === item.id
                    ? <Check className="h-4 w-4 text-green-500" />
                    : <Copy className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Modal */}
      {modalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setModalItem(null)}
        >
          <div
            className="relative bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setModalItem(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors z-10"
            >
              <X className="h-4 w-4" />
            </button>

            {modalItem.imageUrl && (
              <img
                src={modalItem.imageUrl}
                alt={modalItem.title}
                className="w-full h-48 object-cover rounded-t-2xl"
              />
            )}

            <div className="p-6 space-y-3">
              <h2 className="text-lg font-bold text-foreground">{modalItem.title}</h2>
              {modalItem.description && (
                <p className="text-sm text-muted-foreground">{modalItem.description}</p>
              )}
              {modalItem.actionModalContent && (
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed pt-2">
                  {modalItem.actionModalContent}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
