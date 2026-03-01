import { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import {
  FunnelPage, FunnelPageStyle, FormData, FormVariable,
  ConditionNodeData, createDefaultConditionGroup, createDefaultFunnelPage,
  VariableOpNodeData, IntegrationNodeData, AnalyticsNodeData,
  WhatsAppNodeData, EmailNodeData, ABTestNodeData, WaitNodeData, JumpNodeData,
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

// ─── Provider ────────────────────────────────────────────────────────

export function EditorFormProvider({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getForm, updateForm, getSaveStatus, getLastSavedAt } = useFormStore();
  const form = getForm(id!);
  const saveStatus = getSaveStatus(id!);
  const lastSavedAt = getLastSavedAt(id!);

  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [editingThankYou, setEditingThankYou] = useState(false);
  const [showResponsivePreview, setShowResponsivePreview] = useState(false);

  const collab = useRealtimeCollaboration({ formId: id!, currentPageId: editingPageId });

  useEffect(() => {
    if (!form) navigate('/', { replace: true });
  }, [form, navigate]);

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

  // ─── CRUD helpers ─────────────────────────────────────────────────

  const updateFormData = useCallback((patch: Partial<FormData>) => {
    if (!form) return;
    updateForm(form.id, patch);
  }, [form, updateForm]);

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

  const handlePageAddAtPosition = useCallback((page: FunnelPage, position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const newNodeId = `p-${page.id}`;
    const newEdge = { id: `e-${sourceNodeId}-${newNodeId}`, source: sourceNodeId, sourceHandle, target: newNodeId };
    updateForm(form.id, {
      pages: [...(form.pages || []), page],
      flowEdges: [...(form.flowEdges || []), newEdge],
      nodePositions: [...(form.nodePositions || []), { id: newNodeId, x: position.x, y: position.y }],
    });
  }, [form, updateForm]);

  // Generic node CRUD factory
  const makeNodeCrud = <T extends { id: string }>(
    prefix: string,
    listKey: keyof FormData,
  ) => {
    const add = (position: { x: number; y: number }, sourceNodeId: string, sourceHandle: string | undefined, node: T) => {
      if (!form) return;
      const nodeId = `${prefix}-${node.id}`;
      const newEdge = { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId };
      updateForm(form.id, {
        [listKey]: [...((form as any)[listKey] || []), node],
        flowEdges: [...(form.flowEdges || []), newEdge],
        nodePositions: [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }],
      });
    };
    const change = (nodeId: string, patch: Partial<T>) => {
      if (!form) return;
      updateForm(form.id, {
        [listKey]: ((form as any)[listKey] || []).map((n: T) => n.id === nodeId ? { ...n, ...patch } : n),
      });
    };
    const del = (nodeId: string) => {
      if (!form) return;
      const rfNodeId = `${prefix}-${nodeId}`;
      updateForm(form.id, {
        [listKey]: ((form as any)[listKey] || []).filter((n: T) => n.id !== nodeId),
        flowEdges: (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId),
        nodePositions: (form.nodePositions || []).filter(p => p.id !== rfNodeId),
      });
    };
    return { add, change, del };
  };

  // Conditions (special: has branches)
  const handleConditionAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
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

  // VariableOp
  const handleVariableOpAddAtPosition = useCallback((position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => {
    if (!form) return;
    const vop: VariableOpNodeData = { id: crypto.randomUUID(), label: 'Operação', operations: [] };
    const nodeId = `vo-${vop.id}`;
    updateForm(form.id, {
      variableOpNodes: [...(form.variableOpNodes || []), vop],
      flowEdges: [...(form.flowEdges || []), { id: `e-${sourceNodeId}-${nodeId}`, source: sourceNodeId, sourceHandle, target: nodeId }],
      nodePositions: [...(form.nodePositions || []), { id: nodeId, x: position.x, y: position.y }],
    });
  }, [form, updateForm]);

  const handleVariableOpChange = useCallback((nodeId: string, patch: Partial<VariableOpNodeData>) => {
    if (!form) return;
    updateForm(form.id, { variableOpNodes: (form.variableOpNodes || []).map(v => v.id === nodeId ? { ...v, ...patch } : v) });
  }, [form, updateForm]);

  const handleVariableOpDelete = useCallback((nodeId: string) => {
    if (!form) return;
    const rfNodeId = `vo-${nodeId}`;
    updateForm(form.id, {
      variableOpNodes: (form.variableOpNodes || []).filter(v => v.id !== nodeId),
      flowEdges: (form.flowEdges || []).filter(e => e.source !== rfNodeId && e.target !== rfNodeId),
      nodePositions: (form.nodePositions || []).filter(p => p.id !== rfNodeId),
    });
  }, [form, updateForm]);

  // Integration
  const handleIntegrationAddAtPosition = useCallback((pos: { x: number; y: number }, src: string, sh?: string) => {
    if (!form) return;
    const intg: IntegrationNodeData = { id: crypto.randomUUID(), platform: 'webhook' };
    const nid = `int-${intg.id}`;
    updateForm(form.id, { integrationNodes: [...(form.integrationNodes || []), intg], flowEdges: [...(form.flowEdges || []), { id: `e-${src}-${nid}`, source: src, sourceHandle: sh, target: nid }], nodePositions: [...(form.nodePositions || []), { id: nid, x: pos.x, y: pos.y }] });
  }, [form, updateForm]);
  const handleIntegrationChange = useCallback((nid: string, patch: Partial<IntegrationNodeData>) => { if (!form) return; updateForm(form.id, { integrationNodes: (form.integrationNodes || []).map(n => n.id === nid ? { ...n, ...patch } : n) }); }, [form, updateForm]);
  const handleIntegrationDelete = useCallback((nid: string) => { if (!form) return; const r = `int-${nid}`; updateForm(form.id, { integrationNodes: (form.integrationNodes || []).filter(n => n.id !== nid), flowEdges: (form.flowEdges || []).filter(e => e.source !== r && e.target !== r), nodePositions: (form.nodePositions || []).filter(p => p.id !== r) }); }, [form, updateForm]);

  // Analytics
  const handleAnalyticsAddAtPosition = useCallback((pos: { x: number; y: number }, src: string, sh?: string) => {
    if (!form) return;
    const an: AnalyticsNodeData = { id: crypto.randomUUID(), platform: 'meta_pixel', eventType: 'Lead' };
    const nid = `an-${an.id}`;
    updateForm(form.id, { analyticsNodes: [...(form.analyticsNodes || []), an], flowEdges: [...(form.flowEdges || []), { id: `e-${src}-${nid}`, source: src, sourceHandle: sh, target: nid }], nodePositions: [...(form.nodePositions || []), { id: nid, x: pos.x, y: pos.y }] });
  }, [form, updateForm]);
  const handleAnalyticsChange = useCallback((nid: string, patch: Partial<AnalyticsNodeData>) => { if (!form) return; updateForm(form.id, { analyticsNodes: (form.analyticsNodes || []).map(n => n.id === nid ? { ...n, ...patch } : n) }); }, [form, updateForm]);
  const handleAnalyticsDelete = useCallback((nid: string) => { if (!form) return; const r = `an-${nid}`; updateForm(form.id, { analyticsNodes: (form.analyticsNodes || []).filter(n => n.id !== nid), flowEdges: (form.flowEdges || []).filter(e => e.source !== r && e.target !== r), nodePositions: (form.nodePositions || []).filter(p => p.id !== r) }); }, [form, updateForm]);

  // WhatsApp
  const handleWhatsAppAddAtPosition = useCallback((pos: { x: number; y: number }, src: string, sh?: string) => {
    if (!form) return;
    const wa: WhatsAppNodeData = { id: crypto.randomUUID() };
    const nid = `wa-${wa.id}`;
    updateForm(form.id, { whatsappNodes: [...(form.whatsappNodes || []), wa], flowEdges: [...(form.flowEdges || []), { id: `e-${src}-${nid}`, source: src, sourceHandle: sh, target: nid }], nodePositions: [...(form.nodePositions || []), { id: nid, x: pos.x, y: pos.y }] });
  }, [form, updateForm]);
  const handleWhatsAppChange = useCallback((nid: string, patch: Partial<WhatsAppNodeData>) => { if (!form) return; updateForm(form.id, { whatsappNodes: (form.whatsappNodes || []).map(n => n.id === nid ? { ...n, ...patch } : n) }); }, [form, updateForm]);
  const handleWhatsAppDelete = useCallback((nid: string) => { if (!form) return; const r = `wa-${nid}`; updateForm(form.id, { whatsappNodes: (form.whatsappNodes || []).filter(n => n.id !== nid), flowEdges: (form.flowEdges || []).filter(e => e.source !== r && e.target !== r), nodePositions: (form.nodePositions || []).filter(p => p.id !== r) }); }, [form, updateForm]);

  // Email
  const handleEmailAddAtPosition = useCallback((pos: { x: number; y: number }, src: string, sh?: string) => {
    if (!form) return;
    const em: EmailNodeData = { id: crypto.randomUUID() };
    const nid = `em-${em.id}`;
    updateForm(form.id, { emailNodes: [...(form.emailNodes || []), em], flowEdges: [...(form.flowEdges || []), { id: `e-${src}-${nid}`, source: src, sourceHandle: sh, target: nid }], nodePositions: [...(form.nodePositions || []), { id: nid, x: pos.x, y: pos.y }] });
  }, [form, updateForm]);
  const handleEmailChange = useCallback((nid: string, patch: Partial<EmailNodeData>) => { if (!form) return; updateForm(form.id, { emailNodes: (form.emailNodes || []).map(n => n.id === nid ? { ...n, ...patch } : n) }); }, [form, updateForm]);
  const handleEmailDelete = useCallback((nid: string) => { if (!form) return; const r = `em-${nid}`; updateForm(form.id, { emailNodes: (form.emailNodes || []).filter(n => n.id !== nid), flowEdges: (form.flowEdges || []).filter(e => e.source !== r && e.target !== r), nodePositions: (form.nodePositions || []).filter(p => p.id !== r) }); }, [form, updateForm]);

  // ABTest
  const handleABTestAddAtPosition = useCallback((pos: { x: number; y: number }, src: string, sh?: string) => {
    if (!form) return;
    const ab: ABTestNodeData = { id: crypto.randomUUID(), label: 'Teste A/B', variants: [{ id: crypto.randomUUID(), label: 'A', weight: 50 }, { id: crypto.randomUUID(), label: 'B', weight: 50 }] };
    const nid = `ab-${ab.id}`;
    updateForm(form.id, { abTestNodes: [...(form.abTestNodes || []), ab], flowEdges: [...(form.flowEdges || []), { id: `e-${src}-${nid}`, source: src, sourceHandle: sh, target: nid }], nodePositions: [...(form.nodePositions || []), { id: nid, x: pos.x, y: pos.y }] });
  }, [form, updateForm]);
  const handleABTestChange = useCallback((nid: string, patch: Partial<ABTestNodeData>) => { if (!form) return; updateForm(form.id, { abTestNodes: (form.abTestNodes || []).map(n => n.id === nid ? { ...n, ...patch } : n) }); }, [form, updateForm]);
  const handleABTestDelete = useCallback((nid: string) => { if (!form) return; const r = `ab-${nid}`; updateForm(form.id, { abTestNodes: (form.abTestNodes || []).filter(n => n.id !== nid), flowEdges: (form.flowEdges || []).filter(e => e.source !== r && e.target !== r), nodePositions: (form.nodePositions || []).filter(p => p.id !== r) }); }, [form, updateForm]);

  // Wait
  const handleWaitAddAtPosition = useCallback((pos: { x: number; y: number }, src: string, sh?: string) => {
    if (!form) return;
    const w: WaitNodeData = { id: crypto.randomUUID(), label: 'Espera', duration: 5, unit: 'seconds' };
    const nid = `wt-${w.id}`;
    updateForm(form.id, { waitNodes: [...(form.waitNodes || []), w], flowEdges: [...(form.flowEdges || []), { id: `e-${src}-${nid}`, source: src, sourceHandle: sh, target: nid }], nodePositions: [...(form.nodePositions || []), { id: nid, x: pos.x, y: pos.y }] });
  }, [form, updateForm]);
  const handleWaitChange = useCallback((nid: string, patch: Partial<WaitNodeData>) => { if (!form) return; updateForm(form.id, { waitNodes: (form.waitNodes || []).map(n => n.id === nid ? { ...n, ...patch } : n) }); }, [form, updateForm]);
  const handleWaitDelete = useCallback((nid: string) => { if (!form) return; const r = `wt-${nid}`; updateForm(form.id, { waitNodes: (form.waitNodes || []).filter(n => n.id !== nid), flowEdges: (form.flowEdges || []).filter(e => e.source !== r && e.target !== r), nodePositions: (form.nodePositions || []).filter(p => p.id !== r) }); }, [form, updateForm]);

  // Jump
  const handleJumpAddAtPosition = useCallback((pos: { x: number; y: number }, src: string, sh?: string) => {
    if (!form) return;
    const j: JumpNodeData = { id: crypto.randomUUID(), label: 'Pular para' };
    const nid = `jp-${j.id}`;
    updateForm(form.id, { jumpNodes: [...(form.jumpNodes || []), j], flowEdges: [...(form.flowEdges || []), { id: `e-${src}-${nid}`, source: src, sourceHandle: sh, target: nid }], nodePositions: [...(form.nodePositions || []), { id: nid, x: pos.x, y: pos.y }] });
  }, [form, updateForm]);
  const handleJumpChange = useCallback((nid: string, patch: Partial<JumpNodeData>) => { if (!form) return; updateForm(form.id, { jumpNodes: (form.jumpNodes || []).map(n => n.id === nid ? { ...n, ...patch } : n) }); }, [form, updateForm]);
  const handleJumpDelete = useCallback((nid: string) => { if (!form) return; const r = `jp-${nid}`; updateForm(form.id, { jumpNodes: (form.jumpNodes || []).filter(n => n.id !== nid), flowEdges: (form.flowEdges || []).filter(e => e.source !== r && e.target !== r), nodePositions: (form.nodePositions || []).filter(p => p.id !== r) }); }, [form, updateForm]);

  // Variables
  const handleAddVariable = useCallback(() => {
    if (!form) return;
    const newVar: FormVariable = { id: crypto.randomUUID(), name: `variavel_${(form.variables?.length || 0) + 1}`, type: 'text', defaultValue: '' };
    updateForm(form.id, { variables: [...(form.variables || []), newVar] });
  }, [form, updateForm]);
  const handleUpdateVariable = useCallback((varId: string, patch: Partial<FormVariable>) => { if (!form) return; updateForm(form.id, { variables: (form.variables || []).map(v => v.id === varId ? { ...v, ...patch } : v) }); }, [form, updateForm]);
  const handleDeleteVariable = useCallback((varId: string) => { if (!form) return; updateForm(form.id, { variables: (form.variables || []).filter(v => v.id !== varId) }); }, [form, updateForm]);

  if (!form) return null;

  const value: EditorFormContextType = {
    form, formId: id!, saveStatus, lastSavedAt,
    editingPageId, setEditingPageId, editingWelcome, setEditingWelcome, editingThankYou, setEditingThankYou,
    showResponsivePreview, setShowResponsivePreview,
    disconnectedPageIds, editorInputElements, editorIntegrationNodes, welcomePage, thankYouPage, editingPage,
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

  return <EditorFormContext.Provider value={value}>{children}</EditorFormContext.Provider>;
}
