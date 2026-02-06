import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { resolveConditionNextNode } from '@/lib/conditionEvaluator';
import PhoneFieldPreview from '@/components/preview/PhoneFieldPreview';
import AddressFieldPreview from '@/components/preview/AddressFieldPreview';
import WebsiteFieldPreview from '@/components/preview/WebsiteFieldPreview';

/** Typeform-style underline input — large, clean */
function TypeformInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-2xl py-3 text-foreground placeholder:text-muted-foreground/40 transition-colors"
    />
  );
}

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm } = useFormStore();
  const form = getForm(id!);
  // Graph-based navigation: track current node ID instead of array index
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null); // null = welcome
  const [nodeHistory, setNodeHistory] = useState<(string | null)[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState(1);
  const [blinkId, setBlinkId] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [showError, setShowError] = useState(false);
  const [finished, setFinished] = useState(false);

  const triggerBlink = useCallback((optId: string) => {
    setBlinkId(optId);
    setTimeout(() => setBlinkId(null), 500);
  }, []);

  // Resolve current question from node ID
  const currentQuestion = useMemo(() => {
    if (!form || !currentNodeId || finished) return null;
    if (currentNodeId.startsWith('q-')) {
      const qId = currentNodeId.replace('q-', '');
      return form.questions.find(q => q.id === qId) || null;
    }
    return null;
  }, [form, currentNodeId, finished]);

  // Count steps by traversing the graph for progress calculation
  const orderedNodeIds = useMemo(() => {
    if (!form?.flowEdges?.length) return form?.questions.map(q => `q-${q.id}`) || [];
    const ids: string[] = [];
    const visited = new Set<string>();
    let node = 'start';
    while (node) {
      if (visited.has(node)) break;
      visited.add(node);
      if (node.startsWith('q-')) ids.push(node);
      const edge = form.flowEdges.find(e =>
        e.source === node && !e.sourceHandle?.startsWith('option-') && !e.sourceHandle?.startsWith('branch-')
      );
      if (edge) node = edge.target;
      else break;
    }
    return ids;
  }, [form]);

  const totalSteps = orderedNodeIds.length;
  const currentStepIndex = currentNodeId ? orderedNodeIds.indexOf(currentNodeId) : -1;
  const isWelcome = currentNodeId === null && !finished;
  const isThankYou = finished;
  const progress = isWelcome ? 0 : isThankYou ? 100 : totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;
  // For display: step number (may not be in orderedNodeIds if reached via routing)
  const displayStepNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : (nodeHistory.filter(n => n !== null).length + 1);

  /** Check if the current answer satisfies the required constraint */
  const isCurrentAnswerValid = useCallback(() => {
    if (!currentQuestion || !currentQuestion.required) return true;
    const answer = answers[currentQuestion.id];
    if (answer === undefined || answer === null || answer === '') return false;
    if (Array.isArray(answer) && answer.length === 0) return false;
    if (typeof answer === 'object' && !Array.isArray(answer)) {
      // contact_info: at least one field filled
      return Object.values(answer).some((v: any) => v && String(v).trim() !== '');
    }
    return true;
  }, [currentQuestion, answers]);

  const triggerShake = useCallback(() => {
    setShaking(true);
    setShowError(true);
    setTimeout(() => setShaking(false), 600);
  }, []);

  /**
   * Follow edges from a given node, recursively resolving condition nodes
   * until we reach a question node or dead-end.
   */
  const walkGraph = useCallback((fromNodeId: string, currentAnswers: Record<string, any>, visited = new Set<string>()): string | null => {
    if (!form || visited.has(fromNodeId)) return null;
    visited.add(fromNodeId);

    let nextNodeId: string | null = null;

    // Per-option routing from question nodes
    if (fromNodeId.startsWith('q-')) {
      const qId = fromNodeId.replace('q-', '');
      const q = form.questions.find(qq => qq.id === qId);
      if (q?.routingMode === 'per_option' && q.options) {
        const answer = currentAnswers[q.id];
        const selectedOption = q.options.find(o => o.id === answer);
        if (selectedOption?.nextNodeId) {
          nextNodeId = selectedOption.nextNodeId;
        } else {
          const optionEdge = form.flowEdges?.find(e =>
            e.source === fromNodeId && e.sourceHandle === `option-${answer}`
          );
          if (optionEdge) nextNodeId = optionEdge.target;
        }
      }
    }

    // Condition nodes: evaluate branches and follow matching branch edge
    if (fromNodeId.startsWith('c-')) {
      const condId = fromNodeId.replace('c-', '');
      const cond = (form.conditions || []).find(c => c.id === condId);
      if (cond) {
        nextNodeId = resolveConditionNextNode(fromNodeId, cond, currentAnswers, form.flowEdges || []);
      }
    }

    // Default edge (if nothing resolved yet)
    if (!nextNodeId) {
      const edge = form.flowEdges?.find(e =>
        e.source === fromNodeId && !e.sourceHandle?.startsWith('option-') && !e.sourceHandle?.startsWith('branch-')
      );
      nextNodeId = edge?.target || null;
    }

    if (!nextNodeId) return null;
    if (nextNodeId.startsWith('q-')) return nextNodeId;
    if (nextNodeId.startsWith('c-')) return walkGraph(nextNodeId, currentAnswers, visited);
    return null;
  }, [form]);

  /** Resolve the next node ID by following edges from the current node */
  const resolveNextNodeId = useCallback((): string | null => {
    if (!form) return null;
    const sourceId = currentNodeId || 'start';
    return walkGraph(sourceId, answers);
  }, [form, currentNodeId, walkGraph, answers]);

  const goNext = useCallback(() => {
    if (currentQuestion && currentQuestion.required && !isCurrentAnswerValid()) {
      triggerShake();
      return;
    }
    setShowError(false);
    setDirection(1);
    const nextId = resolveNextNodeId();
    setNodeHistory(prev => [...prev, currentNodeId]);
    if (nextId && nextId.startsWith('q-')) {
      setCurrentNodeId(nextId);
    } else {
      setFinished(true);
    }
  }, [currentQuestion, isCurrentAnswerValid, triggerShake, resolveNextNodeId, currentNodeId]);

  // Ref to always have the latest goNext for auto-advance timeouts
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  const goBack = useCallback(() => {
    setShowError(false);
    setDirection(-1);
    if (finished) {
      setFinished(false);
      return;
    }
    setNodeHistory(prev => {
      const copy = [...prev];
      const prevNode = copy.pop();
      if (prevNode === undefined) return prev;
      setCurrentNodeId(prevNode);
      return copy;
    });
  }, [finished]);

  const setAnswer = useCallback((value: any) => {
    if (currentQuestion) {
      setShowError(false);
      setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
    }
  }, [currentQuestion]);

  const toggleMulti = useCallback((optionId: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => {
      const current: string[] = prev[currentQuestion.id] || [];
      return {
        ...prev,
        [currentQuestion.id]: current.includes(optionId)
          ? current.filter((id: string) => id !== optionId)
          : [...current, optionId],
      };
    });
  }, [currentQuestion]);

  // Keyboard navigation: arrows up/down + letter shortcuts A-H
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'ArrowDown' || (e.key === 'Enter' && !isInput)) {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goBack();
        return;
      }

      // Letter shortcuts for choice fields
      if (currentQuestion && !isInput) {
        const letter = e.key.toLowerCase();
        const letterIndex = letter.charCodeAt(0) - 97; // a=0, b=1, ...
        if (letterIndex >= 0 && letterIndex <= 7) {
          const options = currentQuestion.options || [];
          if (letterIndex < options.length) {
            const opt = options[letterIndex];
            triggerBlink(opt.id);
            if (currentQuestion.type === 'single_choice' || currentQuestion.type === 'yes_no') {
              setAnswer(opt.id);
              setTimeout(() => goNext(), 500);
            } else if (currentQuestion.type === 'multiple_choice') {
              toggleMulti(opt.id);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentQuestion, goNext, goBack, setAnswer, toggleMulti, triggerBlink]);

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
            key={currentNodeId ?? (finished ? 'end' : 'welcome')}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-full max-w-2xl"
          >
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

            {currentQuestion && (
              <div className={`space-y-10 ${shaking ? 'animate-shake' : ''}`}>
                {/* Question header */}
                <div>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-semibold text-primary mt-0.5">{displayStepNumber}</span>
                    <span className="text-2xl font-semibold text-primary mt-0.5">→</span>
                    <div>
                      <h2 className="text-2xl font-semibold text-foreground leading-snug">
                        {currentQuestion.title || 'Sem título'}
                        {currentQuestion.required && <span className="text-destructive ml-1">*</span>}
                      </h2>
                      {currentQuestion.description && (
                        <p className="text-base text-muted-foreground mt-2">
                          {currentQuestion.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Field area */}
                <div className="pl-14">
                  <FieldRenderer
                    question={currentQuestion}
                    value={answers[currentQuestion.id]}
                    onChange={setAnswer}
                    onToggleMulti={toggleMulti}
                    onNext={() => goNextRef.current()}
                    blinkId={blinkId}
                    triggerBlink={triggerBlink}
                  />

                  {/* Required field error */}
                  {showError && currentQuestion.required && !isCurrentAnswerValid() && (
                    <p className="mt-4 text-sm text-destructive flex items-center gap-2 animate-fade-in">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                      Este campo é obrigatório
                    </p>
                  )}
                </div>
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
            {resolveNextNodeId() === null || !resolveNextNodeId()?.startsWith('q-') ? 'Enviar' : 'OK'}
            <Check className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Renders the appropriate field UI based on question type — Typeform style */
function FieldRenderer({
  question,
  value,
  onChange,
  onToggleMulti,
  onNext,
  blinkId,
  triggerBlink,
}: {
  question: any;
  value: any;
  onChange: (v: any) => void;
  onToggleMulti: (optionId: string) => void;
  onNext: () => void;
  blinkId: string | null;
  triggerBlink: (id: string) => void;
}) {
  const q = question;

  const handleSelect = useCallback((optId: string, selectFn: () => void, autoAdvance = false) => {
    triggerBlink(optId);
    selectFn();
    if (autoAdvance) {
      setTimeout(() => onNext(), 500); // advance after blink animation completes
    }
  }, [triggerBlink, onNext]);

  // Phone — with DDI selector
  if (q.type === 'phone') {
    return <PhoneFieldPreview value={value} onChange={onChange} />;
  }

  // Address — with country + CEP auto-fill
  if (q.type === 'address') {
    return <AddressFieldPreview value={value} onChange={onChange} />;
  }

  // Website — with URL validation
  if (q.type === 'website') {
    return <WebsiteFieldPreview value={value} onChange={onChange} placeholder={q.placeholder} />;
  }

  // Text-like inputs — large underline style
  if (['short_text', 'email', 'number'].includes(q.type)) {
    return (
      <TypeformInput
        type={q.type === 'email' ? 'email' : q.type === 'number' ? 'number' : 'text'}
        value={value || ''}
        onChange={onChange}
        placeholder={q.placeholder || 'Digite sua resposta aqui...'}
        autoFocus
      />
    );
  }

  if (q.type === 'long_text') {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={q.placeholder || 'Digite sua resposta aqui...'}
        rows={3}
        className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-2xl py-3 text-foreground placeholder:text-muted-foreground/40 transition-colors resize-none"
        autoFocus
      />
    );
  }

  // Contact info — stacked underline fields (Typeform style, NOT a table)
  if (q.type === 'contact_info') {
    const fields = [
      { key: 'firstName', label: 'Nome', placeholder: 'Jane' },
      { key: 'lastName', label: 'Sobrenome', placeholder: 'Smith' },
      { key: 'phone', label: 'Telefone', placeholder: '(11) 99999-0000' },
      { key: 'email', label: 'Email', placeholder: 'nome@exemplo.com' },
      { key: 'company', label: 'Empresa', placeholder: 'Acme Corporation' },
    ];
    const data = value || {};
    return (
      <div className="space-y-6">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {f.label}
            </label>
            <input
              value={data[f.key] || ''}
              onChange={e => onChange({ ...data, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-xl py-2 mt-1 text-foreground placeholder:text-muted-foreground/40 transition-colors"
            />
          </div>
        ))}
      </div>
    );
  }

  // Single choice — Typeform pill buttons with letter shortcuts
  if (q.type === 'single_choice') {
    return (
      <div className="space-y-3">
        {(q.options || []).map((opt: any, i: number) => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id, () => onChange(opt.id), true)}
            className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
              blinkId === opt.id ? 'animate-option-blink' :
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
  }

  // Multiple choice
  if (q.type === 'multiple_choice') {
    const selected: string[] = value || [];
    return (
      <div className="space-y-3">
        {(q.options || []).map((opt: any, i: number) => {
          const isSelected = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id, () => onToggleMulti(opt.id))}
              className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                blinkId === opt.id ? 'animate-option-blink' :
                isSelected
                  ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                  : 'border-border hover:border-primary/40 text-foreground'
              }`}
            >
              <span className={`h-7 w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
              }`}>
                {isSelected ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + i)}
              </span>
              <span className="text-lg">{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown
  if (q.type === 'dropdown') {
    return (
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-2xl py-3 text-foreground transition-colors"
      >
        <option value="">Selecione...</option>
        {(q.options || []).map((opt: any) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    );
  }

  // Yes/No
  if (q.type === 'yes_no') {
    return (
      <div className="flex gap-4">
        {[{ key: 'Sim', letter: 'S' }, { key: 'Não', letter: 'N' }].map(item => (
          <button
            key={item.key}
            onClick={() => handleSelect(item.key, () => onChange(item.key), true)}
            className={`flex-1 px-5 py-4 rounded-xl border-2 text-lg font-medium transition-all flex items-center justify-center gap-3 ${
              blinkId === item.key ? 'animate-option-blink' :
              value === item.key
                ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                : 'border-border hover:border-primary/40 text-foreground'
            }`}
          >
            <span className={`h-7 w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center transition-all ${
              value === item.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
            }`}>
              {item.letter}
            </span>
            {item.key}
          </button>
        ))}
      </div>
    );
  }

  // Legal / Checkbox
  if (q.type === 'legal' || q.type === 'checkbox') {
    return (
      <button onClick={() => onChange(!value)} className="flex items-center gap-4 text-left group">
        <div className={`h-7 w-7 rounded-lg border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
          value ? 'border-primary bg-primary' : 'border-border group-hover:border-primary/40'
        }`}>
          {value && <Check className="h-4 w-4 text-primary-foreground" />}
        </div>
        <span className="text-lg text-foreground">
          {q.type === 'legal' ? 'Aceito os termos e condições' : 'Marcar opção'}
        </span>
      </button>
    );
  }

  // Rating
  if (q.type === 'rating') {
    return (
      <div className="flex gap-3">
        {Array.from({ length: q.maxRating || 5 }).map((_, i) => (
          <button
            key={i}
            onClick={() => onChange(i + 1)}
            className={`h-14 w-14 rounded-xl border-2 text-lg font-medium transition-all ${
              value === i + 1
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border hover:border-primary/40 text-foreground'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    );
  }

  // NPS / Opinion Scale
  if (q.type === 'nps' || q.type === 'opinion_scale') {
    const min = q.scaleMin ?? 0;
    const max = q.scaleMax ?? 10;
    return (
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {Array.from({ length: max - min + 1 }).map((_, i) => {
            const val = min + i;
            return (
              <button
                key={val}
                onClick={() => onChange(val)}
                className={`flex-1 h-12 rounded-xl border-2 text-sm font-medium transition-all ${
                  value === val
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border hover:border-primary/40 text-foreground'
                }`}
              >
                {val}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{q.labelMin}</span>
          <span>{q.labelMax}</span>
        </div>
      </div>
    );
  }

  // Ranking
  if (q.type === 'ranking') {
    return (
      <div className="space-y-3">
        {(q.options || []).map((opt: any, i: number) => (
          <div key={opt.id} className="flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border text-foreground">
            <span className="text-sm font-bold text-muted-foreground w-6">{i + 1}.</span>
            <span className="text-lg">{opt.label}</span>
          </div>
        ))}
      </div>
    );
  }

  // Date
  if (q.type === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-2xl py-3 text-foreground transition-colors"
      />
    );
  }

  // File upload
  if (q.type === 'file_upload') {
    return (
      <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/40 transition-colors cursor-pointer">
        <p className="text-lg text-muted-foreground">Arraste ou clique para enviar arquivo</p>
        <p className="text-sm text-muted-foreground/60 mt-2">Máx: {q.maxFileSize || 10}MB</p>
      </div>
    );
  }

  // Statement
  if (q.type === 'statement') {
    return (
      <Button onClick={onNext} className="text-base px-6 py-3 h-auto">
        {q.buttonText || 'Continuar'}
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    );
  }

  return null;
}
