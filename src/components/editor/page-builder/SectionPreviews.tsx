import { PageElement } from '@/types/pageElements';
import { Star, ImageIcon, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import Twemoji from '@/components/Twemoji';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

/** Arguments (Ícone + título + texto) */
export function ArgumentsPreview({ element }: { element: PageElement }) {
  const items = element.argumentItems || [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {items.map(item => (
        <div key={item.id} className="p-4 rounded-xl border border-border bg-card space-y-2 text-center">
          <Twemoji className="text-3xl">{item.emoji}</Twemoji>
          <h4 className="font-semibold text-foreground">{item.title}</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

/** Testimonials (Google-style) */
export function TestimonialsPreview({ element }: { element: PageElement }) {
  const items = element.testimonialItems || [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map(item => (
        <div key={item.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-3">
            {item.photoUrl ? (
              <img src={item.photoUrl} alt={item.name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {getInitials(item.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
              {item.socialProfile && (
                <p className="text-xs text-muted-foreground truncate">{item.socialProfile}</p>
              )}
            </div>
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < item.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/20'}`} />
            ))}
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

/** FAQ (Accordion) */
export function FAQPreview({ element }: { element: PageElement }) {
  const items = element.faqItems || [];
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="rounded-xl border border-border overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpenId(openId === item.id ? null : item.id); }}
          >
            {item.question}
            {openId === item.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {openId === item.id && (
            <div className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed">
              {item.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Pricing */
export function PricingPreview({ element }: { element: PageElement }) {
  const plans = element.pricingPlans || [];
  return (
    <div className={`grid gap-4 ${plans.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : plans.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {plans.map(plan => (
        <div
          key={plan.id}
          className={`rounded-xl border-2 p-5 space-y-4 ${
            plan.highlighted ? 'border-primary bg-primary/5' : 'border-border bg-card'
          }`}
        >
          <div>
            <h4 className="font-semibold text-foreground">{plan.name}</h4>
            {plan.description && <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground">{plan.price}</span>
            {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
          </div>
          <ul className="space-y-2">
            {plan.features.map(f => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                {f.included ? (
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                )}
                <span className={f.included ? 'text-foreground' : 'text-muted-foreground/50 line-through'}>{f.text}</span>
              </li>
            ))}
          </ul>
          <Button
            className="w-full pointer-events-none"
            variant={plan.highlighted ? 'default' : 'outline'}
            size="sm"
          >
            {plan.ctaLabel}
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Before / After */
export function BeforeAfterPreview({ element }: { element: PageElement }) {
  const mode = element.beforeAfterMode || 'slider';
  const hasBefore = !!element.beforeImage;
  const hasAfter = !!element.afterImage;

  if (mode === 'side_by_side') {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">Antes</span>
          {hasBefore ? (
            <img src={element.beforeImage} alt="Antes" className="w-full rounded-lg object-cover" style={{ maxHeight: 250 }} />
          ) : (
            <div className="h-40 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">Depois</span>
          {hasAfter ? (
            <img src={element.afterImage} alt="Depois" className="w-full rounded-lg object-cover" style={{ maxHeight: 250 }} />
          ) : (
            <div className="h-40 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Slider mode preview (static in editor)
  return (
    <div className="relative rounded-lg overflow-hidden border border-border" style={{ maxHeight: 300 }}>
      {hasBefore && hasAfter ? (
        <div className="relative w-full" style={{ height: 250 }}>
          <img src={element.afterImage} alt="Depois" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 w-1/2 overflow-hidden">
            <img src={element.beforeImage} alt="Antes" className="w-full h-full object-cover" style={{ width: '200%' }} />
          </div>
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white shadow-lg" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-xs font-bold text-muted-foreground">
            ⟷
          </div>
          <span className="absolute left-3 bottom-3 text-xs font-medium text-white bg-black/50 px-2 py-0.5 rounded">Antes</span>
          <span className="absolute right-3 bottom-3 text-xs font-medium text-white bg-black/50 px-2 py-0.5 rounded">Depois</span>
        </div>
      ) : (
        <div className="h-40 flex items-center justify-center text-muted-foreground gap-3">
          <ImageIcon className="h-6 w-6" />
          <span className="text-sm">Adicione as imagens de antes e depois</span>
        </div>
      )}
    </div>
  );
}

/** Carousel */
export function CarouselPreview({ element }: { element: PageElement }) {
  const images = element.carouselImages || [];
  if (images.length === 0) {
    return (
      <div className="p-6 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-2 text-muted-foreground">
        <ImageIcon className="h-8 w-8" />
        <span className="text-sm">Adicione imagens ao carrossel</span>
      </div>
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2">
      {images.map(img => (
        <div key={img.id} className="flex-shrink-0 w-48 rounded-lg overflow-hidden border border-border">
          <img src={img.src} alt={img.alt || ''} className="w-full h-32 object-cover" />
        </div>
      ))}
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
