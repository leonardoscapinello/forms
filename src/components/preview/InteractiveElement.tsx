import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { LazyMotion, domAnimation, m as motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react';
import { PageElement } from '@/types/pageElements';
import { FormVariable, FormStyle } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import Twemoji from '@/components/Twemoji';
import { interpolateText, interpolateTextToNodes } from '@/lib/variableInterpolation';
import { normalizeFontFamily } from '@/lib/fontUtils';
import { validateEmailFormat } from '@/lib/emailValidation';

// Lazy-loaded heavy preview components
const loadPhoneFieldPreview = () => import('@/components/preview/PhoneFieldPreview');
const PhoneFieldPreview = lazy(loadPhoneFieldPreview);
const loadEmailDomainSuggestions = () => import('@/components/preview/EmailDomainSuggestions');
const EmailDomainSuggestions = lazy(loadEmailDomainSuggestions);
const loadHeightWeightField = () => import('@/components/preview/HeightWeightField');
const HeightWeightField = lazy(loadHeightWeightField);
const loadChartLivePreview = () => import('@/components/editor/chart-designer/ChartLivePreview');
const ChartLivePreview = lazy(loadChartLivePreview);
const loadComparativeChartPreview = () => import('@/components/preview/charts/ComparativeChartPreview');
const ComparativeChartPreview = lazy(loadComparativeChartPreview);
const loadCircularProgressPreview = () => import('@/components/preview/CircularProgressPreview');
const CircularProgressPreview = lazy(loadCircularProgressPreview);
const loadIOSNotification = () => import('@/components/preview/IOSNotification');
const IOSNotification = lazy(loadIOSNotification);
const loadDateFieldPreview = () => import('@/components/preview/DateFieldPreview');
const DateFieldPreview = lazy(loadDateFieldPreview);
const loadTimerPreview = () => import('@/components/preview/TimerPreview');
const TimerPreview = lazy(loadTimerPreview);
const loadListPreview = () => import('@/components/preview/ListPreview');
const ListPreview = lazy(loadListPreview);
const loadLoadingPreview = () => import('@/components/preview/LoadingPreview');
const LoadingPreview = lazy(loadLoadingPreview);
const loadDocumentFieldPreview = () => import('@/components/preview/DocumentFieldPreview');
const DocumentFieldPreview = lazy(loadDocumentFieldPreview);
const loadCompanyFieldPreview = () => import('@/components/preview/CompanyFieldPreview');
const CompanyFieldPreview = lazy(loadCompanyFieldPreview);
const loadAddressFieldPreview = () => import('@/components/preview/AddressFieldPreview');
const AddressFieldPreview = lazy(loadAddressFieldPreview);
const loadProgressBarColumn = () => import('@/components/preview/ProgressBarColumn');
const ProgressBarColumn = lazy(loadProgressBarColumn);
const loadBeforeAfterSlider = () => import('@/components/preview/BeforeAfterSlider');
const BeforeAfterSlider = lazy(loadBeforeAfterSlider);
const loadConfettiPreview = () => import('@/components/preview/ConfettiPreview');
const ConfettiPreview = lazy(loadConfettiPreview);

const loadSectionPreviews = () => import('@/components/editor/page-builder/SectionPreviews');
const ArgumentsPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.ArgumentsPreview })));
const TestimonialsPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.TestimonialsPreview })));
const FAQPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.FAQPreview })));
const PricingPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.PricingPreview })));
const CarouselPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.CarouselPreview })));
const loadWhatsAppInvite = () => import('@/components/preview/WhatsAppInvitePreview');
const WhatsAppInvitePreview = lazy(() => loadWhatsAppInvite().then(m => ({ default: m.default })));

export interface InteractiveElementProps {
  element: PageElement;
  value: any;
  onChange: (v: any) => void;
  stepNumber: number;
  letterOffset?: number;
  onBlockedChange: (blocked: boolean) => void;
  registerValidator: (validator: (() => Promise<boolean>) | null) => void;
  onNavigate?: (action: 'next' | 'previous' | 'specific' | 'finish', targetPageId?: string) => void;
  variables?: FormVariable[];
  answers?: Record<string, any>;
  fieldError?: string;
  formStyle?: FormStyle;
}

/** Renders an interactive page element for the preview */
export default function InteractiveElement({
  element,
  value,
  onChange,
  stepNumber,
  letterOffset = 0,
  onBlockedChange,
  registerValidator,
  onNavigate,
  variables = [],
  answers = {},
  fieldError,
  formStyle,
}: InteractiveElementProps) {
  const { type, style } = element;
  const t = (text: string | undefined) => text ? interpolateText(text, variables, answers) : text;
  const tNodes = (text: string | undefined) => text ? interpolateTextToNodes(text, variables, answers) : text;
  const alignClass = style?.textAlign === 'center' ? 'text-center' : style?.textAlign === 'right' ? 'text-right' : 'text-left';

  // Universal style wrappers matching ElementPreview
  const containerStyle: React.CSSProperties = {};
  if (style?.margin !== undefined) containerStyle.margin = style.margin;
  if (style?.marginTop !== undefined) containerStyle.marginTop = style.marginTop;
  if (style?.marginRight !== undefined) containerStyle.marginRight = style.marginRight;
  if (style?.marginBottom !== undefined) containerStyle.marginBottom = style.marginBottom;
  if (style?.marginLeft !== undefined) containerStyle.marginLeft = style.marginLeft;

  const boxStyle: React.CSSProperties = {};
  if (style?.backgroundColor) boxStyle.backgroundColor = style.backgroundColor;
  if (style?.borderRadius !== undefined) boxStyle.borderRadius = style.borderRadius;
  if (style?.borderWidth) {
    boxStyle.borderWidth = style.borderWidth;
    boxStyle.borderStyle = style.borderStyle || 'solid';
    boxStyle.borderColor = style.borderColor || 'currentColor';
  }
  if (style?.padding !== undefined) boxStyle.padding = style.padding;
  if (style?.paddingTop !== undefined) boxStyle.paddingTop = style.paddingTop;
  if (style?.paddingRight !== undefined) boxStyle.paddingRight = style.paddingRight;
  if (style?.paddingBottom !== undefined) boxStyle.paddingBottom = style.paddingBottom;
  if (style?.paddingLeft !== undefined) boxStyle.paddingLeft = style.paddingLeft;
  if (style?.width) boxStyle.width = style.width;
  if (style?.boxShadow) boxStyle.boxShadow = style.boxShadow;

  const hasWrapperStyle = Object.keys(containerStyle).length > 0 || Object.keys(boxStyle).length > 0;

  // Keyboard shortcut: press letter key to select option
  const SELECTION_TYPES = ['input_select', 'input_radio', 'input_multi_select', 'input_quiz_icon', 'input_quiz_image'];
  useEffect(() => {
    if (!SELECTION_TYPES.includes(type)) return;
    const opts = element.options || [];
    if (opts.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toUpperCase();
      const code = key.charCodeAt(0) - 65;
      const localIndex = code - letterOffset;
      if (localIndex < 0 || localIndex >= opts.length) return;

      e.preventDefault();
      const opt = opts[localIndex];
      if (type === 'input_multi_select') {
        const selected: string[] = Array.isArray(value) ? value : [];
        if (selected.includes(opt.id)) {
          onChange(selected.filter(id => id !== opt.id));
        } else {
          onChange([...selected, opt.id]);
        }
      } else {
        onChange(opt.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [type, element.options, letterOffset, value, onChange]);

  // Email validation state
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const emailFormatResult = element.type === 'input_email' && value
    ? validateEmailFormat(value as string)
    : null;

  const onBlockedChangeRef = useRef(onBlockedChange);
  onBlockedChangeRef.current = onBlockedChange;

  useEffect(() => {
    if (element.type === 'input_email') {
      onBlockedChangeRef.current(emailChecking);
    } else {
      onBlockedChangeRef.current(false);
    }
  }, [emailChecking, element.type]);

  // Register validator for email fields
  useEffect(() => {
    if (element.type === 'input_email') {
      registerValidator(async () => {
        const val = (valueRef.current || '') as string;
        setEmailError(null);
        setEmailValid(null);

        if (!val) {
          if (element.required) {
            setEmailError(element.requiredMessage || 'E-mail obrigatório');
            return false;
          }
          return true;
        }

        const formatCheck = validateEmailFormat(val);
        if (!formatCheck.valid) {
          setEmailError(formatCheck.error || 'E-mail inválido');
          return false;
        }

        if (element.smartValidation) {
          setEmailChecking(true);
          try {
            const res = await supabase.functions.invoke('verify-email', { body: { email: val } });
            const data = res.data as any;
            if (data?.is_safe_to_send === false) {
              setEmailError(data?.is_disposable ? 'E-mail descartável' : 'Este e-mail não é válido para receber mensagens');
              setEmailValid(false);
              return false;
            } else if (data?.is_safe_to_send === true) {
              setEmailValid(true);
              setEmailError(null);
              return true;
            }
            return true;
          } catch {
            return true;
          } finally {
            setEmailChecking(false);
          }
        }

        setEmailValid(true);
        return true;
      });
    } else {
      registerValidator(null);
    }
    return () => registerValidator(null);
  }, [element.type, element.smartValidation, element.required, element.requiredMessage, registerValidator]);

  const handleEmailChange = useCallback((val: string) => {
    onChange(val);
    setEmailValid(null);
    setEmailError(null);
  }, [onChange]);

  const handleEmailBlur = useCallback(() => {
    const val = (value || '') as string;
    if (!val) { setEmailError(null); setEmailValid(null); return; }
    const result = validateEmailFormat(val);
    if (!result.valid) {
      setEmailError(result.error || 'E-mail inválido');
      setEmailValid(false);
    } else {
      setEmailError(null);
    }
  }, [value]);

  const numStyle = formStyle?.questionNumberStyle || 'decimal';
  const numHidden = numStyle === 'none';
  const formatNum = (n: number) => {
    if (numStyle === 'circle') {
      const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
      return n >= 1 && n <= 20 ? circled[n - 1] : `${n}`;
    }
    return `${n}`;
  };

  const numInline: React.CSSProperties = !fieldError ? {
    color: formStyle?.questionNumberColor || 'inherit',
    fontSize: formStyle?.questionNumberSize || undefined,
    fontWeight: (formStyle?.questionNumberWeight as any) || undefined,
  } : {};

  const titleInline: React.CSSProperties = {
    color: formStyle?.questionTitleColor || 'inherit',
    fontSize: formStyle?.questionTitleSize || undefined,
    fontWeight: (formStyle?.questionTitleWeight as any) || undefined,
  };

  const descInline: React.CSSProperties = {
    color: formStyle?.questionDescColor || undefined,
    fontSize: formStyle?.questionDescSize || undefined,
    fontWeight: (formStyle?.questionDescWeight as any) || undefined,
  };

  const withFieldHeader = (content: React.ReactNode) => (
    <div className={`space-y-3 md:space-y-6 ${fieldError ? 'animate-shake' : ''}`}>
      <div className="flex items-start gap-1.5 md:gap-3">
        {!numHidden && (
          <>
            <span className={`text-base md:text-xl lg:text-2xl font-semibold mt-0.5 ${fieldError ? 'text-destructive' : ''}`} style={numInline}>{formatNum(stepNumber)}</span>
            <span className={`text-base md:text-xl lg:text-2xl font-semibold mt-0.5 ${fieldError ? 'text-destructive' : ''}`} style={numInline}>→</span>
          </>
        )}
        <div>
          <h2 className="text-base md:text-xl lg:text-2xl font-semibold leading-snug" style={titleInline}>
            {tNodes(element.label) || 'Sem título'}
            {element.required && <span className="text-destructive ml-1">*</span>}
          </h2>
          {element.description && (
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2" style={descInline}>{tNodes(element.description)}</p>
          )}
        </div>
      </div>
      <div className={numHidden ? '' : 'pl-7 md:pl-12 lg:pl-14'}>
        {content}
        {fieldError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-destructive mt-2 flex items-center gap-1.5"
          >
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {fieldError}
          </motion.p>
        )}
      </div>
    </div>
  );

  const wrapWithStyle = (content: React.ReactNode) => {
    if (!hasWrapperStyle) return content;
    return <div style={{ ...containerStyle, ...boxStyle, overflow: 'visible' }}>{content}</div>;
  };

  switch (type) {
    case 'heading': {
      const sizeMap: Record<number, string> = { 1: 'text-4xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return wrapWithStyle(
        <div className={alignClass}>
          <div className={`${sizeMap[element.level || 2]} font-bold text-foreground`} style={{ color: style?.color, fontFamily: normalizeFontFamily(style?.fontFamily), fontWeight: style?.fontWeight }}>
            {tNodes(element.content) || 'Título'}
          </div>
        </div>
      );
    }

    case 'text':
      return wrapWithStyle(
        <div className={alignClass}>
          <p className="text-base text-foreground/80 whitespace-pre-wrap leading-relaxed" style={{ color: style?.color, fontFamily: normalizeFontFamily(style?.fontFamily), fontWeight: style?.fontWeight }}>
            {tNodes(element.content) || ''}
          </p>
        </div>
      );

    case 'image': {
      const maxH = element.imageMaxHeight || 400;
      const objectFit = element.imageObjectFit || 'cover';
      const focalX = element.imageFocalX ?? 50;
      const focalY = element.imageFocalY ?? 50;
      return element.src ? wrapWithStyle(
        <div className={alignClass}>
          <img
            src={element.src}
            alt={element.alt || ''}
            className="max-w-full rounded-lg mx-auto"
            style={{
              maxHeight: maxH,
              width: '100%',
              objectFit: objectFit as any,
              objectPosition: objectFit === 'cover' ? `${focalX}% ${focalY}%` : undefined,
            }}
          />
        </div>
      ) : null;
    }

    case 'button': {
      const handleButtonClick = () => {
        if (element.href) {
          window.open(element.href, '_blank');
          return;
        }
        if (element.buttonAction && element.buttonAction !== 'none' && onNavigate) {
          onNavigate(element.buttonAction, element.buttonTargetPageId);
        }
      };
      return (
        <div className={alignClass}>
          <Button
            onClick={handleButtonClick}
            style={{
              backgroundColor: style?.backgroundColor || formStyle?.buttonBgColor || formStyle?.primaryColor,
              borderRadius: style?.borderRadius ?? formStyle?.buttonBorderRadius,
              width: style?.width || 'auto',
              padding: style?.padding !== undefined
                ? `${style.padding}px ${style.padding * 1.5}px`
                : (formStyle?.buttonSize === 'sm' ? '6px 16px' : formStyle?.buttonSize === 'lg' ? '14px 32px' : '10px 24px'),
              color: style?.color || formStyle?.buttonTextColor,
              fontFamily: normalizeFontFamily(style?.fontFamily || formStyle?.bodyFontFamily || formStyle?.fontFamily),
              fontWeight: style?.fontWeight,
              fontSize: formStyle?.buttonSize === 'sm' ? 13 : formStyle?.buttonSize === 'lg' ? 16 : undefined,
            }}
          >
            {t(element.content) || 'Botão'}
          </Button>
        </div>
      );
    }

    case 'divider':
      return <hr className="border-border" style={{ borderWidth: element.height || 1 }} />;

    case 'video':
      return element.src ? (
        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
          <iframe src={element.src} className="w-full h-full" allowFullScreen title="Video" />
        </div>
      ) : null;

    case 'spacer':
      return <div style={{ height: element.height || 40 }} />;

    case 'alert': {
      const v = element.alertVariant || 'info';
      const alertConfig = {
        info:    { icon: Info,           bg: 'bg-blue-50',    border: 'border-blue-200',    iconColor: 'text-blue-500',    textColor: 'text-blue-800' },
        success: { icon: CheckCircle2,   bg: 'bg-emerald-50', border: 'border-emerald-200',  iconColor: 'text-emerald-500', textColor: 'text-emerald-800' },
        warning: { icon: AlertTriangle,  bg: 'bg-amber-50',   border: 'border-amber-200',   iconColor: 'text-amber-500',   textColor: 'text-amber-800' },
        error:   { icon: XCircle,        bg: 'bg-red-50',     border: 'border-red-200',     iconColor: 'text-red-500',     textColor: 'text-red-800' },
      }[v];
      const AlertIconComp = alertConfig.icon;
      return wrapWithStyle(
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${alertConfig.bg} ${alertConfig.border}`}>
          <AlertIconComp className={`h-5 w-5 mt-0.5 flex-shrink-0 ${alertConfig.iconColor}`} />
          <p className={`text-sm md:text-base leading-relaxed ${alertConfig.textColor}`}>
            {t(element.content) || 'Mensagem de atenção'}
          </p>
        </div>
      );
    }

    case 'notification':
      return (
        <IOSNotification
          items={(element.notificationItems || []).map(ni => ({
            ...ni,
            title: t(ni.title) || '',
            text: t(ni.text) || '',
          }))}
          mode={element.notificationMode || 'sequential'}
          duration={element.notificationDuration || 3}
          interval={element.notificationInterval || 2}
          position={element.notificationPosition || 'top'}
        />
      );

    case 'arguments':
      return wrapWithStyle(<ArgumentsPreview element={element} />);
    case 'testimonials':
      return wrapWithStyle(<TestimonialsPreview element={element} />);
    case 'faq':
      return wrapWithStyle(<FAQPreview element={element} />);
    case 'pricing':
      return wrapWithStyle(<PricingPreview element={element} />);
    case 'before_after':
      return wrapWithStyle(
        <BeforeAfterSlider
          beforeImage={element.beforeImage || ''}
          afterImage={element.afterImage || ''}
          mode={element.beforeAfterMode || 'slider'}
        />
      );
    case 'carousel':
      return wrapWithStyle(<CarouselPreview element={element} />);
    case 'whatsapp_invite':
      return wrapWithStyle(
        <WhatsAppInvitePreview element={element} />
      );

    case 'columns': {
      const colCount = element.columnCount || 2;
      const cols = element.columnData || [];
      return (
        <div className="grid gap-4 mobile-stack-cols" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
          <style>{`@media (max-width: 640px) { .mobile-stack-cols { grid-template-columns: 1fr !important; } }`}</style>
          {cols.slice(0, colCount).map(col => (
            <div key={col.id} className="space-y-4">
              {col.elements.map((childEl) => (
                <InteractiveElement
                  key={childEl.id}
                  element={childEl}
                  value={undefined}
                  onChange={() => {}}
                  stepNumber={0}
                  onBlockedChange={() => {}}
                  registerValidator={() => {}}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </div>
      );
    }

    // ─── Interactive form fields (with "N → label" header) ──────────────────
    case 'input_email':
      return withFieldHeader(
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              inputMode="email"
              value={t(value) || ''}
              onChange={e => handleEmailChange(e.target.value)}
              placeholder={t(element.placeholder) || 'seu@email.com'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onBlur={handleEmailBlur}
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
              className={`w-full bg-transparent border-0 border-b-2 outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors ${
                emailError ? 'border-destructive' : emailValid ? 'border-green-500' : 'border-border focus:border-primary'
              }`}
              autoFocus
            />
            <AnimatePresence mode="wait">
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                {emailChecking && (
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </motion.div>
                )}
                {!emailChecking && emailValid && (
                  <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </motion.div>
                )}
                {!emailChecking && emailError && (
                  <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </motion.div>
                )}
              </div>
            </AnimatePresence>
          </div>
          <EmailDomainSuggestions value={value || ''} onSelect={handleEmailChange} />
          <div className="h-6 flex items-center">
            <AnimatePresence mode="wait">
              {emailError && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm text-destructive"
                >
                  {emailError}
                </motion.p>
              )}
              {emailValid && element.smartValidation && (
                <motion.p
                  key="valid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm text-green-600"
                >
                  E-mail verificado ✓
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      );

    case 'input_text':
      return withFieldHeader(
        <input
          type="text"
          value={t(value) || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={t(element.placeholder) || 'Digite aqui...'}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors"
          autoFocus
        />
      );

    case 'input_address':
      return withFieldHeader(
        <AddressFieldPreview
          value={value as any}
          onChange={onChange}
          geoSuggestion={{
            city: answers['__ctx_geoCity'] || '',
            state: answers['__ctx_geoState'] || '',
            country: answers['__ctx_geoCountry'] || '',
            countryCode: answers['__ctx_geoCountryCode'] || '',
            neighborhood: answers['__ctx_geoNeighborhood'] || '',
            street: answers['__ctx_geoStreet'] || '',
            cep: answers['__ctx_geoCep'] || '',
            source: answers['__ctx_geoSource'] || '',
          }}
        />
      );

    case 'input_document':
      return withFieldHeader(
        <DocumentFieldPreview
          value={value as any}
          onChange={onChange}
          allowedTypes={element.documentAllowedTypes as any}
        />
      );

    case 'input_company':
      return withFieldHeader(
        <CompanyFieldPreview
          value={value as any}
          onChange={onChange}
          visibleFields={element.companyVisibleFields}
          editableFields={element.companyEditableFields}
        />
      );

    case 'input_number':
      return withFieldHeader(
        <input
          type="number"
          value={t(value) || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={t(element.placeholder) || '0'}
          min={element.min}
          max={element.max}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          autoFocus
        />
      );

    case 'input_textarea':
      return withFieldHeader(
        <textarea
          value={t(value) || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={t(element.placeholder) || 'Digite sua mensagem...'}
          rows={3}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors resize-none"
          autoFocus
        />
      );

    case 'input_date':
      return withFieldHeader(
        <DateFieldPreview
          value={value}
          onChange={onChange}
          dateMode={element.dateMode}
          dateFormat={element.dateFormat}
          placeholder={t(element.placeholder)}
        />
      );

    case 'input_height':
    case 'input_weight':
      return withFieldHeader(
        <HeightWeightField
          type={type === 'input_height' ? 'height' : 'weight'}
          value={value as any}
          onChange={onChange}
          defaultUnit={element.unit}
          allowUnitToggle={element.allowUnitToggle !== false}
          min={element.min}
          max={element.max}
          defaultValue={element.defaultValue}
        />
      );

    case 'input_phone':
      return withFieldHeader(
        <PhoneFieldPreview value={value} onChange={onChange} defaultCountryCode={element.defaultCountryCode} />
      );

    case 'input_checkbox':
      return withFieldHeader(
        <motion.button
          onClick={() => onChange(!value)}
          className="flex items-center gap-3 md:gap-4 text-left group"
          whileTap={{ scale: 0.97 }}
        >
          <motion.div
            className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
              value ? 'border-primary bg-primary' : 'border-border group-hover:border-primary/40'
            }`}
            animate={value ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.25 }}
          >
            {value && <Check className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary-foreground" />}
          </motion.div>
          <span className="text-base md:text-lg text-foreground">Aceitar</span>
        </motion.button>
      );

    case 'input_select':
      return withFieldHeader(
        <div className="space-y-2 md:space-y-3">
          {(element.options || []).map((opt, i) => {
            const isSelected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.97 }}
                animate={isSelected ? {
                  scale: [1, 1.02, 1],
                  boxShadow: ['0 0 0 0px rgba(44,40,23,0)', '0 0 0 4px rgba(44,40,23,0.15)', '0 0 0 0px rgba(44,40,23,0)'],
                } : {}}
                transition={{ duration: 0.35 }}
                className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                  isSelected
                    ? 'border-[#2C2817] bg-[#2C2817]/5 text-foreground shadow-sm'
                    : 'border-border hover:bg-[#2C2817]/5 hover:border-[#2C2817]/30 text-foreground'
                }`}
              >
                <motion.span
                  className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817] text-white' : 'border-border text-muted-foreground'
                  }`}
                  animate={isSelected ? { scale: [1, 1.3, 1], rotate: [0, -8, 8, 0] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + letterOffset + i)}
                </motion.span>
                <span className="text-base md:text-lg">{t(opt.label)}</span>
              </motion.button>
            );
          })}
        </div>
      );

    case 'input_radio':
      return withFieldHeader(
        <div className="space-y-2 md:space-y-3">
          {(element.options || []).map((opt, i) => {
            const isSelected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.97 }}
                animate={isSelected ? {
                  scale: [1, 1.02, 1],
                  boxShadow: ['0 0 0 0px rgba(44,40,23,0)', '0 0 0 4px rgba(44,40,23,0.15)', '0 0 0 0px rgba(44,40,23,0)'],
                } : {}}
                transition={{ duration: 0.35 }}
                className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                  isSelected
                    ? 'border-[#2C2817] bg-[#2C2817]/5 text-foreground shadow-sm'
                    : 'border-border hover:bg-[#2C2817]/5 hover:border-[#2C2817]/30 text-foreground'
                }`}
              >
                <motion.span
                  className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817] text-white' : 'border-border text-muted-foreground'
                  }`}
                  animate={isSelected ? { scale: [1, 1.3, 1], rotate: [0, -8, 8, 0] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {String.fromCharCode(65 + letterOffset + i)}
                </motion.span>
                <span className="text-base md:text-lg">{t(opt.label)}</span>
              </motion.button>
            );
          })}
        </div>
      );

    case 'input_rating': {
      const max = element.maxRating || 5;
      const current = value || 0;
      const style = element.ratingStyle || 'star';
      const activeColor = element.ratingActiveColor || '#facc15';
      const inactiveColor = element.ratingInactiveColor || '#d1d5db';

      if (style === 'numeric') {
        return withFieldHeader(
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: max }).map((_, i) => (
              <motion.button
                key={i}
                onClick={() => onChange(i + 1)}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.08 }}
                className="w-10 h-10 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-colors"
                style={{
                  borderColor: i < current ? activeColor : inactiveColor,
                  backgroundColor: i < current ? activeColor : 'transparent',
                  color: i < current ? '#fff' : inactiveColor,
                }}
              >
                {i + 1}
              </motion.button>
            ))}
          </div>
        );
      }

      const iconMap: Record<string, string> = { star: '⭐', heart: '❤️', thumbsUp: '👍', emoji: element.ratingEmoji || '⭐' };
      const emoji = iconMap[style] || '⭐';

      return withFieldHeader(
        <div className="flex gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <motion.button
              key={i}
              onClick={() => onChange(i + 1)}
              whileTap={{ scale: 0.85 }}
              whileHover={{ scale: 1.15 }}
              animate={i < current ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              className="text-2xl md:text-3xl"
              style={{ opacity: i < current ? 1 : 0.3, filter: i < current ? 'none' : 'grayscale(1)' }}
            >
              {emoji}
            </motion.button>
          ))}
        </div>
      );
    }

    case 'input_nps': {
      const max = element.maxRating || 10;
      const current = value ?? -1;
      const scoreColors = element.npsScoreColors || [];
      const scoreLabels = element.npsScoreLabels || [];
      const dragHint = element.npsDragHint || 'Arraste para escolher sua nota';

      const defaultColor = (i: number) => { const r = i / max; return r <= 0.6 ? '#ef4444' : r <= 0.8 ? '#f59e0b' : '#22c55e'; };
      const defaultLabel = (i: number) => { const r = i / max; return r <= 0.6 ? '😟 Detrator' : r <= 0.8 ? '😐 Neutro' : '😍 Promotor'; };
      const getNpsColor = (i: number) => scoreColors[i] || defaultColor(i);
      const getNpsLabel = (i: number) => scoreLabels[i] || defaultLabel(i);
      const npsSliderColor = current >= 0 ? getNpsColor(current) : 'hsl(var(--border))';

      const gradientStops = Array.from({ length: max + 1 }, (_, i) => {
        const pct = (i / max) * 100;
        const nextPct = ((i + 1) / max) * 100;
        const c = getNpsColor(i);
        return `${c} ${pct}%, ${c} ${Math.min(nextPct, 100)}%`;
      }).join(', ');

      return withFieldHeader(
        <div className="space-y-2">
          {/* Desktop: blocos */}
          <div className="hidden sm:flex gap-1">
            {Array.from({ length: max + 1 }).map((_, i) => {
              const isSelected = current === i;
              const color = getNpsColor(i);
              return (
                <motion.button
                  key={i}
                  onClick={() => onChange(i)}
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.08 }}
                  className="flex-1 h-11 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all"
                  style={{
                    borderColor: isSelected ? color : 'hsl(var(--border))',
                    backgroundColor: isSelected ? color : 'transparent',
                    color: isSelected ? '#fff' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {i}
                </motion.button>
              );
            })}
          </div>
          {/* Mobile: slider com visual aprimorado */}
          <div className="flex sm:hidden flex-col gap-1">
            <div className="flex flex-col items-center gap-1 py-3">
              <motion.div
                key={current}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative"
              >
                <span
                  className="text-5xl font-extrabold tabular-nums transition-colors"
                  style={{ color: current >= 0 ? npsSliderColor : 'hsl(var(--muted-foreground))' }}
                >
                  {current >= 0 ? current : '–'}
                </span>
              </motion.div>
              {current >= 0 && (
                <motion.span
                  key={`label-${current}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-medium"
                  style={{ color: npsSliderColor }}
                >
                  {getNpsLabel(current)}
                </motion.span>
              )}
            </div>

            <div className="relative px-1">
              <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-3 rounded-full overflow-hidden"
                style={{ background: `linear-gradient(to right, ${gradientStops})`, opacity: 0.2 }}
              />
              <input
                type="range"
                min={0}
                max={max}
                value={current >= 0 ? current : Math.round(max / 2)}
                onChange={e => onChange(Number(e.target.value))}
                className="nps-mobile-slider relative w-full h-8 appearance-none cursor-pointer bg-transparent z-10"
                style={{
                  WebkitAppearance: 'none',
                  color: npsSliderColor,
                }}
              />
              <div
                className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-3 rounded-full pointer-events-none"
                style={{
                  background: current >= 0
                    ? `linear-gradient(to right, ${npsSliderColor} ${(current / max) * 100}%, transparent ${(current / max) * 100}%)`
                    : 'transparent',
                }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums px-1">
              {Array.from({ length: max + 1 }).map((_, i) => (
                <span key={i} className={`${current === i ? 'font-bold' : 'opacity-50'}`}
                  style={current === i ? { color: npsSliderColor } : {}}
                >{i}</span>
              ))}
            </div>

            {current < 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: [0, 1, 1, 0.7], y: [8, 0, 0, 0], x: [0, 0, 10, -10] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1 }}
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-2"
              >
                <span>👆</span>
                <span>{dragHint}</span>
              </motion.div>
            )}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>{t(element.npsLowLabel) || 'Nada provável'}</span>
            <span>{t(element.npsHighLabel) || 'Muito provável'}</span>
          </div>
        </div>
      );
    }

    case 'input_yes_no':
      return withFieldHeader(
        <div className="flex gap-3">
          {[
            { key: 'yes', label: 'Sim', emoji: '👍' },
            { key: 'no', label: 'Não', emoji: '👎' },
          ].map(opt => (
            <motion.button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              whileTap={{ scale: 0.95 }}
              animate={value === opt.key ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.2 }}
              className={`flex-1 px-5 py-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-lg font-medium ${
                value === opt.key
                  ? 'border-primary bg-transparent text-foreground shadow-sm'
                  : 'border-border hover:bg-primary/5 hover:border-primary/40 text-foreground'
              }`}
            >
              <Twemoji className="text-xl">{opt.emoji}</Twemoji>
              <span>{opt.label}</span>
            </motion.button>
          ))}
        </div>
      );

    case 'input_multi_select': {
      const selected: string[] = Array.isArray(value) ? value : [];
      const toggleOption = (optId: string) => {
        if (selected.includes(optId)) {
          onChange(selected.filter(id => id !== optId));
        } else {
          onChange([...selected, optId]);
        }
      };
      return withFieldHeader(
        <div className="space-y-2 md:space-y-3">
          {(element.options || []).map((opt, i) => {
            const isSelected = selected.includes(opt.id);
            return (
              <motion.button
                key={opt.id}
                onClick={() => toggleOption(opt.id)}
                whileTap={{ scale: 0.97 }}
                animate={isSelected ? {
                  scale: [1, 1.02, 1],
                  boxShadow: ['0 0 0 0px rgba(44,40,23,0)', '0 0 0 4px rgba(44,40,23,0.15)', '0 0 0 0px rgba(44,40,23,0)'],
                } : {}}
                transition={{ duration: 0.35 }}
                className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                  isSelected
                    ? 'border-[#2C2817] bg-[#2C2817]/5 text-foreground shadow-sm'
                    : 'border-border hover:bg-[#2C2817]/5 hover:border-[#2C2817]/30 text-foreground'
                }`}
              >
                <motion.span
                  className={`h-6 w-6 md:h-7 md:w-7 rounded-md border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817] text-white' : 'border-border text-muted-foreground'
                  }`}
                  animate={isSelected ? { scale: [1, 1.3, 1], rotate: [0, -8, 8, 0] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + letterOffset + i)}
                </motion.span>
                <span className="text-base md:text-lg flex-1">{t(opt.label)}</span>
                <motion.div
                  className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817]' : 'border-border'
                  }`}
                  animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.2 }}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      );
    }

    case 'input_quiz_icon':
      return withFieldHeader(
        <div className="grid grid-cols-2 gap-3">
          {(element.options || []).map((opt) => {
            const selected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.95 }}
                animate={selected ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.2 }}
                className={`relative px-4 py-5 rounded-xl border-2 transition-all flex flex-col items-center gap-2 text-center ${
                  selected
                    ? 'border-primary bg-transparent shadow-sm'
                    : 'border-border hover:bg-primary/5 hover:border-primary/40'
                }`}
              >
                {selected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <Twemoji className="text-3xl">{opt.emoji || '⭐'}</Twemoji>
                <span className="text-sm font-medium">{t(opt.label)}</span>
              </motion.button>
            );
          })}
        </div>
      );

    case 'input_quiz_image':
      return withFieldHeader(
        <div className="grid grid-cols-2 gap-3">
          {(element.options || []).map((opt) => {
            const selected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.95 }}
                animate={selected ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.2 }}
                className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                  selected
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                {selected && (
                  <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                    <Check className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
                <div className="relative">
                  {opt.imageUrl ? (
                    <img src={opt.imageUrl} alt={opt.label} className={`w-full h-28 md:h-36 object-cover transition-opacity ${selected ? 'opacity-90' : ''}`} />
                  ) : (
                    <div className="w-full h-28 md:h-36 bg-muted flex items-center justify-center text-muted-foreground">
                      <span className="text-sm">Sem imagem</span>
                    </div>
                  )}
                  {selected && <div className="absolute inset-0 bg-transparent" />}
                </div>
                <div className={`px-3 py-2 text-sm font-medium text-center`}>{t(opt.label)}</div>
              </motion.button>
            );
          })}
        </div>
      );

    case 'chart':
      return wrapWithStyle(
        <div className={alignClass}>
          <ChartLivePreview
            chartType={element.chartType || 'column'}
            items={element.chartItems || []}
            style={element.chartStyle || {}}
          />
        </div>
      );

    case 'comparative_chart':
      return wrapWithStyle(
        <div className={alignClass}>
          <ComparativeChartPreview
            datasets={element.comparativeDatasets || []}
            labels={element.comparativeLabels || []}
            mode={element.comparativeMode || 'cartesian'}
            style={element.chartStyle}
          />
        </div>
      );

    case 'circular_progress':
      return wrapWithStyle(
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

    case 'timer':
      return wrapWithStyle(
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
      return wrapWithStyle(
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
      return wrapWithStyle(
        <div className={`grid ${cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 w-full`}>
          {bars.map(bar => (
            <ProgressBarColumn
              key={bar.id}
              bar={bar}
              disposition={disposition}
              colBorderWidth={element.progressBarColBorderWidth}
              colBorderStyle={element.progressBarColBorderStyle}
              colBorderColor={element.progressBarColBorderColor}
              colBorderRadius={element.progressBarColBorderRadius}
            />
          ))}
        </div>
      );
    }

    case 'loading':
      return wrapWithStyle(
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
            interactive={true}
            onComplete={() => {
              const action = element.loadingAction || 'none';
              if (action !== 'none' && onNavigate) {
                onNavigate(action as any, element.loadingTargetPageId);
              }
            }}
          />
        </div>
      );

    case 'list':
      return wrapWithStyle(
        <ListPreview
          items={element.listItems || []}
          listStyle={element.listStyleType}
          iconColor={element.listIconColor}
          textColor={element.listTextColor}
          gap={element.listGap}
          fontSize={element.style?.fontSize}
        />
      );

    case 'confetti':
      return (
        <Suspense fallback={null}>
          <ConfettiPreview
            direction={element.confettiDirection || 'top'}
            intensity={element.confettiIntensity || 'explosion'}
            duration={element.confettiDuration || 3000}
            colors={element.confettiColors}
          />
        </Suspense>
      );

    default:
      return null;
  }
}
