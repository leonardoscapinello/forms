import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { Question, FormData, ConditionNodeData, createDefaultConditionGroup } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import FlowCanvas from '@/components/editor/FlowCanvas';
import QuestionSidePanel from '@/components/editor/QuestionSidePanel';
import FormResponses from '@/components/editor/FormResponses';
import PageBuilder from '@/components/editor/page-builder/PageBuilder';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Layout } from 'lucide-react';
import { useEffect, useCallback, useState } from 'react';

type EditorTab = 'workflow' | 'page' | 'responses';

export default function FormEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm, updateForm } = useFormStore();
  const form = getForm(id!);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('workflow');

  useEffect(() => {
    if (!form) navigate('/', { replace: true });
  }, [form, navigate]);

  const selectedQuestion = form?.questions.find(q => q.id === selectedQuestionId) || null;
  const selectedIndex = form?.questions.findIndex(q => q.id === selectedQuestionId) ?? -1;

  const handleQuestionChange = useCallback((qId: string, patch: Partial<Question>) => {
    if (!form) return;
    const questions = form.questions.map(q =>
      q.id === qId ? { ...q, ...patch } : q
    );
    updateForm(form.id, { questions });
  }, [form, updateForm]);

  const handleDeleteQuestion = useCallback((qId: string) => {
    if (!form) return;
    if (selectedQuestionId === qId) setSelectedQuestionId(null);
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
  }, [form, updateForm, selectedQuestionId]);

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

  const handleAddQuestionAtPosition = useCallback((question: Question, position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const newNodeId = `q-${question.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${newNodeId}`, source: sourceNodeId, sourceHandle, target: newNodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: newNodeId, x: position.x, y: position.y }];
    updateForm(form.id, { questions: [...form.questions, question], flowEdges, nodePositions });
  }, [form, updateForm]);

  const handleConditionAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const cond: ConditionNodeData = {
      id: crypto.randomUUID(),
      label: 'Nova condição',
      branches: [{
        id: crypto.randomUUID(),
        label: 'Caminho 1',
        conditionGroup: createDefaultConditionGroup(form.questions[0]?.id || ''),
      }],
    };
    const nodeId = `c-${cond.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, { conditions: [...(form.conditions || []), cond], flowEdges, nodePositions });
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

          {/* Tabs */}
          <div className="flex items-center gap-1 ml-6">
            {(['workflow', 'page', 'responses'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {tab === 'workflow' ? 'Workflow' : tab === 'page' ? 'Página' : 'Respostas'}
              </button>
            ))}
          </div>

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

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'workflow' && (
          <>
            <div className="flex-1 overflow-hidden">
              <FlowCanvas
                form={form}
                onQuestionChange={handleQuestionChange}
                onQuestionDelete={handleDeleteQuestion}
                onQuestionAdd={handleAddQuestion}
                onQuestionAddAtPosition={handleAddQuestionAtPosition}
                onConditionAddAtPosition={handleConditionAddAtPosition}
                onConditionChange={handleConditionChange}
                onConditionDelete={handleConditionDelete}
                onFormUpdate={handleFormUpdate}
                onQuestionSelect={setSelectedQuestionId}
              />
            </div>

            {/* Side panel */}
            {selectedQuestion && (
              <QuestionSidePanel
                key={selectedQuestion.id}
                question={selectedQuestion}
                index={selectedIndex}
                onChange={patch => handleQuestionChange(selectedQuestion.id, patch)}
                onDelete={() => handleDeleteQuestion(selectedQuestion.id)}
                onClose={() => setSelectedQuestionId(null)}
                routingTargets={
                  form.questions
                    .filter(q => q.id !== selectedQuestion.id)
                    .map((q, i) => ({ id: `q-${q.id}`, label: `#${i + 1} ${q.title || 'Sem título'}` }))
                    .concat(
                      (form.conditions || []).map(c => ({ id: `c-${c.id}`, label: `⑃ ${c.label}` }))
                    )
                }
              />
            )}
          </>
        )}

        {activeTab === 'page' && (
          <PageBuilder
            elements={selectedQuestion?.pageElements || []}
            onChange={(elements: PageElement[]) => {
              if (selectedQuestion) {
                handleQuestionChange(selectedQuestion.id, { pageElements: elements });
              }
            }}
          />
        )}

        {activeTab === 'responses' && (
          <FormResponses form={form} />
        )}
      </div>
    </div>
  );
}
