import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm } = useFormStore();
  const form = getForm(id!);
  const [step, setStep] = useState(-1); // -1 = welcome, questions, then thank you
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState(1);

  if (!form) return null;

  const totalSteps = form.questions.length;
  const isWelcome = step === -1;
  const isThankYou = step >= totalSteps;
  const currentQuestion = !isWelcome && !isThankYou ? form.questions[step] : null;
  const progress = isWelcome ? 0 : isThankYou ? 100 : ((step + 1) / totalSteps) * 100;

  const goNext = () => {
    setDirection(1);
    setStep(s => s + 1);
  };
  const goBack = () => {
    setDirection(-1);
    setStep(s => Math.max(-1, s - 1));
  };

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
      {/* Close button */}
      <div className="absolute top-4 right-4 z-20">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/editor/${id}`)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress */}
      {!isWelcome && !isThankYou && (
        <div className="px-6 pt-4">
          <Progress value={progress} className="h-1" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-full max-w-lg"
          >
            {isWelcome && (
              <div className="text-center space-y-4">
                <h1 className="text-3xl font-bold text-foreground">
                  {form.welcomeTitle || form.title}
                </h1>
                <p className="text-muted-foreground">
                  {form.welcomeDescription || form.description || 'Clique em começar para iniciar.'}
                </p>
                <Button size="lg" onClick={goNext} className="mt-6">
                  Começar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {isThankYou && (
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">
                  {form.thankYouTitle || 'Obrigado!'}
                </h1>
                <p className="text-muted-foreground">
                  {form.thankYouDescription || 'Suas respostas foram enviadas com sucesso.'}
                </p>
              </div>
            )}

            {currentQuestion && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm text-muted-foreground">{step + 1}.</span>
                    <h2 className="text-xl font-semibold text-foreground">
                      {currentQuestion.title || 'Sem título'}
                      {currentQuestion.required && <span className="text-destructive ml-1">*</span>}
                    </h2>
                  </div>
                  {currentQuestion.description && (
                    <p className="text-sm text-muted-foreground ml-5">
                      {currentQuestion.description}
                    </p>
                  )}
                </div>

                <div className="ml-5">
                  {/* Text-like inputs */}
                  {(['short_text', 'email', 'number', 'phone', 'website', 'address'].includes(currentQuestion.type)) && (
                    <Input
                      type={currentQuestion.type === 'email' ? 'email' : currentQuestion.type === 'number' ? 'number' : 'text'}
                      value={answers[currentQuestion.id] || ''}
                      onChange={e => setAnswer(e.target.value)}
                      placeholder={currentQuestion.placeholder || 'Digite sua resposta...'}
                      className="text-base border-0 border-b rounded-none px-0 shadow-none focus-visible:ring-0"
                      autoFocus
                    />
                  )}

                  {currentQuestion.type === 'long_text' && (
                    <Textarea
                      value={answers[currentQuestion.id] || ''}
                      onChange={e => setAnswer(e.target.value)}
                      placeholder={currentQuestion.placeholder || 'Digite sua resposta...'}
                      rows={4}
                      className="text-base"
                      autoFocus
                    />
                  )}

                  {/* Contact info — multiple fields */}
                  {currentQuestion.type === 'contact_info' && (
                    <div className="space-y-3">
                      {['name', 'email', 'phone'].map(field => (
                        <Input
                          key={field}
                          value={(answers[currentQuestion.id] || {})[field] || ''}
                          onChange={e => setAnswer({ ...(answers[currentQuestion.id] || {}), [field]: e.target.value })}
                          placeholder={field === 'name' ? 'Nome' : field === 'email' ? 'Email' : 'Telefone'}
                          className="text-base border-0 border-b rounded-none px-0 shadow-none focus-visible:ring-0"
                        />
                      ))}
                    </div>
                  )}

                  {/* Single choice */}
                  {currentQuestion.type === 'single_choice' && (
                    <div className="space-y-2">
                      {(currentQuestion.options || []).map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setAnswer(opt.id)}
                          className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                            answers[currentQuestion.id] === opt.id
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border hover:border-primary/40 text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Multiple choice */}
                  {currentQuestion.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      {(currentQuestion.options || []).map(opt => {
                        const selected = (answers[currentQuestion.id] || []).includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => toggleMulti(opt.id)}
                            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                              selected
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border hover:border-primary/40 text-foreground'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Dropdown */}
                  {currentQuestion.type === 'dropdown' && (
                    <select
                      value={answers[currentQuestion.id] || ''}
                      onChange={e => setAnswer(e.target.value)}
                      className="w-full text-base border border-border rounded-lg px-4 py-3 bg-card text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">Selecione...</option>
                      {(currentQuestion.options || []).map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  )}

                  {/* Yes/No */}
                  {currentQuestion.type === 'yes_no' && (
                    <div className="flex gap-3">
                      {['Sim', 'Não'].map(label => (
                        <button
                          key={label}
                          onClick={() => setAnswer(label)}
                          className={`flex-1 px-4 py-3 rounded-lg border text-base font-medium transition-colors ${
                            answers[currentQuestion.id] === label
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border hover:border-primary/40 text-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Legal / Checkbox */}
                  {(currentQuestion.type === 'legal' || currentQuestion.type === 'checkbox') && (
                    <button
                      onClick={() => setAnswer(!answers[currentQuestion.id])}
                      className="flex items-center gap-3 text-left"
                    >
                      <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                        answers[currentQuestion.id]
                          ? 'border-primary bg-primary'
                          : 'border-border'
                      }`}>
                        {answers[currentQuestion.id] && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="text-base text-foreground">
                        {currentQuestion.type === 'legal' ? 'Aceito os termos e condições' : 'Marcar opção'}
                      </span>
                    </button>
                  )}

                  {/* Rating */}
                  {currentQuestion.type === 'rating' && (
                    <div className="flex gap-2">
                      {Array.from({ length: currentQuestion.maxRating || 5 }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setAnswer(i + 1)}
                          className={`h-12 w-12 rounded-lg border text-sm font-medium transition-colors ${
                            answers[currentQuestion.id] === i + 1
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:border-primary/40 text-foreground'
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* NPS / Opinion Scale */}
                  {(currentQuestion.type === 'nps' || currentQuestion.type === 'opinion_scale') && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {Array.from({ length: (currentQuestion.scaleMax || 10) - (currentQuestion.scaleMin || 0) + 1 }).map((_, i) => {
                          const val = (currentQuestion.scaleMin || 0) + i;
                          return (
                            <button
                              key={val}
                              onClick={() => setAnswer(val)}
                              className={`flex-1 h-10 rounded border text-sm font-medium transition-colors ${
                                answers[currentQuestion.id] === val
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border hover:border-primary/40 text-foreground'
                              }`}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{currentQuestion.labelMin}</span>
                        <span>{currentQuestion.labelMax}</span>
                      </div>
                    </div>
                  )}

                  {/* Ranking */}
                  {currentQuestion.type === 'ranking' && (
                    <div className="space-y-2">
                      {(currentQuestion.options || []).map((opt, i) => (
                        <div key={opt.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border text-foreground">
                          <span className="text-sm font-medium text-muted-foreground">{i + 1}.</span>
                          <span className="text-base">{opt.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Date */}
                  {currentQuestion.type === 'date' && (
                    <Input
                      type="date"
                      value={answers[currentQuestion.id] || ''}
                      onChange={e => setAnswer(e.target.value)}
                      className="text-base w-56"
                    />
                  )}

                  {/* File upload */}
                  {currentQuestion.type === 'file_upload' && (
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                      <p className="text-muted-foreground">Arraste ou clique para enviar arquivo</p>
                      <p className="text-xs text-muted-foreground mt-1">Máx: {currentQuestion.maxFileSize || 10}MB</p>
                    </div>
                  )}

                  {/* Statement — just a continue button, no input */}
                  {currentQuestion.type === 'statement' && (
                    <Button onClick={goNext} className="mt-2">
                      {currentQuestion.buttonText || 'Continuar'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      {!isWelcome && !isThankYou && (
        <div className="px-6 py-4 flex justify-between">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button size="sm" onClick={goNext}>
            {step === totalSteps - 1 ? 'Enviar' : 'Continuar'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
