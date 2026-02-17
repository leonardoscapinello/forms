import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FunnelPage, FunnelPageStyle, FormData, FormVariable, ConditionNodeData, createDefaultConditionGroup, createDefaultFunnelPage, VariableOpNodeData, IntegrationNodeData } from '@/types/form';
import { PageElement, createDefaultPageElement } from '@/types/pageElements';
import FlowCanvas from '@/components/editor/FlowCanvas';
import PageBuilder from '@/components/editor/page-builder/PageBuilder';
import PageListPanel from '@/components/editor/PageListPanel';
import FormResponses from '@/components/editor/FormResponses';
import CollaboratorAvatars from '@/components/editor/collaboration/CollaboratorAvatars';
import CursorOverlay from '@/components/editor/collaboration/CursorOverlay';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, ChevronRight, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useEffect, useCallback, useState } from 'react';

type EditorView = 'pages' | 'workflow' | 'responses';

export default function FormEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm, updateForm, getSaveStatus, getLastSavedAt } = useFormStore();
  const form = getForm(id!);
  const saveStatus = getSaveStatus(id!);
  const lastSavedAt = getLastSavedAt(id!);
  const [editorView, setEditorView] = useState<EditorView>('pages');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [editingThankYou, setEditingThankYou] = useState(false);

  const {
    collaborators,
    lockElement,
    unlockElement,
    broadcastCursor,
    isLockedByOther,
  } = useRealtimeCollaboration({
    formId: id!,
    currentPageId: editingPageId,
  });

  useEffect(() => {
    if (!form) navigate('/', { replace: true });
  }, [form, navigate]);

  // Auto-select first page when switching to pages tab
  useEffect(() => {
    if (editorView === 'pages' && !editingPageId && !editingWelcome && !editingThankYou && form?.pages?.length) {
      setEditingPageId(form.pages[0].id);
    }
  }, [editorView, editingPageId, editingWelcome, editingThankYou, form?.pages]);

  const editingPage = (editingWelcome || editingThankYou) ? null : (form?.pages?.find(p => p.id === editingPageId) || null);
  const editingPageIndex = form?.pages?.findIndex(p => p.id === editingPageId) ?? -1;

  // Welcome page data
  const welcomePage = form?.welcomePage || {
    id: 'welcome',
    title: 'Tela de início',
    elements: [],
    pageStyle: form?.globalPageStyle,
  };

  // Thank you page data
  const thankYouPage = form?.thankYouPage || {
    id: 'thank-you',
    title: 'Tela de obrigado',
    elements: [],
    pageStyle: form?.globalPageStyle,
  };

  // ---- Page CRUD ----

  const handleAddPage = useCallback(() => {
    if (!form) return;
    const page = createDefaultFunnelPage(`Página ${(form.pages?.length || 0) + 1}`);
    const pages = [...(form.pages || []), page];
    updateForm(form.id, { pages });
    setEditingPageId(page.id);
  }, [form, updateForm]);

  const handleDeletePage = useCallback((pageId: string) => {
    if (!form) return;
    if (editingPageId === pageId) {
      const remaining = (form.pages || []).filter(p => p.id !== pageId);
      setEditingPageId(remaining[0]?.id || null);
    }
    const nodeId = `p-${pageId}`;
    const flowEdges = (form.flowEdges || []).filter(e => e.source !== nodeId && e.target !== nodeId);
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== nodeId);
    updateForm(form.id, {
      pages: (form.pages || []).filter(p => p.id !== pageId),
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm, editingPageId]);

  const handlePageChange = useCallback((pageId: string, patch: Partial<FunnelPage>) => {
    if (!form) return;
    const pages = (form.pages || []).map(p =>
      p.id === pageId ? { ...p, ...patch } : p
    );
    updateForm(form.id, { pages });
  }, [form, updateForm]);

  const handleRenamePage = useCallback((pageId: string, title: string) => {
    handlePageChange(pageId, { title });
  }, [handlePageChange]);

  // ---- Workflow: page select (double-click opens page builder) ----

  const handlePageSelectFromWorkflow = useCallback((pageId: string) => {
    setEditingPageId(pageId);
    setEditorView('pages');
  }, []);

  // ---- Workflow: add page at position ----

  const handlePageAddAtPosition = useCallback((page: FunnelPage, position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const newNodeId = `p-${page.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${newNodeId}`, source: sourceNodeId, sourceHandle, target: newNodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: newNodeId, x: position.x, y: position.y }];
    updateForm(form.id, { pages: [...(form.pages || []), page], flowEdges, nodePositions });
  }, [form, updateForm]);

  // ---- Conditions ----

  const handleConditionAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const cond: ConditionNodeData = {
      id: crypto.randomUUID(),
      label: 'Nova condição',
      branches: [{
        id: crypto.randomUUID(),
        label: 'Caminho 1',
        conditionGroup: createDefaultConditionGroup(form.questions?.[0]?.id || ''),
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

  // ---- VariableOpNode CRUD ----

  const handleVariableOpAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const vop: VariableOpNodeData = {
      id: crypto.randomUUID(),
      label: 'Operação',
      operations: [],
    };
    const nodeId = `vo-${vop.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, {
      variableOpNodes: [...(form.variableOpNodes || []), vop],
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  const handleVariableOpChange = useCallback((nodeId: string, patch: Partial<VariableOpNodeData>) => {
    if (!form) return;
    const variableOpNodes = (form.variableOpNodes || []).map(v =>
      v.id === nodeId ? { ...v, ...patch } : v
    );
    updateForm(form.id, { variableOpNodes });
  }, [form, updateForm]);

  const handleVariableOpDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `vo-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(
      e => e.source !== rfNodeId && e.target !== rfNodeId
    );
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, {
      variableOpNodes: (form.variableOpNodes || []).filter(v => v.id !== nodeId),
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  // ---- IntegrationNode CRUD ----

  const handleIntegrationAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const intg: IntegrationNodeData = {
      id: crypto.randomUUID(),
      platform: 'webhook',
      eventType: 'Lead',
    };
    const nodeId = `int-${intg.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, {
      integrationNodes: [...(form.integrationNodes || []), intg],
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  const handleIntegrationChange = useCallback((nodeId: string, patch: Partial<IntegrationNodeData>) => {
    if (!form) return;
    const integrationNodes = (form.integrationNodes || []).map(n =>
      n.id === nodeId ? { ...n, ...patch } : n
    );
    updateForm(form.id, { integrationNodes });
  }, [form, updateForm]);

  const handleIntegrationDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `int-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(
      e => e.source !== rfNodeId && e.target !== rfNodeId
    );
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, {
      integrationNodes: (form.integrationNodes || []).filter(n => n.id !== nodeId),
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  // ---- Variables CRUD ----

  const handleAddVariable = useCallback(() => {
    if (!form) return;
    const newVar: FormVariable = {
      id: crypto.randomUUID(),
      name: `variavel_${(form.variables?.length || 0) + 1}`,
      type: 'text',
      defaultValue: '',
    };
    updateForm(form.id, { variables: [...(form.variables || []), newVar] });
  }, [form, updateForm]);

  const handleUpdateVariable = useCallback((varId: string, patch: Partial<FormVariable>) => {
    if (!form) return;
    const variables = (form.variables || []).map(v =>
      v.id === varId ? { ...v, ...patch } : v
    );
    updateForm(form.id, { variables });
  }, [form, updateForm]);

  const handleDeleteVariable = useCallback((varId: string) => {
    if (!form) return;
    updateForm(form.id, { variables: (form.variables || []).filter(v => v.id !== varId) });
  }, [form, updateForm]);

  if (!form) return null;

  return (
    <div
      className="h-screen flex flex-col bg-background"
      onMouseMove={(e) => broadcastCursor(e.clientX, e.clientY)}
    >
      <CursorOverlay collaborators={collaborators} />
      <header className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-3 py-3 px-5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5 min-w-0">
            <Input
              value={form.title}
              onChange={e => updateForm(form.id, { title: e.target.value })}
              className="text-base font-semibold border-0 shadow-none focus-visible:ring-0 px-0 max-w-[200px] bg-transparent"
              placeholder="Título do formulário"
            />
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-1 ml-6">
            {(['pages', 'workflow', 'responses'] as const).map(view => (
              <button
                key={view}
                onClick={() => setEditorView(view)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  editorView === view
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {view === 'pages' ? 'Páginas' : view === 'workflow' ? 'Workflow' : 'Respostas'}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-4">
            {/* Online collaborators */}
            <CollaboratorAvatars collaborators={collaborators} />
            {/* Save status indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {saveStatus === 'saving' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <Cloud className="h-3 w-3 text-primary" />
                  <span>
                    Salvo {lastSavedAt && formatDistanceToNow(new Date(lastSavedAt), { addSuffix: true, locale: ptBR })}
                  </span>
                </>
              ) : (
                <>
                  <Cloud className="h-3 w-3" />
                  <span>Salvo</span>
                </>
              )}
            </div>

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
        {/* Pages view: list + page builder */}
        {editorView === 'pages' && (
          <>
            <PageListPanel
              pages={form.pages || []}
              selectedPageId={editingWelcome || editingThankYou ? null : editingPageId}
              onSelectPage={(id) => { setEditingWelcome(false); setEditingThankYou(false); setEditingPageId(id); }}
              onAddPage={handleAddPage}
              onDeletePage={handleDeletePage}
              onRenamePage={handleRenamePage}
              showWelcomeScreen={form.showWelcomeScreen}
              onToggleWelcomeScreen={(enabled) => {
                const patch: Partial<FormData> = { showWelcomeScreen: enabled };
                if (enabled && !form.welcomePage) {
                  // Create default welcome page with heading + button
                  const heading = createDefaultPageElement('heading');
                  heading.content = form.welcomeTitle || form.title || 'Bem-vindo!';
                  const text = createDefaultPageElement('text');
                  text.content = form.welcomeDescription || 'Clique em começar para iniciar.';
                  const btn = createDefaultPageElement('button');
                  btn.content = 'Começar';
                  btn.buttonAction = 'next';
                  patch.welcomePage = {
                    id: 'welcome',
                    title: 'Tela de início',
                    elements: [heading, text, btn],
                    pageStyle: form.globalPageStyle,
                  };
                }
                updateForm(form.id, patch);
              }}
              isWelcomeSelected={editingWelcome}
              onSelectWelcome={() => { setEditingWelcome(true); setEditingThankYou(false); setEditingPageId(null); }}
              isThankYouSelected={editingThankYou}
              onSelectThankYou={() => { setEditingThankYou(true); setEditingWelcome(false); setEditingPageId(null); }}
              variables={form.variables || []}
              onAddVariable={handleAddVariable}
              onUpdateVariable={handleUpdateVariable}
              onDeleteVariable={handleDeleteVariable}
            />
            {editingWelcome ? (
              <PageBuilder
                elements={welcomePage.elements || []}
                onChange={(elements: PageElement[]) => {
                  updateForm(form.id, { welcomePage: { ...welcomePage, elements } });
                }}
                pageStyle={form.globalPageStyle}
                onPageStyleChange={(patch: Partial<FunnelPageStyle>) => {
                  const current = form.globalPageStyle || {};
                  updateForm(form.id, { globalPageStyle: { ...current, ...patch } });
                }}
                pages={form.pages || []}
                variables={form.variables || []}
                lockElement={lockElement}
                unlockElement={unlockElement}
                isLockedByOther={isLockedByOther}
              />
            ) : editingThankYou ? (
              <PageBuilder
                elements={thankYouPage.elements || []}
                onChange={(elements: PageElement[]) => {
                  updateForm(form.id, { thankYouPage: { ...thankYouPage, elements } });
                }}
                pageStyle={form.globalPageStyle}
                onPageStyleChange={(patch: Partial<FunnelPageStyle>) => {
                  const current = form.globalPageStyle || {};
                  updateForm(form.id, { globalPageStyle: { ...current, ...patch } });
                }}
                pages={form.pages || []}
                variables={form.variables || []}
                lockElement={lockElement}
                unlockElement={unlockElement}
                isLockedByOther={isLockedByOther}
              />
            ) : editingPage ? (
              <PageBuilder
                elements={editingPage.elements || []}
                onChange={(elements: PageElement[]) => {
                  handlePageChange(editingPage.id, { elements });
                }}
                pageStyle={form.globalPageStyle}
                onPageStyleChange={(patch: Partial<FunnelPageStyle>) => {
                  const current = form.globalPageStyle || {};
                  updateForm(form.id, { globalPageStyle: { ...current, ...patch } });
                }}
                pages={form.pages || []}
                variables={form.variables || []}
                lockElement={lockElement}
                unlockElement={unlockElement}
                isLockedByOther={isLockedByOther}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>Selecione uma página para editar</p>
              </div>
            )}
          </>
        )}

        {/* Workflow view */}
        {editorView === 'workflow' && (
          <div className="flex-1 overflow-hidden">
            <FlowCanvas
              form={form}
              onPageChange={handlePageChange}
              onPageDelete={handleDeletePage}
              onPageAddAtPosition={handlePageAddAtPosition}
              onConditionAddAtPosition={handleConditionAddAtPosition}
              onConditionChange={handleConditionChange}
              onConditionDelete={handleConditionDelete}
              onVariableOpAddAtPosition={handleVariableOpAddAtPosition}
              onVariableOpChange={handleVariableOpChange}
              onVariableOpDelete={handleVariableOpDelete}
              onIntegrationAddAtPosition={handleIntegrationAddAtPosition}
              onIntegrationChange={handleIntegrationChange}
              onIntegrationDelete={handleIntegrationDelete}
              onFormUpdate={handleFormUpdate}
              onPageSelect={handlePageSelectFromWorkflow}
            />
          </div>
        )}

        {/* Responses view */}
        {editorView === 'responses' && (
          <FormResponses form={form} />
        )}
      </div>
    </div>
  );
}
