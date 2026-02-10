import { PageElement } from '@/types/pageElements';
import { Button } from '@/components/ui/button';
import { ImageIcon, VideoIcon } from 'lucide-react';

interface Props {
  element: PageElement;
}

export default function ElementPreview({ element }: Props) {
  const { type, style } = element;
  const align = style?.textAlign || 'left';

  switch (type) {
    case 'heading': {
      const Tag = `h${element.level || 2}` as keyof JSX.IntrinsicElements;
      const sizeMap: Record<number, string> = { 1: 'text-4xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return (
        <div className={`p-3 text-${align}`}>
          <Tag className={`${sizeMap[element.level || 2]} font-bold text-foreground`}>
            {element.content || 'Título'}
          </Tag>
        </div>
      );
    }

    case 'text':
      return (
        <div className={`p-3 text-${align}`}>
          <p className="text-base text-foreground/80 whitespace-pre-wrap leading-relaxed">
            {element.content || 'Texto aqui...'}
          </p>
        </div>
      );

    case 'image':
      return element.src ? (
        <div className={`p-3 text-${align}`}>
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
        <div className={`p-3 text-${align}`}>
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
            <iframe
              src={element.src}
              className="w-full h-full"
              allowFullScreen
              title="Video"
            />
          </div>
        </div>
      ) : (
        <div className="p-6 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-2 text-muted-foreground">
          <VideoIcon className="h-8 w-8" />
          <span className="text-sm">Cole a URL do vídeo (YouTube, Vimeo)</span>
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

    case 'form_field':
      return (
        <div className="p-4 bg-muted/30 rounded-lg border border-dashed border-border">
          <span className="text-sm text-muted-foreground">📝 Campo de formulário</span>
        </div>
      );

    default:
      return <div className="p-3 text-muted-foreground text-sm">Elemento desconhecido</div>;
  }
}
