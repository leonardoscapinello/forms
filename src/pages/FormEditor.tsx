import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FunnelPage, FunnelPageStyle, FormData, FormVariable, ConditionNodeData, createDefaultConditionGroup, createDefaultFunnelPage, VariableOpNodeData, IntegrationNodeData, AnalyticsNodeData, WhatsAppNodeData, EmailNodeData, ABTestNodeData, WaitNodeData, JumpNodeData } from '@/types/form';
import { PageElement, createDefaultPageElement, COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import type { InputElementGroup } from '@/components/editor/VariableAssignPanel';
import CollaboratorAvatars from '@/components/editor/collaboration/CollaboratorAvatars';
import CursorOverlay from '@/components/editor/collaboration/CursorOverlay';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Cloud, Loader2, LayoutPanelLeft, GitBranch, MessageSquare, Share2, BarChart2, Settings, Monitor, Palette } from 'lucide-react';
import { useEffect, useCallback, useState, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';

// Lazy-load heavy editor sub-views
const FlowCanvas = lazy(() => import('@/components/editor/FlowCanvas'));
const PageBuilder = lazy(() => import('@/components/editor/page-builder/PageBuilder'));
const PageListPanel = lazy(() => import('@/components/editor/PageListPanel'));
const FormResponses = lazy(() => import('@/components/editor/FormResponses'));
const FormShare = lazy(() => import('@/components/editor/FormShare'));
const FormSettings = lazy(() => import('@/components/editor/FormSettings'));
const FormAnalytics = lazy(() => import('@/components/editor/FormAnalytics'));
const ResponsivePreview = lazy(() => import('@/components/editor/ResponsivePreview'));
const FormDesignSettings = lazy(() => import('@/components/editor/FormDesignSettings'));

type EditorView = 'pages' | 'workflow' | 'responses' | 'share' | 'settings' | 'analytics' | 'design';

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
  const [showResponsivePreview, setShowResponsivePreview] = useState(false);

  // Compute disconnected page IDs (pages not reachable from 'start' node)
  const disconnectedPageIds = useMemo(() => {
    const edges = form?.flowEdges || [];
    const pages = form?.pages || [];
    if (pages.length === 0) return new Set<string>();
    
    // BFS from 'start'
    const visited = new Set<string>();
    const queue = ['start'];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
    
    // Pages whose node ID (p-{id}) was not visited
    const disconnected = new Set<string>();
    for (const page of pages) {
      if (!visited.has(`p-${page.id}`)) {
        disconnected.add(page.id);
      }
    }
    return disconnected;
  }, [form?.flowEdges, form?.pages]);

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

  // Compute all input elements grouped by page for VariableInput selectors
  const editorInputElements = useMemo<InputElementGroup[]>(() => {
    return (form?.pages || []).map(page => {
      const elements: { elementId: string; elementLabel: string }[] = [];
      for (const el of page.elements || []) {
        if (!el.type.startsWith('input_')) continue;
        const baseLabel = el.label || el.type.replace('input_', '').replace(/_/g, ' ');
        const subKeys = COMPOUND_FIELD_SUB_KEYS[el.type];
        if (subKeys) {
          elements.push({ elementId: el.id, elementLabel: baseLabel });
          for (const sk of subKeys) {
            elements.push({ elementId: `${el.id}.${sk}`, elementLabel: `${baseLabel} › ${sk}` });
          }
        } else {
          elements.push({ elementId: el.id, elementLabel: baseLabel });
        }
      }
      return { pageId: page.id, pageTitle: page.title, elements };
    });
  }, [form?.pages]);

  const editorIntegrationNodes = useMemo(() => form?.integrationNodes || [], [form?.integrationNodes]);

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

  // ---- IntegrationNode (Webhook) CRUD ----

  const handleIntegrationAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const intg: IntegrationNodeData = {
      id: crypto.randomUUID(),
      platform: 'webhook',
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

  // ---- AnalyticsNode (Pixel) CRUD ----

  const handleAnalyticsAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const an: AnalyticsNodeData = {
      id: crypto.randomUUID(),
      platform: 'meta_pixel',
      eventType: 'Lead',
    };
    const nodeId = `an-${an.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, {
      analyticsNodes: [...(form.analyticsNodes || []), an],
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  const handleAnalyticsChange = useCallback((nodeId: string, patch: Partial<AnalyticsNodeData>) => {
    if (!form) return;
    const analyticsNodes = (form.analyticsNodes || []).map(n =>
      n.id === nodeId ? { ...n, ...patch } : n
    );
    updateForm(form.id, { analyticsNodes });
  }, [form, updateForm]);

  const handleAnalyticsDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `an-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(
      e => e.source !== rfNodeId && e.target !== rfNodeId
    );
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, {
      analyticsNodes: (form.analyticsNodes || []).filter(n => n.id !== nodeId),
      flowEdges,
      nodePositions,
    });
  }, [form, updateForm]);

  // ---- WhatsAppNode CRUD ----

  const handleWhatsAppAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const wa: WhatsAppNodeData = { id: crypto.randomUUID() };
    const nodeId = `wa-${wa.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, { whatsappNodes: [...(form.whatsappNodes || []), wa], flowEdges, nodePositions });
  }, [form, updateForm]);

  const handleWhatsAppChange = useCallback((nodeId: string, patch: Partial<WhatsAppNodeData>) => {
    if (!form) return;
    const whatsappNodes = (form.whatsappNodes || []).map(n => n.id === nodeId ? { ...n, ...patch } : n);
    updateForm(form.id, { whatsappNodes });
  }, [form, updateForm]);

  const handleWhatsAppDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `wa-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId);
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, { whatsappNodes: (form.whatsappNodes || []).filter(n => n.id !== nodeId), flowEdges, nodePositions });
  }, [form, updateForm]);

  // ---- EmailNode CRUD ----

  const handleEmailAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const em: EmailNodeData = { id: crypto.randomUUID() };
    const nodeId = `em-${em.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, { emailNodes: [...(form.emailNodes || []), em], flowEdges, nodePositions });
  }, [form, updateForm]);

  const handleEmailChange = useCallback((nodeId: string, patch: Partial<EmailNodeData>) => {
    if (!form) return;
    const emailNodes = (form.emailNodes || []).map(n => n.id === nodeId ? { ...n, ...patch } : n);
    updateForm(form.id, { emailNodes });
  }, [form, updateForm]);

  const handleEmailDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `em-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId);
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, { emailNodes: (form.emailNodes || []).filter(n => n.id !== nodeId), flowEdges, nodePositions });
  }, [form, updateForm]);

  // ---- ABTestNode CRUD ----

  const handleABTestAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const ab: ABTestNodeData = {
      id: crypto.randomUUID(),
      label: 'Teste A/B',
      variants: [
        { id: crypto.randomUUID(), label: 'A', weight: 50 },
        { id: crypto.randomUUID(), label: 'B', weight: 50 },
      ],
    };
    const nodeId = `ab-${ab.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, { abTestNodes: [...(form.abTestNodes || []), ab], flowEdges, nodePositions });
  }, [form, updateForm]);

  const handleABTestChange = useCallback((nodeId: string, patch: Partial<ABTestNodeData>) => {
    if (!form) return;
    const abTestNodes = (form.abTestNodes || []).map(n => n.id === nodeId ? { ...n, ...patch } : n);
    updateForm(form.id, { abTestNodes });
  }, [form, updateForm]);

  const handleABTestDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `ab-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId);
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, { abTestNodes: (form.abTestNodes || []).filter(n => n.id !== nodeId), flowEdges, nodePositions });
  }, [form, updateForm]);

  // ---- WaitNode CRUD ----

  const handleWaitAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const w: WaitNodeData = { id: crypto.randomUUID(), label: 'Espera', duration: 5, unit: 'seconds' };
    const nodeId = `wt-${w.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, { waitNodes: [...(form.waitNodes || []), w], flowEdges, nodePositions });
  }, [form, updateForm]);

  const handleWaitChange = useCallback((nodeId: string, patch: Partial<WaitNodeData>) => {
    if (!form) return;
    const waitNodes = (form.waitNodes || []).map(n => n.id === nodeId ? { ...n, ...patch } : n);
    updateForm(form.id, { waitNodes });
  }, [form, updateForm]);

  const handleWaitDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `wt-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId);
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, { waitNodes: (form.waitNodes || []).filter(n => n.id !== nodeId), flowEdges, nodePositions });
  }, [form, updateForm]);

  // ---- JumpNode CRUD ----

  const handleJumpAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const j: JumpNodeData = { id: crypto.randomUUID(), label: 'Pular para' };
    const nodeId = `jp-${j.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    const flowEdges = [...(form.flowEdges || []), newEdge];
    const nodePositions = [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }];
    updateForm(form.id, { jumpNodes: [...(form.jumpNodes || []), j], flowEdges, nodePositions });
  }, [form, updateForm]);

  const handleJumpChange = useCallback((nodeId: string, patch: Partial<JumpNodeData>) => {
    if (!form) return;
    const jumpNodes = (form.jumpNodes || []).map(n => n.id === nodeId ? { ...n, ...patch } : n);
    updateForm(form.id, { jumpNodes });
  }, [form, updateForm]);

  const handleJumpDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `jp-${nodeId}`;
    const flowEdges = (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId);
    const nodePositions = (form.nodePositions || []).filter(p => p.id !== rfNodeId);
    updateForm(form.id, { jumpNodes: (form.jumpNodes || []).filter(n => n.id !== nodeId), flowEdges, nodePositions });
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
        <div className="flex items-center gap-2 sm:gap-3 py-2 sm:py-3 px-3 sm:px-5 overflow-x-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5 min-w-0 shrink">
            <Input
              value={form.title}
              onChange={e => updateForm(form.id, { title: e.target.value })}
              className="text-sm sm:text-base font-semibold border-0 shadow-none focus-visible:ring-0 px-0 max-w-[120px] sm:max-w-[200px] bg-transparent"
              placeholder="Título"
            />
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-0.5 ml-2 sm:ml-6 border border-border rounded-lg p-0.5 sm:p-1 bg-muted/40 shrink-0">
            {([
              { view: 'pages', icon: LayoutPanelLeft, label: 'Páginas' },
              { view: 'workflow', icon: GitBranch, label: 'Workflow' },
              { view: 'design', icon: Palette, label: 'Design' },
              { view: 'responses', icon: MessageSquare, label: 'Respostas' },
              { view: 'share', icon: Share2, label: 'Compartilhar' },
              { view: 'analytics', icon: BarChart2, label: 'Análises' },
              { view: 'settings', icon: Settings, label: 'Config.' },
            ] as const).map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => setEditorView(view)}
                title={label}
                className={`flex items-center justify-center p-1 sm:p-1.5 rounded-md transition-colors ${
                  editorView === view
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Online collaborators */}
            <div className="hidden sm:block">
              <CollaboratorAvatars collaborators={collaborators} />
            </div>
            {/* Save status indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
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
              className="hidden sm:flex gap-1.5"
              onClick={() => setShowResponsivePreview(true)}
            >
              <Monitor className="h-4 w-4" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:hidden"
              onClick={() => setShowResponsivePreview(true)}
            >
              <Eye className="h-4 w-4" />
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

      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
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
              disconnectedPageIds={disconnectedPageIds}
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
                pageId="welcome"
                variables={form.variables || []}
                integrationNodes={editorIntegrationNodes}
                allInputElements={editorInputElements}
                trackedParams={form.trackedParams}
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
                pageId="thank-you"
                variables={form.variables || []}
                integrationNodes={editorIntegrationNodes}
                allInputElements={editorInputElements}
                trackedParams={form.trackedParams}
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
                pageId={editingPage.id}
                variables={form.variables || []}
                integrationNodes={editorIntegrationNodes}
                allInputElements={editorInputElements}
                trackedParams={form.trackedParams}
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
              onAnalyticsAddAtPosition={handleAnalyticsAddAtPosition}
              onAnalyticsChange={handleAnalyticsChange}
              onAnalyticsDelete={handleAnalyticsDelete}
              onWhatsAppAddAtPosition={handleWhatsAppAddAtPosition}
              onWhatsAppChange={handleWhatsAppChange}
              onWhatsAppDelete={handleWhatsAppDelete}
              onEmailAddAtPosition={handleEmailAddAtPosition}
              onEmailChange={handleEmailChange}
              onEmailDelete={handleEmailDelete}
              onABTestAddAtPosition={handleABTestAddAtPosition}
              onABTestChange={handleABTestChange}
              onABTestDelete={handleABTestDelete}
              onWaitAddAtPosition={handleWaitAddAtPosition}
              onWaitChange={handleWaitChange}
              onWaitDelete={handleWaitDelete}
              onJumpAddAtPosition={handleJumpAddAtPosition}
              onJumpChange={handleJumpChange}
              onJumpDelete={handleJumpDelete}
              onFormUpdate={handleFormUpdate}
              onPageSelect={handlePageSelectFromWorkflow}
              onCreateVariable={(newVar) => {
                if (!form) return;
                updateForm(form.id, { variables: [...(form.variables || []), newVar] });
              }}
            />
          </div>
        )}

        {/* Responses view */}
        {editorView === 'responses' && (
          <FormResponses form={form} />
        )}

        {/* Share view */}
        {editorView === 'share' && (
          <FormShare form={form} onUpdate={patch => updateForm(form.id, patch)} />
        )}

        {/* Analytics view */}
        {editorView === 'analytics' && (
          <FormAnalytics form={form} onUpdate={(patch) => updateForm(form.id, patch)} />
        )}

        {/* Design view */}
        {editorView === 'design' && (
          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto p-6">
              <FormDesignSettings form={form} onUpdate={(patch) => updateForm(form.id, patch)} />
            </div>
          </div>
        )}

        {/* Settings view */}
        {editorView === 'settings' && (
          <FormSettings form={form} onUpdate={(patch) => updateForm(form.id, patch)} />
        )}
      </div>
      </Suspense>

      {/* Responsive preview overlay */}
      <AnimatePresence>
        {showResponsivePreview && (
          <Suspense fallback={null}>
            <ResponsivePreview formId={form.id} onClose={() => setShowResponsivePreview(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
