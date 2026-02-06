import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { Question } from '@/types/form';
import QuestionCard from '@/components/editor/QuestionCard';
import AddQuestionMenu from '@/components/editor/AddQuestionMenu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function FormEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm, updateForm } = useFormStore();
  const form = getForm(id!);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  useEffect(() => {
    if (!form) navigate('/', { replace: true });
  }, [form, navigate]);

  if (!form) return null;

  const handleQuestionChange = (qId: string, patch: Partial<Question>) => {
    const questions = form.questions.map(q =>
      q.id === qId ? { ...q, ...patch } : q
    );
    updateForm(form.id, { questions });
  };

  const handleDeleteQuestion = (qId: string) => {
    updateForm(form.id, { questions: form.questions.filter(q => q.id !== qId) });
  };

  const handleAddQuestion = (question: Question) => {
    updateForm(form.id, { questions: [...form.questions, question] });
    setActiveQuestionId(question.id);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex items-center gap-3 py-3 px-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={form.title}
            onChange={e => updateForm(form.id, { title: e.target.value })}
            className="text-lg font-semibold border-0 shadow-none focus-visible:ring-0 px-0 max-w-md bg-transparent"
            placeholder="Título do formulário"
          />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/preview/${form.id}`)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Visualizar
            </Button>
            <Button
              size="sm"
              className="gradient-primary border-0 text-primary-foreground hover:opacity-90"
              onClick={() => updateForm(form.id, { status: form.status === 'published' ? 'draft' : 'published' })}
            >
              {form.status === 'published' ? 'Despublicar' : 'Publicar'}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-3 mb-6">
          {form.questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              isActive={activeQuestionId === q.id}
              onSelect={() => setActiveQuestionId(q.id)}
              onChange={patch => handleQuestionChange(q.id, patch)}
              onDelete={() => handleDeleteQuestion(q.id)}
            />
          ))}
        </div>
        <AddQuestionMenu onAdd={handleAddQuestion} />
      </main>
    </div>
  );
}
