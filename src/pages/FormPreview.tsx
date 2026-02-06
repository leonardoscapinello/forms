import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState(1);

  if (!form) return null;

  const totalSteps = form.questions.length;
  const isWelcome = step === -1;
  const isThankYou = step >= totalSteps;
  const currentQuestion = !isWelcome && !isThankYou ? form.questions[step] : null;
  const progress = isWelcome ? 0 : isThankYou ? 100 : ((step + 1) / totalSteps) * 100;

  const goNext = () => { setDirection(1); setStep(s => s + 1); };
  const goBack = () => { setDirection(-1); setStep(s => Math.max(-1, s - 1)); };

  const setAnswer = (value: any) => {
    if (currentQuestion) {
      setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
    }
  };

  const toggleMulti = (optionId: string) => {
    if (!currentQuestion) return;
    const current: string[] = answers[currentQuestion.id] || [];
    setAnswer(
      current.includes(optionId)
        ? current.filter((id: string) => id !== optionId)
        : [...current, optionId]
    );
  };

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
            key={step}
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
              <div className="space-y-10">
                {/* Question header */}
                <div>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-semibold text-primary mt-0.5">{step + 1}</span>
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
                    onNext={goNext}
                  />
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
            {step === totalSteps - 1 ? 'Enviar' : 'OK'}
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
}: {
  question: any;
  value: any;
  onChange: (v: any) => void;
  onToggleMulti: (optionId: string) => void;
  onNext: () => void;
}) {
  const q = question;

  // Text-like inputs — large underline style
  if (['short_text', 'email', 'number', 'phone', 'website', 'address'].includes(q.type)) {
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
            onClick={() => onChange(opt.id)}
            className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
              value === opt.id
                ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                : 'border-border hover:border-primary/40 text-foreground'
            }`}
          >
            <span className={`h-7 w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 ${
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
              onClick={() => onToggleMulti(opt.id)}
              className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                isSelected
                  ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                  : 'border-border hover:border-primary/40 text-foreground'
              }`}
            >
              <span className={`h-7 w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 ${
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
            onClick={() => onChange(item.key)}
            className={`flex-1 px-5 py-4 rounded-xl border-2 text-lg font-medium transition-all flex items-center justify-center gap-3 ${
              value === item.key
                ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                : 'border-border hover:border-primary/40 text-foreground'
            }`}
          >
            <span className={`h-7 w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center ${
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
