import { PageElement } from '@/types/pageElements';
import type { FormStyle, FormVariable } from '@/types/form';
import { ImageIcon, VideoIcon, Star, Check, Info, CheckCircle2, AlertTriangle, XCircle, Calendar as CalendarIcon, Bell } from 'lucide-react';
import HeightWeightField from '@/components/preview/HeightWeightField';
import Twemoji from '@/components/Twemoji';
import { ArgumentsPreview, TestimonialsPreview, FAQPreview, PricingPreview, BeforeAfterPreview, CarouselPreview } from './SectionPreviews';
import WhatsAppInvitePreview from '@/components/preview/WhatsAppInvitePreview';
import CardPreview from '@/components/preview/CardPreview';
import ChartLivePreview from '@/components/editor/chart-designer/ChartLivePreview';
import ComparativeChartPreview from '@/components/preview/charts/ComparativeChartPreview';
import TimerPreview from '@/components/preview/TimerPreview';
import CircularProgressPreview from '@/components/preview/CircularProgressPreview';
import ListPreview from '@/components/preview/ListPreview';
import LoadingPreview from '@/components/preview/LoadingPreview';
import { normalizeFontFamily } from '@/lib/fontUtils';
import { VariableHighlightOverlay, type ElementLookup } from '@/components/editor/shared/VariableHighlightOverlay';

import { Button } from '@/components/ui/button';

interface Props {
  element: PageElement;
  stepNumber?: number;
  formStyle?: FormStyle;
  /** Maps element IDs → friendly labels for {{field:id}} display */
  elementLookup?: ElementLookup;
  /** Variables list for {{varName}} display */
  variables?: FormVariable[];
}

/**
 * Renders a page element in the editor canvas with the SAME visual style
 * used in FormPreview, ensuring WYSIWYG parity.
 */
export default function ElementPreview({ element, stepNumber, formStyle, elementLookup, variables }: Props) {
  const { type, style } = element;

  /** Render text content with friendly variable labels instead of raw IDs */
  const renderVarContent = (text: string | undefined, fallback: string, className?: string, inlineStyle?: React.CSSProperties) => {
    const content = text || fallback;
    const hasToken = content.includes('{{');
    if (!hasToken) return <span className={className} style={inlineStyle}>{content}</span>;
    return (
      <VariableHighlightOverlay
        text={content}
        className={className}
        elementLookup={elementLookup}
        displayFieldLabels
      />
    );
  };
  const alignClass = style?.textAlign === 'center' ? 'text-center' : style?.textAlign === 'right' ? 'text-right' : 'text-left';

  // Outer wrapper styles (margin)
  const containerStyle: React.CSSProperties = {};
  if (style?.margin !== undefined) containerStyle.margin = style.margin;
  if (style?.marginTop !== undefined) containerStyle.marginTop = style.marginTop;
  if (style?.marginRight !== undefined) containerStyle.marginRight = style.marginRight;
  if (style?.marginBottom !== undefined) containerStyle.marginBottom = style.marginBottom;
  if (style?.marginLeft !== undefined) containerStyle.marginLeft = style.marginLeft;

  // Box styles (background, border, padding, width) — applied universally via wrapper
  const boxStyle: React.CSSProperties = {};
  if (style?.backgroundColor) {
    const bgOpacity = style.backgroundOpacity ?? 100;
    if (bgOpacity < 100 && style.backgroundColor.startsWith('#')) {
      const r = parseInt(style.backgroundColor.slice(1, 3), 16);
      const g = parseInt(style.backgroundColor.slice(3, 5), 16);
      const b = parseInt(style.backgroundColor.slice(5, 7), 16);
      boxStyle.backgroundColor = `rgba(${r}, ${g}, ${b}, ${bgOpacity / 100})`;
    } else {
      boxStyle.backgroundColor = style.backgroundColor;
    }
  }
  if (style?.borderRadius !== undefined) boxStyle.borderRadius = style.borderRadius;
  if (style?.borderWidth) {
    boxStyle.borderWidth = style.borderWidth;
    boxStyle.borderStyle = style.borderStyle || 'solid';
    const bc = style.borderColor || 'currentColor';
    const bOpacity = style.borderOpacity ?? 100;
    if (bOpacity < 100 && bc.startsWith('#')) {
      const r = parseInt(bc.slice(1, 3), 16);
      const g = parseInt(bc.slice(3, 5), 16);
      const b = parseInt(bc.slice(5, 7), 16);
      boxStyle.borderColor = `rgba(${r}, ${g}, ${b}, ${bOpacity / 100})`;
    } else {
      boxStyle.borderColor = bc;
    }
  }
  if (style?.backdropBlur) {
    boxStyle.backdropFilter = `blur(${style.backdropBlur}px)`;
    (boxStyle as any).WebkitBackdropFilter = `blur(${style.backdropBlur}px)`;
  }
  if (style?.padding !== undefined) boxStyle.padding = style.padding;
  if (style?.paddingTop !== undefined) boxStyle.paddingTop = style.paddingTop;
  if (style?.paddingRight !== undefined) boxStyle.paddingRight = style.paddingRight;
  if (style?.paddingBottom !== undefined) boxStyle.paddingBottom = style.paddingBottom;
  if (style?.paddingLeft !== undefined) boxStyle.paddingLeft = style.paddingLeft;
  if (style?.width) boxStyle.width = style.width;
  if (style?.boxShadow) boxStyle.boxShadow = style.boxShadow;

  // Typography styles — passed down to text-rendering elements
  const elementStyle: React.CSSProperties = {};
  if (style?.color) elementStyle.color = style.color;
  if (style?.fontFamily) elementStyle.fontFamily = normalizeFontFamily(style.fontFamily);
  if (style?.fontWeight) elementStyle.fontWeight = style.fontWeight;

  const isFormField = type.startsWith('input_');

  /** Typeform-style "N → enunciado" header — mirrors FormPreview exactly */
  const withFieldHeader = (content: React.ReactNode) => (
    <div className="space-y-3 md:space-y-6">
      <div className="flex items-start gap-1.5 md:gap-3">
        <span className="text-base md:text-xl lg:text-2xl font-semibold mt-0.5" style={{ color: 'inherit' }}>{stepNumber ?? '?'}</span>
        <span className="text-base md:text-xl lg:text-2xl font-semibold mt-0.5" style={{ color: 'inherit' }}>→</span>
        <div>
          <h2 className="text-base md:text-xl lg:text-2xl font-semibold text-foreground leading-snug">
            {renderVarContent(element.label, 'Sem título')}
            {element.required && <span className="text-destructive ml-1">*</span>}
          </h2>
          {element.description && (
            <div className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">{renderVarContent(element.description, '')}</div>
          )}
        </div>
      </div>
      <div className="pl-7 md:pl-12 lg:pl-14">
        {content}
      </div>
    </div>
  );

  // Helper: render inner content based on type
  const renderContent = (): React.ReactNode => {
  switch (type) {
    case 'heading': {
      const sizeMap: Record<number, string> = { 1: 'text-4xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return (
        <div className={alignClass}>
          <div className={`${sizeMap[element.level || 2]} font-bold text-foreground`} style={{ ...elementStyle, color: style?.color, fontFamily: normalizeFontFamily(style?.fontFamily), fontWeight: style?.fontWeight }}>
            {renderVarContent(element.content, 'Título')}
          </div>
        </div>
      );
    }

    case 'text':
      return (
        <div className={alignClass}>
          <div className="text-base text-foreground/80 whitespace-pre-wrap leading-relaxed" style={{ ...elementStyle, color: style?.color, fontFamily: normalizeFontFamily(style?.fontFamily), fontWeight: style?.fontWeight }}>
            {renderVarContent(element.content, '')}
          </div>
        </div>
      );

    case 'rich_text':
      return (
        <div
          className={`text-foreground/80 leading-relaxed ${alignClass} [&_b]:font-bold [&_i]:italic [&_u]:underline [&_strike]:line-through`}
          style={{ ...elementStyle, fontFamily: normalizeFontFamily(style?.fontFamily) }}
          dangerouslySetInnerHTML={{ __html: element.content || '' }}
        />
      );

    case 'image': {
      const maxH = element.imageMaxHeight || 400;
      const objectFit = element.imageObjectFit || 'cover';
      const focalX = element.imageFocalX ?? 50;
      const focalY = element.imageFocalY ?? 50;
      return element.src ? (
        <div className={alignClass}>
          <img
            src={element.src}
            alt={element.alt || ''}
            className="max-w-full rounded-lg mx-auto"
            style={{
              ...elementStyle,
              maxHeight: maxH,
              width: '100%',
              objectFit: objectFit as any,
              objectPosition: objectFit === 'cover' ? `${focalX}% ${focalY}%` : undefined,
            }}
          />
        </div>
      ) : (
        <div className="p-6 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm">Clique para adicionar uma imagem</span>
        </div>
      );
    }

    case 'button':
      return (
        <div className={alignClass}>
          <Button
            className="pointer-events-none"
            style={{
              backgroundColor: style?.backgroundColor,
              borderRadius: style?.borderRadius,
              width: style?.width || 'auto',
              padding: style?.padding !== undefined ? `${style.padding}px ${style.padding * 1.5}px` : undefined,
              color: style?.color,
              fontFamily: normalizeFontFamily(style?.fontFamily),
              fontWeight: style?.fontWeight,
              fontSize: style?.fontSize ? (style.fontSize === 'base' ? '1rem' : style.fontSize === 'lg' ? '1.125rem' : style.fontSize === 'xl' ? '1.25rem' : style.fontSize === '2xl' ? '1.5rem' : undefined) : undefined,
            }}
          >
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
    case 'input_document':
    case 'input_company':
      return withFieldHeader(
        <input
          type="text"
          readOnly
          placeholder={element.placeholder || (type === 'input_document' ? '000.000.000-00' : type === 'input_company' ? '00.000.000/0000-00' : 'Digite aqui...')}
          className="w-full bg-transparent border-0 border-b-2 border-border outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors"
        />
      );

    case 'input_textarea':
      return withFieldHeader(
        <textarea
          readOnly
          placeholder={element.placeholder || 'Digite sua mensagem...'}
          rows={3}
          className="w-full bg-transparent border-0 border-b-2 border-border outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 resize-none transition-colors"
        />
      );

    case 'input_date':
      return withFieldHeader(
        <div className="flex items-center gap-3 border-0 border-b-2 border-border py-2 text-muted-foreground/40">
          <CalendarIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <span className="text-base md:text-lg lg:text-xl">{element.placeholder || 'Selecione a data'}</span>
        </div>
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
      const style = element.ratingStyle || 'star';
      const activeColor = element.ratingActiveColor || '#facc15';
      const inactiveColor = element.ratingInactiveColor || '#d1d5db';
      if (style === 'numeric') {
        return withFieldHeader(
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: max }).map((_, i) => (
              <div key={i} className="w-9 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-bold" style={{ borderColor: inactiveColor, color: inactiveColor }}>{i + 1}</div>
            ))}
          </div>
        );
      }
      const iconMap: Record<string, string> = { star: '⭐', heart: '❤️', thumbsUp: '👍', emoji: element.ratingEmoji || '⭐' };
      const emoji = iconMap[style] || '⭐';
      return withFieldHeader(
        <div className="flex gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <span key={i} className="text-2xl opacity-30">{emoji}</span>
          ))}
        </div>
      );
    }

    case 'input_nps': {
      const max = element.maxRating || 10;
      return withFieldHeader(
        <div className="space-y-1">
          <div className="hidden sm:flex gap-1">
            {Array.from({ length: max + 1 }).map((_, i) => (
              <div key={i} className="flex-1 h-10 rounded-lg border-2 border-border flex items-center justify-center text-xs font-bold text-muted-foreground">{i}</div>
            ))}
          </div>
          <div className="flex sm:hidden flex-col gap-2 items-center">
            <span className="text-3xl font-bold text-muted-foreground">–</span>
            <div className="w-full h-2 rounded-full bg-border" />
            <div className="flex justify-between w-full text-[10px] text-muted-foreground tabular-nums">
              <span>0</span>
              <span>{max}</span>
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>{element.npsLowLabel || 'Nada provável'}</span>
            <span>{element.npsHighLabel || 'Muito provável'}</span>
          </div>
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
    case 'whatsapp_invite':
      return <WhatsAppInvitePreview element={element} />;

    case 'chart':
      return (
        <div className="rounded-lg p-3" style={{ border: '1px solid rgba(0,0,0,0.12)' }}>
          <ChartLivePreview
            chartType={element.chartType || 'column'}
            items={element.chartItems || []}
            style={element.chartStyle || {}}
          />
        </div>
      );

    case 'comparative_chart':
      return (
        <div className="rounded-lg p-3" style={{ border: '1px solid rgba(0,0,0,0.12)' }}>
          <ComparativeChartPreview
            datasets={element.comparativeDatasets || []}
            labels={element.comparativeLabels || []}
            mode={element.comparativeMode || 'cartesian'}
            style={element.chartStyle}
          />
        </div>
      );

    case 'timer':
      return (
        <div className={alignClass}>
          <TimerPreview
            mode={element.timerMode || 'time'}
            durationMinutes={element.timerDurationMinutes}
            targetDate={element.timerTargetDate}
            label={element.timerLabel}
            finishedLabel={element.timerFinishedLabel}
            showDays={element.timerShowDays}
            showHours={element.timerShowHours}
            showMinutes={element.timerShowMinutes}
            showSeconds={element.timerShowSeconds}
            digitColor={element.timerDigitColor}
            labelColor={element.timerLabelColor}
            separatorColor={element.timerSeparatorColor}
            boxBackground={element.timerBoxBackground}
            boxBorderRadius={element.timerBoxBorderRadius}
            static
          />
        </div>
      );

    case 'horizontal_bar': {
      const barVal = element.horizontalBarValue ?? 50;
      const barColor = element.horizontalBarColor || 'hsl(var(--primary))';
      const barBg = element.horizontalBarBackground || 'rgba(0,0,0,0.08)';
      const lblColor = element.horizontalBarLabelColor || 'hsl(var(--foreground))';
      const valColor = element.horizontalBarValueColor || '#818388';
      const trackH = element.horizontalBarHeight || 12;
      const dotSize = trackH + 10;
      const totalSegments = 5;
      const pct = Math.min(100, Math.max(0, barVal));
      const filledFull = Math.floor((pct / 100) * totalSegments);
      const partialFill = ((pct / 100) * totalSegments) - filledFull;
      return (
        <div className="space-y-1.5 w-full">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-semibold" style={{ color: lblColor }}>{element.horizontalBarLabel || 'Progresso'}</span>
            <span className="text-sm font-extrabold" style={{ color: valColor }}>{barVal}%</span>
          </div>
          <div className="relative w-full" style={{ height: dotSize }}>
            <div className="flex gap-1 w-full absolute left-0 right-0" style={{ top: (dotSize - trackH) / 2 }}>
              {Array.from({ length: totalSegments }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm overflow-hidden"
                  style={{ height: trackH, backgroundColor: barBg }}
                >
                  {i < filledFull ? (
                    <div className="h-full w-full" style={{ backgroundColor: barColor }} />
                  ) : i === filledFull && partialFill > 0 ? (
                    <div className="h-full" style={{ width: `${partialFill * 100}%`, backgroundColor: barColor }} />
                  ) : null}
                </div>
              ))}
            </div>
            <div
              className="absolute rounded-full shadow-sm transition-all duration-500"
              style={{
                width: dotSize,
                height: dotSize,
                backgroundColor: '#ffffff',
                border: `3px solid ${barColor}`,
                left: `calc(${pct}% - ${dotSize / 2}px)`,
                top: 0,
                zIndex: 1,
              }}
            />
          </div>
        </div>
      );
    }

    case 'progress_bar': {
      const bars = element.progressBarItems || [];
      const cols = element.progressBarLayout || 1;
      const disposition = element.progressBarDisposition || 'chart_legend';
      return (
        <div className={`grid ${cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 w-full`}>
          {bars.map(bar => {
            const barBg = bar.barBackground || 'rgba(0,0,0,0.08)';
            const valColor = bar.valueColor || bar.color;
            const lblColor = bar.labelColor || 'hsl(var(--foreground))';
            const barContent = (
              <div className="w-full h-48 rounded-xl overflow-hidden relative" style={{ backgroundColor: barBg, maxWidth: element.progressBarBarWidth || 120 }}>
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all duration-500 rounded-xl"
                  style={{ height: `${Math.min(100, Math.max(0, bar.value))}%`, backgroundColor: bar.color }}
                />
                <div className="absolute inset-0 flex items-start justify-center pt-3">
                  <span
                    className="text-base font-extrabold drop-shadow-sm"
                    style={{ color: valColor }}
                  >
                    {bar.value}%
                  </span>
                </div>
              </div>
            );
            const labelContent = (
              <p
                className="text-sm font-semibold text-center leading-snug"
                style={{ color: lblColor }}
              >
                {bar.label}
              </p>
            );
            const bw = element.progressBarColBorderWidth ?? 1;
            const colBorderStyle: React.CSSProperties = {
              borderWidth: bw,
              borderStyle: bw > 0 ? (element.progressBarColBorderStyle || 'solid') : 'none',
              borderColor: bw > 0 ? (element.progressBarColBorderColor || 'rgba(0,0,0,0.12)') : undefined,
              borderRadius: element.progressBarColBorderRadius ?? 8,
            };
            return (
              <div key={bar.id} className="flex flex-col items-center gap-3 p-3" style={colBorderStyle}>
                {disposition === 'chart_legend' ? <>{barContent}{labelContent}</> : <>{labelContent}{barContent}</>}
              </div>
            );
          })}
        </div>
      );
    }

    case 'circular_progress':
      return (
        <div className={alignClass}>
          <CircularProgressPreview
            value={element.circularProgressValue ?? 72}
            labelBefore={element.circularProgressLabelBefore}
            labelAfter={element.circularProgressLabelAfter}
            color={element.circularProgressColor}
            trackColor={element.circularProgressTrackColor}
            textColor={element.circularProgressTextColor}
            labelColor={element.circularProgressLabelColor}
            size={element.circularProgressSize}
            strokeWidth={element.circularProgressStroke}
          />
        </div>
      );

    case 'loading':
      return (
        <div className={alignClass}>
          <LoadingPreview
            style={element.loadingStyle}
            duration={element.loadingDuration}
            targetPercent={element.loadingTargetPercent}
            label={element.loadingLabel}
            color={element.loadingColor}
            trackColor={element.loadingTrackColor}
            textColor={element.loadingTextColor}
            size={element.loadingSize}
            stroke={element.loadingStroke}
            interactive={false}
          />
        </div>
      );

    case 'list':
      return (
        <div className={alignClass}>
          <ListPreview
            items={element.listItems || []}
            listStyle={element.listStyleType}
            iconColor={element.listIconColor}
            textColor={element.listTextColor}
            gap={element.listGap}
            fontSize={element.style?.fontSize}
          />
        </div>
      );

    case 'columns': {
      const colCount = element.columnCount || 2;
      const cols = element.columnData || [];
      return (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
          {cols.slice(0, colCount).map(col => (
            <div key={col.id} className="min-h-[60px] rounded-lg border border-dashed border-border/40 p-2 space-y-2">
              {col.elements.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground/40">Coluna vazia</div>
              ) : (
                col.elements.map(el => (
                  <div key={el.id} className="text-sm [&_*]:!text-sm [&_h2]:!text-base">
                    <ElementPreview element={el} />
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      );
    }

    case 'confetti':
      return (
        <div className="relative w-full h-24 rounded-lg bg-muted/30 flex items-center justify-center overflow-hidden">
          <span className="text-xs text-muted-foreground z-10">🎉 Confete ({element.confettiDirection === 'sides' ? 'laterais' : 'cima p/ baixo'} · {element.confettiIntensity === 'explosion' ? 'explosão' : 'sutil'})</span>
        </div>
      );

    case 'card':
      return (
        <CardPreview
          items={element.cardItems || []}
          columns={element.cardColumns}
          imageHeight={element.cardImageHeight}
          interactive={false}
        />
      );

    default:
      return <div className="p-3 text-muted-foreground text-sm">Elemento desconhecido</div>;
  }
  };

  // Check if we have any box styles to apply
  const hasBoxStyle = Object.keys(boxStyle).length > 0;
  const hasContainerStyle = Object.keys(containerStyle).length > 0;

  const content = renderContent();

  // If no wrapper styles needed, return content directly
  if (!hasBoxStyle && !hasContainerStyle) return <>{content}</>;

  return (
    <div style={{ ...containerStyle, ...boxStyle, overflow: 'visible' }}>
      {content}
    </div>
  );
}
