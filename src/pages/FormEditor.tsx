import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { Question, FormData, ConditionNodeData, ConditionBranch } from '@/types/form';
import FlowCanvas from '@/components/editor/FlowCanvas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye } from 'lucide-react';
import { useEffect, useCallback } from 'react';

export default function FormEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm, updateForm } = useFormStore();
  const form = getForm(id!);

  useEffect(() => {
    if (!form) navigate('/', { replace: true });
  }, [form, navigate]);

  const handleQuestionChange = useCallback((qId: string, patch: Partial<Question>) => {
    if (!form) return;
    const questions = form.questions.map(q =>
      q.id === qId ? { ...q, ...patch } : q
    );
    updateForm(form.id, { questions });
  }, [form, updateForm]);

  const handleDeleteQuestion = useCallback((qId: string) => {
    if (!form) return;
    // Also remove edges referencing this question
    const nodeId = `q-${qId}`;
    const flowEdges = (form.flowEdges || []).filter(
      e => e.source !== nodeId && e.target !== nodeId
    );
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== nodeId);
    updateForm(form.id, {
      questions: form.questions.filter(q => q.id !== qId),
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  const handleAddQuestion = useCallback((question: Question) => {
    if (!form) return;
    const newNodeId = `q-${question.id}`;
    const sourceId = form.questions.length > 0
      ? `q-${form.questions[form.questions.length - 1].id}`
      : 'start';
    const newEdge = { id: `e-${sourceId}-${newNodeId}`, source: sourceId, target: newNodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    updateForm(form.id, { questions: [...form.questions, question], flowEdges });
  }, [form, updateForm]);

  const handleAddQuestionAfter = useCallback((afterIndex: number, question: Question) => {
    if (!form) return;
    const questions = [...form.questions];
    questions.splice(afterIndex + 1, 0, question);
    const sourceId = afterIndex >= 0 ? `q-${form.questions[afterIndex].id}` : 'start';
    const newNodeId = `q-${question.id}`;
    const newEdge = { id: `e-${sourceId}-${newNodeId}`, source: sourceId, target: newNodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    updateForm(form.id, { questions, flowEdges });
  }, [form, updateForm]);

  const handleConditionAdd = useCallback(() => {
    if (!form) return;
    const cond: ConditionNodeData = {
      id: crypto.randomUUID(),
      label: 'Nova condição',
      branches: [{
        id: crypto.randomUUID(),
        label: 'Caminho 1',
        questionId: form.questions[0]?.id || '',
        operator: 'equals',
        value: '',
      }],
    };
    updateForm(form.id, { conditions: [...(form.conditions || []), cond] });
  }, [form, updateForm]);

  const handleConditionChange = useCallback((cId: string, patch: Partial<ConditionNodeData>) => {
    if (!form) return;
    const conditions = (form.conditions || []).map(c =>
      c.id === cId ? { ...c, ...patch } : c
    );
    updateForm(form.id, { conditions });
  }, [form, updateForm]);

  const handleConditionDelete = useCallback((cId: string) => {
    if (!form) return;
    const nodeId = `c-${cId}`;
    const flowEdges = (form.flowEdges || []).filter(
      e => e.source !== nodeId && e.target !== nodeId && !e.sourceHandle?.includes(cId)
    );
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== nodeId);
    updateForm(form.id, {
      conditions: (form.conditions || []).filter(c => c.id !== cId),
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  const handleFormUpdate = useCallback((patch: Partial<FormData>) => {
    if (!form) return;
    updateForm(form.id, patch);
  }, [form, updateForm]);

  if (!form) return null;

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-3 py-3 px-5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={form.title}
            onChange={e => updateForm(form.id, { title: e.target.value })}
            className="text-base font-semibold border-0 shadow-none focus-visible:ring-0 px-0 max-w-sm bg-transparent"
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
              onClick={() => updateForm(form.id, { status: form.status === 'published' ? 'draft' : 'published' })}
            >
              {form.status === 'published' ? 'Despublicar' : 'Publicar'}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <FlowCanvas
          form={form}
          onQuestionChange={handleQuestionChange}
          onQuestionDelete={handleDeleteQuestion}
          onQuestionAdd={handleAddQuestion}
          onQuestionAddAfter={handleAddQuestionAfter}
          onConditionAdd={handleConditionAdd}
          onConditionChange={handleConditionChange}
          onConditionDelete={handleConditionDelete}
          onFormUpdate={handleFormUpdate}
        />
      </div>
    </div>
  );
}
