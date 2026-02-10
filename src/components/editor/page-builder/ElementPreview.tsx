import { PageElement } from '@/types/pageElements';
import { Button } from '@/components/ui/button';
import { ImageIcon, VideoIcon, Star, CheckSquare, Circle } from 'lucide-react';

interface Props {
  element: PageElement;
}

export default function ElementPreview({ element }: Props) {
  const { type, style } = element;
  const alignClass = style?.textAlign === 'center' ? 'text-center' : style?.textAlign === 'right' ? 'text-right' : 'text-left';

  switch (type) {
    case 'heading': {
      const sizeMap: Record<number, string> = { 1: 'text-4xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return (
        <div className={`p-3 ${alignClass}`}>
          <div className={`${sizeMap[element.level || 2]} font-bold text-foreground`}>
            {element.content || 'Título'}
          </div>
        </div>
      );
    }

    case 'text':
      return (
        <div className={`p-3 ${alignClass}`}>
          <p className="text-base text-foreground/80 whitespace-pre-wrap leading-relaxed">
            {element.content || 'Texto aqui...'}
          </p>
        </div>
      );

    case 'image':
      return element.src ? (
        <div className={`p-3 ${alignClass}`}>
          <img
            src={element.src}
            alt={element.alt || ''}
            className="max-w-full rounded-lg mx-auto"
            style={{ maxHeight: 300, borderRadius: style?.borderRadius }}
          />
        </div>
      ) : (
        <div className="p-6 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm">Clique para adicionar uma imagem</span>
        </div>
      );

    case 'button':
      return (
        <div className={`p-3 ${alignClass}`}>
          <Button
            className="pointer-events-none"
            style={{
              backgroundColor: style?.backgroundColor,
              borderRadius: style?.borderRadius,
            }}
          >
            {element.content || 'Botão'}
          </Button>
        </div>
      );

    case 'divider':
      return (
        <div className="py-3">
          <hr className="border-border" style={{ borderWidth: element.height || 1 }} />
        </div>
      );

    case 'video':
      return element.src ? (
        <div className="p-3">
          <div className="aspect-video rounded-lg overflow-hidden bg-muted">
            <iframe src={element.src} className="w-full h-full" allowFullScreen title="Video" />
          </div>
        </div>
      ) : (
        <div className="p-6 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-2 text-muted-foreground">
          <VideoIcon className="h-8 w-8" />
          <span className="text-sm">Cole a URL do vídeo</span>
        </div>
      );

    case 'spacer':
      return (
        <div
          className="flex items-center justify-center text-muted-foreground/30 select-none"
          style={{ height: element.height || 40 }}
        >
          <span className="text-xs border border-dashed border-border px-2 py-0.5 rounded">
            {element.height || 40}px
          </span>
        </div>
      );

    // ─── Form Fields ──────────────────────────────
    case 'input_text':
    case 'input_email':
    case 'input_phone':
    case 'input_address':
      return (
        <div className="p-3 space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-1">
            {element.label || 'Campo'}
            {element.required && <span className="text-destructive">*</span>}
          </label>
          <div className="w-full h-10 rounded-md border border-border bg-background px-3 flex items-center">
            <span className="text-sm text-muted-foreground/50">{element.placeholder || ''}</span>
          </div>
        </div>
      );

    case 'input_checkbox':
      return (
        <div className="p-3">
          <label className="flex items-center gap-2.5 cursor-default">
            <div className="h-4 w-4 rounded border border-border bg-background flex items-center justify-center">
              <CheckSquare className="h-3 w-3 text-transparent" />
            </div>
            <span className="text-sm text-foreground">
              {element.label || 'Checkbox'}
              {element.required && <span className="text-destructive ml-1">*</span>}
            </span>
          </label>
        </div>
      );

    case 'input_select':
      return (
        <div className="p-3 space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-1">
            {element.label || 'Seleção'}
            {element.required && <span className="text-destructive">*</span>}
          </label>
          <div className="w-full h-10 rounded-md border border-border bg-background px-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground/50">{element.placeholder || 'Escolha...'}</span>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {element.options && element.options.length > 0 && (
            <div className="text-xs text-muted-foreground pl-1">
              {element.options.map(o => o.label).join(' · ')}
            </div>
          )}
        </div>
      );

    case 'input_radio':
      return (
        <div className="p-3 space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-1">
            {element.label || 'Radio'}
            {element.required && <span className="text-destructive">*</span>}
          </label>
          <div className="space-y-2 pt-1">
            {(element.options || []).map((opt, i) => (
              <label key={opt.id} className="flex items-center gap-2.5 cursor-default">
                <div className="h-4 w-4 rounded-full border-2 border-border bg-background flex items-center justify-center">
                  {i === 0 && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <span className="text-sm text-foreground">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      );

    case 'input_rating':
      return (
        <div className="p-3 space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-1">
            {element.label || 'Avaliação'}
            {element.required && <span className="text-destructive">*</span>}
          </label>
          <div className="flex gap-1 pt-1">
            {Array.from({ length: element.maxRating || 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-6 w-6 ${i < 3 ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
              />
            ))}
          </div>
        </div>
      );

    default:
      return <div className="p-3 text-muted-foreground text-sm">Elemento desconhecido</div>;
  }
}
