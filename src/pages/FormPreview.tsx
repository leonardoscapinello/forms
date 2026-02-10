import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Check, X, Star, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FunnelPage } from '@/types/form';
import { PageElement } from '@/types/pageElements';

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm } = useFormStore();
  const form = getForm(id!);

  const [currentPageIndex, setCurrentPageIndex] = useState<number | null>(null); // null = welcome
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState(1);
  const [finished, setFinished] = useState(false);

  const pages = form?.pages || [];
  const currentPage = currentPageIndex !== null ? pages[currentPageIndex] : null;

  const isWelcome = currentPageIndex === null && !finished;
  const isThankYou = finished;
  const totalSteps = pages.length;
  const progress = isWelcome ? 0 : isThankYou ? 100 : totalSteps > 0 ? (((currentPageIndex || 0) + 1) / totalSteps) * 100 : 0;

  const goNext = useCallback(() => {
    setDirection(1);
    if (currentPageIndex === null) {
      if (pages.length > 0) {
        setCurrentPageIndex(0);
      } else {
        setFinished(true);
      }
      return;
    }
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else {
      setFinished(true);
    }
  }, [currentPageIndex, pages.length]);

  const goBack = useCallback(() => {
    setDirection(-1);
    if (finished) {
      setFinished(false);
      return;
    }
    if (currentPageIndex !== null && currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    } else {
      setCurrentPageIndex(null);
    }
  }, [currentPageIndex, finished]);

  const setAnswer = useCallback((elementId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [elementId]: value }));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Enter' && !isInput) {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext]);

  if (!form) return null;

  const variants = {
    enter: (d: number) => ({ y: d > 0 ? 40 : -40, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (d: number) => ({ y: d > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Close */}
      <div className="absolute top-4 right-4 z-20">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/editor/${id}`)}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Progress */}
      {!isWelcome && !isThankYou && (
        <div className="px-8 pt-6">
          <Progress value={progress} className="h-1" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentPageIndex ?? (finished ? 'end' : 'welcome')}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-full max-w-2xl mx-auto"
          >
            {/* Welcome */}
            {isWelcome && (
              <div className="text-center space-y-5">
                <h1 className="text-4xl font-bold text-foreground">
                  {form.welcomeTitle || form.title}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {form.welcomeDescription || form.description || 'Clique em começar para iniciar.'}
                </p>
                <Button size="lg" onClick={goNext} className="mt-8 text-base px-8 py-3 h-auto">
                  Começar
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Thank You */}
            {isThankYou && (
              <div className="text-center space-y-5">
                <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Check className="h-10 w-10 text-primary" />
                </div>
                <h1 className="text-4xl font-bold text-foreground">
                  {form.thankYouTitle || 'Obrigado!'}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {form.thankYouDescription || 'Suas respostas foram enviadas com sucesso.'}
                </p>
              </div>
            )}

            {/* Page content */}
            {currentPage && (
              <div className="space-y-8">
                {currentPage.elements.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Página sem elementos</p>
                ) : (
                  currentPage.elements.map((el, elIdx) => {
                    const isField = el.type.startsWith('input_');
                    const fieldIndex = isField
                      ? currentPage.elements.slice(0, elIdx + 1).filter(e => e.type.startsWith('input_')).length
                      : elIdx + 1;
                    return (
                      <InteractiveElement
                        key={el.id}
                        element={el}
                        value={answers[el.id]}
                        onChange={v => setAnswer(el.id, v)}
                        stepNumber={fieldIndex}
                      />
                    );
                  })
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      {!isWelcome && !isThankYou && (
        <div className="px-8 py-6 flex justify-between items-center">
          <Button variant="ghost" onClick={goBack} className="text-sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={goNext} className="text-sm px-6">
            {currentPageIndex !== null && currentPageIndex >= pages.length - 1 ? 'Enviar' : 'OK'}
            <Check className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Renders an interactive page element for the preview */
function InteractiveElement({
  element,
  value,
  onChange,
  stepNumber,
}: {
  element: PageElement;
  value: any;
  onChange: (v: any) => void;
  stepNumber: number;
}) {
  const { type, style } = element;
  const alignClass = style?.textAlign === 'center' ? 'text-center' : style?.textAlign === 'right' ? 'text-right' : 'text-left';

  /** Wraps form fields with the "N → enunciado" Typeform header + description */
  const withFieldHeader = (content: React.ReactNode) => (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl font-semibold text-primary mt-0.5">{stepNumber}</span>
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
      ) : null;

    case 'button':
      return (
        <div className={alignClass}>
          <Button style={{ backgroundColor: style?.backgroundColor, borderRadius: style?.borderRadius }}>
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
      ) : null;

    case 'spacer':
      return <div style={{ height: element.height || 40 }} />;

    // ─── Interactive form fields (with "N → label" header) ──────────────────
    case 'input_text':
    case 'input_email':
    case 'input_phone':
    case 'input_address':
      return withFieldHeader(
        <input
          type={type === 'input_email' ? 'email' : type === 'input_phone' ? 'tel' : 'text'}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={element.placeholder || 'Digite aqui...'}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors"
          autoFocus
        />
      );

    case 'input_checkbox':
      return withFieldHeader(
        <button onClick={() => onChange(!value)} className="flex items-center gap-4 text-left group">
          <div className={`h-7 w-7 rounded-lg border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
            value ? 'border-primary bg-primary' : 'border-border group-hover:border-primary/40'
          }`}>
            {value && <Check className="h-4 w-4 text-primary-foreground" />}
          </div>
          <span className="text-lg text-foreground">Aceitar</span>
        </button>
      );

    case 'input_select':
      return withFieldHeader(
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-xl py-2 text-foreground transition-colors"
        >
          <option value="">{element.placeholder || 'Selecione...'}</option>
          {(element.options || []).map(opt => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      );

    case 'input_radio':
      return withFieldHeader(
        <div className="space-y-3">
          {(element.options || []).map((opt, i) => (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                value === opt.id
                  ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                  : 'border-border hover:border-primary/40 text-foreground'
              }`}
            >
              <span className={`h-7 w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                value === opt.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
              }`}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-lg">{opt.label}</span>
            </button>
          ))}
        </div>
      );

    case 'input_rating': {
      const max = element.maxRating || 5;
      const current = value || 0;
      return withFieldHeader(
        <div className="flex gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <button
              key={i}
              onClick={() => onChange(i + 1)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`h-8 w-8 transition-colors ${
                  i < current ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'
                }`}
              />
            </button>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}
