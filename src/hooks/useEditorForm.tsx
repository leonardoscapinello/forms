import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import {
  FunnelPage, FunnelPageStyle, FormData, FormVariable,
  ConditionNodeData, createDefaultConditionGroup, createDefaultFunnelPage,
  VariableOpNodeData, IntegrationNodeData, AnalyticsNodeData,
  WhatsAppNodeData, EmailNodeData, ABTestNodeData, WaitNodeData, JumpNodeData,
  AINodeData,
} from '@/types/form';
import { PageElement, createDefaultPageElement, COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import type { InputElementGroup } from '@/components/editor/VariableAssignPanel';

// ─── Context type ────────────────────────────────────────────────────

interface EditorFormContextType {
  form: FormData;
  formId: string;
  saveStatus: string;
  lastSavedAt: number | string | null;

  // Page state
  editingPageId: string | null;
  setEditingPageId: (id: string | null) => void;
  editingWelcome: boolean;
  setEditingWelcome: (v: boolean) => void;
  editingThankYou: boolean;
  setEditingThankYou: (v: boolean) => void;

  // Preview
  showResponsivePreview: boolean;
  setShowResponsivePreview: (v: boolean) => void;

  // Computed
  disconnectedPageIds: Set<string>;
  flowOrderedPages: FunnelPage[];
  editorInputElements: InputElementGroup[];
  editorIntegrationNodes: IntegrationNodeData[];
  welcomePage: FunnelPage;
  thankYouPage: FunnelPage;
  editingPage: FunnelPage | null;

  // Collaboration
  collaborators: ReturnType<typeof useRealtimeCollaboration>['collaborators'];
  lockElement: ReturnType<typeof useRealtimeCollaboration>['lockElement'];
  unlockElement: ReturnType<typeof useRealtimeCollaboration>['unlockElement'];
  broadcastCursor: ReturnType<typeof useRealtimeCollaboration>['broadcastCursor'];
  isLockedByOther: ReturnType<typeof useRealtimeCollaboration>['isLockedByOther'];

  // Form CRUD
  updateFormData: (patch: Partial<FormData>) => void;

  // Page CRUD
  handleAddPage: () => void;
  handleDeletePage: (pageId: string) => void;
  handlePageChange: (pageId: string, patch: Partial<FunnelPage>) => void;
  handleRenamePage: (pageId: string, title: string) => void;

  // Workflow node CRUD
  handlePageSelectFromWorkflow: (pageId: string) => void;
  handlePageAddAtPosition: (page: FunnelPage, position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleConditionAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleConditionChange: (cId: string, patch: Partial<ConditionNodeData>) => void;
  handleConditionDelete: (cId: string) => void;
  handleVariableOpAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleVariableOpChange: (nodeId: string, patch: Partial<VariableOpNodeData>) => void;
  handleVariableOpDelete: (nodeId: string) => void;
  handleIntegrationAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleIntegrationChange: (nodeId: string, patch: Partial<IntegrationNodeData>) => void;
  handleIntegrationDelete: (nodeId: string) => void;
  handleAnalyticsAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleAnalyticsChange: (nodeId: string, patch: Partial<AnalyticsNodeData>) => void;
  handleAnalyticsDelete: (nodeId: string) => void;
  handleWhatsAppAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleWhatsAppChange: (nodeId: string, patch: Partial<WhatsAppNodeData>) => void;
  handleWhatsAppDelete: (nodeId: string) => void;
  handleEmailAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleEmailChange: (nodeId: string, patch: Partial<EmailNodeData>) => void;
  handleEmailDelete: (nodeId: string) => void;
  handleABTestAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleABTestChange: (nodeId: string, patch: Partial<ABTestNodeData>) => void;
  handleABTestDelete: (nodeId: string) => void;
  handleWaitAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleWaitChange: (nodeId: string, patch: Partial<WaitNodeData>) => void;
  handleWaitDelete: (nodeId: string) => void;
  handleJumpAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleJumpChange: (nodeId: string, patch: Partial<JumpNodeData>) => void;
  handleJumpDelete: (nodeId: string) => void;
  handleAIAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  handleAIChange: (nodeId: string, patch: Partial<AINodeData>) => void;
  handleAIDelete: (nodeId: string) => void;

  // Variables CRUD
  handleAddVariable: () => void;
  handleUpdateVariable: (varId: string, patch: Partial<FormVariable>) => void;
  handleDeleteVariable: (varId: string) => void;
}

const EditorFormContext = createContext<EditorFormContextType | null>(null);

export function useEditorForm() {
  const ctx = useContext(EditorFormContext);
  if (!ctx) throw new Error('useEditorForm must be used within EditorFormProvider');
  return ctx;
}

// ─── Generic node CRUD factory ──────────────────────────────────────
// Eliminates repetitive add/change/delete patterns across all node types.

type Position = { x: number; y: number };

function useNodeCrud<T extends { id: string }>(
  form: FormData | null,
  updateForm: (id: string, patch: Partial<FormData>) => void,
  prefix: string,
  listKey: keyof FormData,
) {
  const add = useCallback((node: T, position: Position, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const nodeId = `${prefix}-${node.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
    updateForm(form.id, {
      [listKey]: [...((form as any)[listKey] || []), node],
      flowEdges: [...(form.flowEdges || []), newEdge],
      nodePositions: [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }],
    });
  }, [form, updateForm, prefix, listKey]);

  const change = useCallback((nodeId: string, patch: Partial<T>) => {
    if (!form) return;
    updateForm(form.id, {
      [listKey]: ((form as any)[listKey] || []).map((n: T) => n.id === nodeId ? { ...n, ...patch } : n),
    });
  }, [form, updateForm, listKey]);

  const del = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `${prefix}-${nodeId}`;
    updateForm(form.id, {
      [listKey]: ((form as any)[listKey] || []).filter((n: T) => n.id !== nodeId),
      flowEdges: (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId),
      nodePositions: (form.nodePositions || []).filter(p => p.id !== rfNodeId),
    });
  }, [form, updateForm, prefix, listKey]);

  return { add, change, del };
}

// ─── Provider ────────────────────────────────────────────────────────

export function EditorFormProvider({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm, updateForm, getSaveStatus, getLastSavedAt, loaded } = useFormStore();
  const form = getForm(id!);
  const saveStatus = getSaveStatus(id!);
  const lastSavedAt = getLastSavedAt(id!);

  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [editingThankYou, setEditingThankYou] = useState(false);
  const [showResponsivePreview, setShowResponsivePreview] = useState(false);

  const collab = useRealtimeCollaboration({ formId: id!, currentPageId: editingPageId });

  // Only redirect when forms are loaded AND this specific form doesn't exist
  useEffect(() => {
    if (loaded && !form) navigate('/', { replace: true });
  }, [form, loaded, navigate]);

  // ─── Computed ──────────────────────────────────────────────────────

  const disconnectedPageIds = useMemo(() => {
    const edges = form?.flowEdges || [];
    const pages = form?.pages || [];
    if (pages.length === 0) return new Set<string>();
    const visited = new Set<string>();
    const queue = ['start'];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
      }
    }
    const disconnected = new Set<string>();
    for (const page of pages) {
      if (!visited.has(`p-${page.id}`)) disconnected.add(page.id);
    }
    return disconnected;
  }, [form?.flowEdges, form?.pages]);

  const flowOrderedPages = useMemo(() => {
    const edges = form?.flowEdges || [];
    const pages = form?.pages || [];
    if (pages.length === 0) return [];
    const pageMap = new Map(pages.map(p => [p.id, p]));
    const ordered: FunnelPage[] = [];
    const visited = new Set<string>();
    const queue = ['start'];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (current.startsWith('p-')) {
        const pageId = current.slice(2);
        const page = pageMap.get(pageId);
        if (page) {
          ordered.push(page);
          pageMap.delete(pageId);
        }
      }
      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
      }
    }
    for (const page of pages) {
      if (pageMap.has(page.id)) ordered.push(page);
    }
    return ordered;
  }, [form?.flowEdges, form?.pages]);

  const editorInputElements = useMemo<InputElementGroup[]>(() => {
    return (form?.pages || []).map(page => {
      const elements: { elementId: string; elementLabel: string }[] = [];
      for (const el of page.elements || []) {
        if (!el.type.startsWith('input_')) continue;
        const baseLabel = el.label || el.type.replace('input_', '').replace(/_/g, ' ');
        const subKeys = COMPOUND_FIELD_SUB_KEYS[el.type];
        if (subKeys) {
          elements.push({ elementId: el.id, elementLabel: baseLabel });
          for (const sk of subKeys) elements.push({ elementId: `${el.id}.${sk}`, elementLabel: `${baseLabel} › ${sk}` });
        } else {
          elements.push({ elementId: el.id, elementLabel: baseLabel });
        }
      }
      return { pageId: page.id, pageTitle: page.title, elements };
    });
  }, [form?.pages]);

  const editorIntegrationNodes = useMemo(() => form?.integrationNodes || [], [form?.integrationNodes]);

  const welcomePage = form?.welcomePage || {
    id: 'welcome', title: 'Tela de início', elements: [],
    pageStyle: form?.globalPageStyle,
  };

  const thankYouPage = form?.thankYouPage || {
    id: 'thank-you', title: 'Tela de obrigado', elements: [],
    pageStyle: form?.globalPageStyle,
  };

  const editingPage = (editingWelcome || editingThankYou) ? null : (form?.pages?.find(p => p.id === editingPageId) || null);

  // ─── Form update ──────────────────────────────────────────────────

  const updateFormData = useCallback((patch: Partial<FormData>) => {
    if (!form) return;
    updateForm(form.id, patch);
  }, [form, updateForm]);

  // ─── Page CRUD ────────────────────────────────────────────────────

  const handleAddPage = useCallback(() => {
    if (!form) return;
    const page = createDefaultFunnelPage(`Página ${(form.pages?.length || 0) + 1}`);
    updateForm(form.id, { pages: [...(form.pages || []), page] });
    setEditingPageId(page.id);
  }, [form, updateForm]);

  const handleDeletePage = useCallback((pageId: string) => {
    if (!form) return;
    if (editingPageId === pageId) {
      const remaining = (form.pages || []).filter(p => p.id !== pageId);
      setEditingPageId(remaining[0]?.id || null);
    }
    const nodeId = `p-${pageId}`;
    updateForm(form.id, {
      pages: (form.pages || []).filter(p => p.id !== pageId),
      flowEdges: (form.flowEdges || []).filter(e => e.source !== nodeId && e.target !== nodeId),
      nodePositions: (form.nodePositions || []).filter(p => p.id !== nodeId),
    });
  }, [form, updateForm, editingPageId]);

  const handlePageChange = useCallback((pageId: string, patch: Partial<FunnelPage>) => {
    if (!form) return;
    updateForm(form.id, { pages: (form.pages || []).map(p => p.id === pageId ? { ...p, ...patch } : p) });
  }, [form, updateForm]);

  const handleRenamePage = useCallback((pageId: string, title: string) => {
    handlePageChange(pageId, { title });
  }, [handlePageChange]);

  const handlePageSelectFromWorkflow = useCallback((pageId: string) => {
    setEditingPageId(pageId);
    navigate(`/editor/${id}/pages`);
  }, [navigate, id]);

  const handlePageAddAtPosition = useCallback((page: FunnelPage, position: Position, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const newNodeId = `p-${page.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${newNodeId}`, source: sourceNodeId, sourceHandle, target: newNodeId };
    updateForm(form.id, {
      pages: [...(form.pages || []), page],
      flowEdges: [...(form.flowEdges || []), newEdge],
      nodePositions: [...(form.nodePositions || []), { id: newNodeId, x: position.x, y: position.y }],
    });
  }, [form, updateForm]);

  // ─── Node CRUD via factory ────────────────────────────────────────
  // Conditions need special handling (branches), so they stay manual.

  const handleConditionAddAtPosition = useCallback((position: Position, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const cond: ConditionNodeData = {
      id: crypto.randomUUID(), label: 'Nova condição',
      branches: [{ id: crypto.randomUUID(), label: 'Caminho 1', conditionGroup: createDefaultConditionGroup(form.questions?.[0]?.id || '') }],
    };
    const nodeId = `c-${cond.id}`;
    updateForm(form.id, {
      conditions: [...(form.conditions || []), cond],
      flowEdges: [...(form.flowEdges || []), { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId }],
      nodePositions: [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }],
    });
  }, [form, updateForm]);

  const handleConditionChange = useCallback((cId: string, patch: Partial<ConditionNodeData>) => {
    if (!form) return;
    updateForm(form.id, { conditions: (form.conditions || []).map(c => c.id === cId ? { ...c, ...patch } : c) });
  }, [form, updateForm]);

  const handleConditionDelete = useCallback((cId: string) => {
    if (!form) return;
    const nodeId = `c-${cId}`;
    updateForm(form.id, {
      conditions: (form.conditions || []).filter(c => c.id !== cId),
      flowEdges: (form.flowEdges || []).filter(e => e.source !== nodeId && e.target !== nodeId && !e.sourceHandle?.includes(cId)),
      nodePositions: (form.nodePositions || []).filter(p => p.id !== nodeId),
    });
  }, [form, updateForm]);

  // All other node types use the factory
  const varOp = useNodeCrud<VariableOpNodeData>(form, updateForm, 'vo', 'variableOpNodes');
  const intg = useNodeCrud<IntegrationNodeData>(form, updateForm, 'int', 'integrationNodes');
  const analytics = useNodeCrud<AnalyticsNodeData>(form, updateForm, 'an', 'analyticsNodes');
  const wa = useNodeCrud<WhatsAppNodeData>(form, updateForm, 'wa', 'whatsappNodes');
  const email = useNodeCrud<EmailNodeData>(form, updateForm, 'em', 'emailNodes');
  const abTest = useNodeCrud<ABTestNodeData>(form, updateForm, 'ab', 'abTestNodes');
  const wait = useNodeCrud<WaitNodeData>(form, updateForm, 'wt', 'waitNodes');
  const jump = useNodeCrud<JumpNodeData>(form, updateForm, 'jp', 'jumpNodes');
  const ai = useNodeCrud<AINodeData>(form, updateForm, 'ai', 'aiNodes');

  // Wrappers that create default nodes and call factory.add
  const handleVariableOpAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    varOp.add({ id: crypto.randomUUID(), label: 'Operação', operations: [] }, pos, src, sh);
  }, [varOp]);
  const handleVariableOpChange = varOp.change;
  const handleVariableOpDelete = varOp.del;

  const handleIntegrationAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    intg.add({ id: crypto.randomUUID(), platform: 'webhook' }, pos, src, sh);
  }, [intg]);
  const handleIntegrationChange = intg.change;
  const handleIntegrationDelete = intg.del;

  const handleAnalyticsAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    analytics.add({ id: crypto.randomUUID(), platform: 'meta_pixel', eventType: 'Lead' }, pos, src, sh);
  }, [analytics]);
  const handleAnalyticsChange = analytics.change;
  const handleAnalyticsDelete = analytics.del;

  const handleWhatsAppAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    wa.add({ id: crypto.randomUUID() }, pos, src, sh);
  }, [wa]);
  const handleWhatsAppChange = wa.change;
  const handleWhatsAppDelete = wa.del;

  const handleEmailAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    email.add({ id: crypto.randomUUID() }, pos, src, sh);
  }, [email]);
  const handleEmailChange = email.change;
  const handleEmailDelete = email.del;

  const handleABTestAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    abTest.add({
      id: crypto.randomUUID(), label: 'Teste A/B',
      variants: [{ id: crypto.randomUUID(), label: 'A', weight: 50 }, { id: crypto.randomUUID(), label: 'B', weight: 50 }],
    }, pos, src, sh);
  }, [abTest]);
  const handleABTestChange = abTest.change;
  const handleABTestDelete = abTest.del;

  const handleWaitAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    wait.add({ id: crypto.randomUUID(), label: 'Espera', duration: 5, unit: 'seconds' }, pos, src, sh);
  }, [wait]);
  const handleWaitChange = wait.change;
  const handleWaitDelete = wait.del;

  const handleJumpAddAtPosition = useCallback((pos: Position, src: string, sh?: string) => {
    jump.add({ id: crypto.randomUUID(), label: 'Pular para' }, pos, src, sh);
  }, [jump]);
  const handleJumpChange = jump.change;
  const handleJumpDelete = jump.del;

  // ─── Variables CRUD ───────────────────────────────────────────────

  const handleAddVariable = useCallback(() => {
    if (!form) return;
    const newVar: FormVariable = { id: crypto.randomUUID(), name: `variavel_${(form.variables?.length || 0) + 1}`, type: 'text', defaultValue: '' };
    updateForm(form.id, { variables: [...(form.variables || []), newVar] });
  }, [form, updateForm]);

  const handleUpdateVariable = useCallback((varId: string, patch: Partial<FormVariable>) => {
    if (!form) return;
    updateForm(form.id, { variables: (form.variables || []).map(v => v.id === varId ? { ...v, ...patch } : v) });
  }, [form, updateForm]);

  const handleDeleteVariable = useCallback((varId: string) => {
    if (!form) return;
    updateForm(form.id, { variables: (form.variables || []).filter(v => v.id !== varId) });
  }, [form, updateForm]);

  const value: EditorFormContextType | null = useMemo(() => {
    if (!form) return null;
    return {
      form, formId: id!, saveStatus, lastSavedAt,
      editingPageId, setEditingPageId, editingWelcome, setEditingWelcome, editingThankYou, setEditingThankYou,
      showResponsivePreview, setShowResponsivePreview,
      disconnectedPageIds, flowOrderedPages, editorInputElements, editorIntegrationNodes, welcomePage, thankYouPage, editingPage,
      collaborators: collab.collaborators, lockElement: collab.lockElement, unlockElement: collab.unlockElement, broadcastCursor: collab.broadcastCursor, isLockedByOther: collab.isLockedByOther,
      updateFormData,
      handleAddPage, handleDeletePage, handlePageChange, handleRenamePage,
      handlePageSelectFromWorkflow, handlePageAddAtPosition,
      handleConditionAddAtPosition, handleConditionChange, handleConditionDelete,
      handleVariableOpAddAtPosition, handleVariableOpChange, handleVariableOpDelete,
      handleIntegrationAddAtPosition, handleIntegrationChange, handleIntegrationDelete,
      handleAnalyticsAddAtPosition, handleAnalyticsChange, handleAnalyticsDelete,
      handleWhatsAppAddAtPosition, handleWhatsAppChange, handleWhatsAppDelete,
      handleEmailAddAtPosition, handleEmailChange, handleEmailDelete,
      handleABTestAddAtPosition, handleABTestChange, handleABTestDelete,
      handleWaitAddAtPosition, handleWaitChange, handleWaitDelete,
      handleJumpAddAtPosition, handleJumpChange, handleJumpDelete,
      handleAddVariable, handleUpdateVariable, handleDeleteVariable,
    };
  }, [
    form, id, saveStatus, lastSavedAt,
    editingPageId, editingWelcome, editingThankYou, showResponsivePreview,
    disconnectedPageIds, flowOrderedPages, editorInputElements, editorIntegrationNodes, welcomePage, thankYouPage, editingPage,
    collab.collaborators, collab.lockElement, collab.unlockElement, collab.broadcastCursor, collab.isLockedByOther,
    updateFormData,
    handleAddPage, handleDeletePage, handlePageChange, handleRenamePage,
    handlePageSelectFromWorkflow, handlePageAddAtPosition,
    handleConditionAddAtPosition, handleConditionChange, handleConditionDelete,
    handleVariableOpAddAtPosition, handleVariableOpChange, handleVariableOpDelete,
    handleIntegrationAddAtPosition, handleIntegrationChange, handleIntegrationDelete,
    handleAnalyticsAddAtPosition, handleAnalyticsChange, handleAnalyticsDelete,
    handleWhatsAppAddAtPosition, handleWhatsAppChange, handleWhatsAppDelete,
    handleEmailAddAtPosition, handleEmailChange, handleEmailDelete,
    handleABTestAddAtPosition, handleABTestChange, handleABTestDelete,
    handleWaitAddAtPosition, handleWaitChange, handleWaitDelete,
    handleJumpAddAtPosition, handleJumpChange, handleJumpDelete,
    handleAddVariable, handleUpdateVariable, handleDeleteVariable,
  ]);

  if (!form) {
    if (!loaded) {
      return (
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      );
    }

    return (
      <div className="h-screen flex items-center justify-center bg-background px-6">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Formulário não encontrado. Redirecionando...</p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="text-sm text-primary underline underline-offset-4"
          >
            Ir para formulários
          </button>
        </div>
      </div>
    );
  }

  return <EditorFormContext.Provider value={value as EditorFormContextType}>{children}</EditorFormContext.Provider>;
}
