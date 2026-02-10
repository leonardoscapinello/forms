import { PageElement } from '@/types/pageElements';
import { Button } from '@/components/ui/button';
import { ImageIcon, VideoIcon, Star, Check, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import HeightWeightField from '@/components/preview/HeightWeightField';
import Twemoji from '@/components/Twemoji';
import { Bell } from 'lucide-react';
import { ArgumentsPreview, TestimonialsPreview, FAQPreview, PricingPreview, BeforeAfterPreview, CarouselPreview } from './SectionPreviews';

interface Props {
  element: PageElement;
  stepNumber?: number;
}

/**
 * Renders a page element in the editor canvas with the SAME visual style
 * used in FormPreview, ensuring WYSIWYG parity.
 */
export default function ElementPreview({ element, stepNumber }: Props) {
  const { type, style } = element;
  const alignClass = style?.textAlign === 'center' ? 'text-center' : style?.textAlign === 'right' ? 'text-right' : 'text-left';

  const isFormField = type.startsWith('input_');

  /** Typeform-style "N → enunciado" header — mirrors FormPreview exactly */
  const withFieldHeader = (content: React.ReactNode) => (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl font-semibold text-primary mt-0.5">{stepNumber ?? '?'}</span>
        <span className="text-2xl font-semibold text-primary mt-0.5">→</span>
        <div>
          <h2 className="text-2xl font-semibold text-foreground leading-snug">
            {element.label || 'Sem título'}
            {element.required && <span className="text-destructive ml-1">*</span>}
          </h2>
          {element.description && (
            <p className="text-base text-muted-foreground mt-2">{element.description}</p>
          )}
        </div>
      </div>
      <div className="pl-14">
        {content}
      </div>
    </div>
  );

  switch (type) {
    case 'heading': {
      const sizeMap: Record<number, string> = { 1: 'text-4xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return (
        <div className={alignClass}>
          <div className={`${sizeMap[element.level || 2]} font-bold text-foreground`}>
            {element.content || 'Título'}
          </div>
        </div>
      );
    }

    case 'text':
      return (
        <div className={alignClass}>
          <p className="text-base text-foreground/80 whitespace-pre-wrap leading-relaxed">
            {element.content || ''}
          </p>
        </div>
      );

    case 'image':
      return element.src ? (
        <div className={alignClass}>
          <img src={element.src} alt={element.alt || ''} className="max-w-full rounded-lg mx-auto" style={{ maxHeight: 400 }} />
        </div>
      ) : (
        <div className="p-6 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm">Clique para adicionar uma imagem</span>
        </div>
      );

    case 'button':
      return (
        <div className={alignClass}>
          <Button className="pointer-events-none" style={{ backgroundColor: style?.backgroundColor, borderRadius: style?.borderRadius }}>
            {element.content || 'Botão'}
          </Button>
        </div>
      );

    case 'divider':
      return <hr className="border-border" style={{ borderWidth: element.height || 1 }} />;

    case 'video':
      return element.src ? (
        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
          <iframe src={element.src} className="w-full h-full" allowFullScreen title="Video" />
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

    case 'alert': {
      const v = element.alertVariant || 'info';
      const alertConfig = {
        info:    { icon: Info,          bg: 'bg-blue-50',   border: 'border-blue-200',  iconColor: 'text-blue-500',   textColor: 'text-blue-800' },
        success: { icon: CheckCircle2,  bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-500', textColor: 'text-emerald-800' },
        warning: { icon: AlertTriangle, bg: 'bg-amber-50',  border: 'border-amber-200', iconColor: 'text-amber-500',  textColor: 'text-amber-800' },
        error:   { icon: XCircle,       bg: 'bg-red-50',    border: 'border-red-200',   iconColor: 'text-red-500',    textColor: 'text-red-800' },
      }[v];
      const AlertIcon = alertConfig.icon;
      return (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${alertConfig.bg} ${alertConfig.border}`}>
          <AlertIcon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${alertConfig.iconColor}`} />
          <p className={`text-sm leading-relaxed ${alertConfig.textColor}`}>
            {element.content || 'Mensagem de atenção'}
          </p>
        </div>
      );
    }

    case 'notification': {
      const firstItem = (element.notificationItems || [])[0];
      return (
        <div className="w-full flex justify-center">
          <div
            className="w-full max-w-sm rounded-2xl px-4 py-3 flex items-start gap-3 shadow-lg border"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(24px)',
              borderColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Twemoji className="text-lg leading-none">{firstItem?.icon || '🔔'}</Twemoji>
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-gray-900 truncate">
                  {firstItem?.title || 'Notificação'}
                </p>
                <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">agora</span>
              </div>
              <p className="text-[12px] text-gray-600 leading-snug mt-0.5 line-clamp-2">
                {firstItem?.text || 'Texto da notificação'}
              </p>
            </div>
          </div>
          {(element.notificationItems || []).length > 1 && (
            <div className="absolute -bottom-1 right-4 text-[10px] text-muted-foreground">
              +{(element.notificationItems || []).length - 1} mais
            </div>
          )}
        </div>
      );
    }

    // ─── Form fields — same visual as FormPreview ──────────────────
    case 'input_text':
    case 'input_email':
    case 'input_phone':
    case 'input_address':
    case 'input_number':
      return withFieldHeader(
        <input
          type="text"
          readOnly
          placeholder={element.placeholder || 'Digite aqui...'}
          className="w-full bg-transparent border-0 border-b-2 border-border outline-none text-xl py-2 text-foreground placeholder:text-muted-foreground/40"
        />
      );

    case 'input_textarea':
      return withFieldHeader(
        <textarea
          readOnly
          placeholder={element.placeholder || 'Digite sua mensagem...'}
          rows={3}
          className="w-full bg-transparent border-0 border-b-2 border-border outline-none text-xl py-2 text-foreground placeholder:text-muted-foreground/40 resize-none"
        />
      );

    case 'input_date':
      return withFieldHeader(
        <input
          type="text"
          readOnly
          placeholder={element.placeholder || 'dd/mm/aaaa'}
          className="w-full bg-transparent border-0 border-b-2 border-border outline-none text-xl py-2 text-foreground placeholder:text-muted-foreground/40"
        />
      );

    case 'input_height':
    case 'input_weight':
      return withFieldHeader(
        <div className="pointer-events-none opacity-80">
          <HeightWeightField
            type={type === 'input_height' ? 'height' : 'weight'}
            value={undefined}
            onChange={() => {}}
            defaultUnit={element.unit}
            allowUnitToggle={element.allowUnitToggle !== false}
            min={element.min}
            max={element.max}
            defaultValue={element.defaultValue}
          />
        </div>
      );

    case 'input_checkbox':
      return withFieldHeader(
        <div className="flex items-center gap-4">
          <div className="h-7 w-7 rounded-lg border-2 border-border flex items-center justify-center flex-shrink-0" />
          <span className="text-lg text-foreground">Aceitar</span>
        </div>
      );

    case 'input_select':
      return withFieldHeader(
        <div className="space-y-3">
          {(element.options || []).map((opt, i) => (
            <div
              key={opt.id}
              className="w-full text-left px-5 py-4 rounded-xl border-2 border-border flex items-center gap-4"
            >
              <span className="h-7 w-7 rounded-lg border-2 border-border text-xs font-bold flex items-center justify-center flex-shrink-0 text-muted-foreground">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-lg">{opt.label}</span>
            </div>
          ))}
        </div>
      );

    case 'input_radio':
      return withFieldHeader(
        <div className="space-y-3">
          {(element.options || []).map((opt, i) => (
            <div
              key={opt.id}
              className="w-full text-left px-5 py-4 rounded-xl border-2 border-border flex items-center gap-4"
            >
              <span className="h-7 w-7 rounded-lg border-2 border-border text-xs font-bold flex items-center justify-center flex-shrink-0 text-muted-foreground">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-lg">{opt.label}</span>
            </div>
          ))}
        </div>
      );

    case 'input_rating': {
      const max = element.maxRating || 5;
      return withFieldHeader(
        <div className="flex gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <Star key={i} className="h-8 w-8 text-muted-foreground/30" />
          ))}
        </div>
      );
    }

    case 'input_yes_no':
      return withFieldHeader(
        <div className="flex gap-3">
          <div className="flex-1 px-5 py-4 rounded-xl border-2 border-border flex items-center justify-center gap-2 text-lg font-medium text-muted-foreground">
            <Twemoji>👍</Twemoji> <span>Sim</span>
          </div>
          <div className="flex-1 px-5 py-4 rounded-xl border-2 border-border flex items-center justify-center gap-2 text-lg font-medium text-muted-foreground">
            <Twemoji>👎</Twemoji> <span>Não</span>
          </div>
        </div>
      );

    case 'input_multi_select':
      return withFieldHeader(
        <div className="space-y-3">
          {(element.options || []).map((opt, i) => (
            <div
              key={opt.id}
              className="w-full text-left px-5 py-4 rounded-xl border-2 border-border flex items-center gap-4"
            >
              <span className="h-7 w-7 rounded-md border-2 border-border text-xs font-bold flex items-center justify-center flex-shrink-0 text-muted-foreground">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-lg flex-1">{opt.label}</span>
              <div className="h-5 w-5 rounded border-2 border-border flex-shrink-0" />
            </div>
          ))}
        </div>
      );

    case 'input_quiz_icon':
      return withFieldHeader(
        <div className="grid grid-cols-2 gap-3">
          {(element.options || []).map((opt) => (
            <div
              key={opt.id}
              className="px-4 py-5 rounded-xl border-2 border-border flex flex-col items-center gap-2 text-center"
            >
              <Twemoji className="text-3xl">{opt.emoji || '⭐'}</Twemoji>
              <span className="text-sm font-medium">{opt.label}</span>
            </div>
          ))}
        </div>
      );

    case 'input_quiz_image':
      return withFieldHeader(
        <div className="grid grid-cols-2 gap-3">
          {(element.options || []).map((opt) => (
            <div
              key={opt.id}
              className="rounded-xl border-2 border-border overflow-hidden"
            >
              {opt.imageUrl ? (
                <img src={opt.imageUrl} alt={opt.label} className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 bg-muted flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <div className="px-3 py-2 text-sm font-medium text-center">{opt.label}</div>
            </div>
          ))}
        </div>
      );

    case 'arguments':
      return <ArgumentsPreview element={element} />;
    case 'testimonials':
      return <TestimonialsPreview element={element} />;
    case 'faq':
      return <FAQPreview element={element} />;
    case 'pricing':
      return <PricingPreview element={element} />;
    case 'before_after':
      return <BeforeAfterPreview element={element} />;
    case 'carousel':
      return <CarouselPreview element={element} />;

    default:
      return <div className="p-3 text-muted-foreground text-sm">Elemento desconhecido</div>;
  }
}
