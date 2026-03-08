import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  BackgroundVariant,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  FunnelPage, FormData as FormDataType, FlowEdge,
  ConditionNodeData, createDefaultFunnelPage, createDefaultConditionGroup,
  VariableOpNodeData, IntegrationNodeData, AnalyticsNodeData, WhatsAppNodeData, EmailNodeData,
  ABTestNodeData, WaitNodeData, JumpNodeData, AINodeData, FormVariable,
} from '@/types/form';
import { COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import PageNode from './PageNode';
import StartNode from './StartNode';
import EndNode from './EndNode';
import ConditionNode from './ConditionNode';
import VariableOpNode from './VariableOpNode';
import IntegrationNode from './IntegrationNode';
import AnalyticsNode from './AnalyticsNode';
import WhatsAppNode from './WhatsAppNode';
import EmailNode from './EmailNode';
import ABTestNode from './ABTestNode';
import WaitNode from './WaitNode';
import JumpNode from './JumpNode';
import AINode from './AINode';
import ConnectDropMenu from './ConnectDropMenu';
import { FileText, Trash2, LayoutGrid, Power } from 'lucide-react';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { validateConditionNode, validateVariableOpNode } from './nodeValidation';
import DeletableEdge from './DeletableEdge';

const NODE_SPACING = 350;

const nodeTypes = {
  pageNode: PageNode,
  startNode: StartNode,
  endNode: EndNode,
  conditionNode: ConditionNode,
  variableOpNode: VariableOpNode,
  integrationNode: IntegrationNode,
  analyticsNode: AnalyticsNode,
  whatsappNode: WhatsAppNode,
  emailNode: EmailNode,
  abTestNode: ABTestNode,
  waitNode: WaitNode,
  jumpNode: JumpNode,
  aiNode: AINode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const defaultEdgeOptions = {
  type: 'deletable',
  style: { stroke: 'hsl(var(--border))', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))', width: 16, height: 16 },
  animated: false,
};


interface Props {
  form: FormDataType;
  onPageChange: (pageId: string, patch: Partial<FunnelPage>) => void;
  onPageDelete: (pageId: string) => void;
  onPageAddAtPosition: (page: FunnelPage, position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onConditionAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onConditionChange: (cId: string, patch: Partial<ConditionNodeData>) => void;
  onConditionDelete: (cId: string) => void;
  onVariableOpAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onVariableOpChange: (nodeId: string, patch: Partial<VariableOpNodeData>) => void;
  onVariableOpDelete: (nodeId: string) => void;
  onIntegrationAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onIntegrationChange: (nodeId: string, patch: Partial<IntegrationNodeData>) => void;
  onIntegrationDelete: (nodeId: string) => void;
  onAnalyticsAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onAnalyticsChange: (nodeId: string, patch: Partial<AnalyticsNodeData>) => void;
  onAnalyticsDelete: (nodeId: string) => void;
  onWhatsAppAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onWhatsAppChange: (nodeId: string, patch: Partial<WhatsAppNodeData>) => void;
  onWhatsAppDelete: (nodeId: string) => void;
  onEmailAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onEmailChange: (nodeId: string, patch: Partial<EmailNodeData>) => void;
  onEmailDelete: (nodeId: string) => void;
  onABTestAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onABTestChange: (nodeId: string, patch: Partial<ABTestNodeData>) => void;
  onABTestDelete: (nodeId: string) => void;
  onWaitAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onWaitChange: (nodeId: string, patch: Partial<WaitNodeData>) => void;
  onWaitDelete: (nodeId: string) => void;
  onJumpAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onJumpChange: (nodeId: string, patch: Partial<JumpNodeData>) => void;
  onJumpDelete: (nodeId: string) => void;
  onAIAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onAIChange: (nodeId: string, patch: Partial<AINodeData>) => void;
  onAIDelete: (nodeId: string) => void;
  onFormUpdate: (patch: Partial<FormDataType>) => void;
  onPageSelect: (pageId: string) => void;
  onCreateVariable?: (variable: FormVariable) => void;
}

function getStoredPosition(form: FormDataType, nodeId: string, fallbackX: number, fallbackY: number) {
  const stored = form.nodePositions?.find(p => p.id === nodeId);
  return stored ? { x: stored.x, y: stored.y } : { x: fallbackX, y: fallbackY };
}

function FlowCanvasInner({
  form, onPageChange, onPageDelete, onPageAddAtPosition,
  onConditionAddAtPosition, onConditionChange, onConditionDelete,
  onVariableOpAddAtPosition, onVariableOpChange, onVariableOpDelete,
  onIntegrationAddAtPosition, onIntegrationChange, onIntegrationDelete,
  onAnalyticsAddAtPosition, onAnalyticsChange, onAnalyticsDelete,
  onWhatsAppAddAtPosition, onWhatsAppChange, onWhatsAppDelete,
  onEmailAddAtPosition, onEmailChange, onEmailDelete,
  onABTestAddAtPosition, onABTestChange, onABTestDelete,
  onWaitAddAtPosition, onWaitChange, onWaitDelete,
  onJumpAddAtPosition, onJumpChange, onJumpDelete,
  onFormUpdate, onPageSelect, onCreateVariable,
}: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectStartRef = useRef<{ nodeId: string; handleId?: string | null } | null>(null);
  const [dropMenu, setDropMenu] = useState<{
    screenPos: { x: number; y: number };
    flowPos: { x: number; y: number };
    sourceNodeId: string;
    sourceHandle?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    screenPos: { x: number; y: number };
    flowPos: { x: number; y: number };
  } | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    screenPos: { x: number; y: number };
    nodeId: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeIds: string[] } | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const { screenToFlowPosition, setCenter, getZoom, getNodes, fitView } = useReactFlow();

  const focusNode = useCallback((nodeId: string) => {
    const allNodes = getNodes();
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    const nodeW = node.measured?.width ?? (node as any).width ?? 320;
    const nodeH = node.measured?.height ?? (node as any).height ?? 200;
    const x = (node.position?.x ?? 0) + nodeW / 2;
    const y = (node.position?.y ?? 0) + nodeH / 2;
    // Smart zoom: fit the node with padding, clamped between 0.5 and 1.5
    const vw = window.innerWidth * 0.7; // approximate flow canvas width
    const vh = window.innerHeight * 0.8;
    const padding = 80;
    const zoomX = vw / (nodeW + padding * 2);
    const zoomY = vh / (nodeH + padding * 2);
    const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.5), 1.5);
    setCenter(x, y, { zoom, duration: 400 });
    setFocusedNodeId(nodeId);
  }, [getNodes, setCenter]);

  const navigateNode = useCallback((dir: -1 | 1) => {
    const allNodes = getNodes().sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    if (!allNodes.length) return;
    const idx = allNodes.findIndex(n => n.id === focusedNodeId);
    const next = idx === -1 ? 0 : Math.max(0, Math.min(allNodes.length - 1, idx + dir));
    focusNode(allNodes[next].id);
  }, [focusedNodeId, getNodes, focusNode]);

  const handleAutoLayoutRef = useRef<() => void>(() => {});
  const handleAutoLayout = useCallback(() => handleAutoLayoutRef.current(), []);

  const pages = form.pages || [];
  const variables = form.variables || [];
  const variableOpNodes = form.variableOpNodes || [];
  const integrationNodes = form.integrationNodes || [];
  const analyticsNodes = form.analyticsNodes || [];
  const whatsappNodes = form.whatsappNodes || [];
  const emailNodes = form.emailNodes || [];
  const abTestNodes = form.abTestNodes || [];
  const waitNodes = form.waitNodes || [];
  const jumpNodes = form.jumpNodes || [];

  // Build a grouped structure of input elements per page, expanding compound fields into sub-entries
  const inputElementsByPage = useMemo(() => {
    return pages.map(page => {
      const elements: { elementId: string; elementLabel: string }[] = [];
      for (const el of (page.elements || [])) {
        if (!el.type.startsWith('input_')) continue;
        const baseLabel = el.label || el.type.replace('input_', '').replace(/_/g, ' ');
        const subKeys = COMPOUND_FIELD_SUB_KEYS[el.type];
        if (subKeys) {
          // Add the whole compound field first
          elements.push({ elementId: el.id, elementLabel: `${baseLabel} (completo)` });
          // Then add each sub-key
          for (const sub of subKeys) {
            elements.push({ elementId: `${el.id}.${sub.key}`, elementLabel: `${baseLabel} → ${sub.label}` });
          }
        } else {
          elements.push({ elementId: el.id, elementLabel: baseLabel });
        }
      }
      return { pageId: page.id, pageTitle: page.title, elements };
    }).filter(p => p.elements.length > 0);
  }, [pages]);

  /**
   * Given a target node ID, returns the grouped input elements from all page nodes
   * that are strictly upstream (reachable via incoming edges).
   * Uses BFS on reversed edges.
   */
  const getPreviousPageElements = useCallback((targetNodeId: string) => {
    const edges = form.flowEdges || [];
    const visited = new Set<string>();
    const queue = [targetNodeId];
    const upstreamPageIds: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      // Find all nodes that have an edge pointing to current
      for (const edge of edges) {
        if (edge.target !== current) continue;
        const src = edge.source;
        if (visited.has(src)) continue;
        // If it's a page node, collect its page ID
        if (src.startsWith('p-')) {
          const pageId = src.slice(2);
          if (!upstreamPageIds.includes(pageId)) upstreamPageIds.push(pageId);
        }
        queue.push(src);
      }
    }

    // Return grouped elements preserving the page order from `pages`
    return inputElementsByPage.filter(p => upstreamPageIds.includes(p.pageId));
  }, [form.flowEdges, inputElementsByPage]);

  // Compute reachable nodes from 'start'
  const reachableNodeIds = useMemo(() => {
    const edges = form.flowEdges || [];
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
    return visited;
  }, [form.flowEdges]);

  const buildNodes = useCallback((): Node[] => {
    const n: Node[] = [];

    n.push({
      id: 'start',
      type: 'startNode',
      position: getStoredPosition(form, 'start', 0, 0),
      data: {},
    });

    pages.forEach((page, i) => {
      const nodeId = `p-${page.id}`;
      // For a page node: previous pages are all upstream pages (excluding itself)
      const prevElements = getPreviousPageElements(nodeId);
      const isNodeDisabled = (form.disabledNodes || []).includes(nodeId);
      n.push({
        id: nodeId,
        type: 'pageNode',
        position: getStoredPosition(form, nodeId, (i + 1) * NODE_SPACING, 0),
        data: {
          page,
          index: i,
          onChange: (patch: Partial<FunnelPage>) => onPageChange(page.id, patch),
          onDelete: () => onPageDelete(page.id),
          onSelect: () => onPageSelect(page.id),
          variables,
          integrationNodes,
          allInputElements: prevElements,
          trackedParams: form.trackedParams,
          isDisconnected: !reachableNodeIds.has(nodeId),
          isNodeDisabled,
          onToggleDisabled: () => {
            const current = form.disabledNodes || [];
            const next = current.includes(nodeId) ? current.filter(id => id !== nodeId) : [...current, nodeId];
            onFormUpdate({ disabledNodes: next });
          },
          onCreateVariable,
        },
      });
    });


    (form.conditions || []).forEach((cond, i) => {
      const nodeId = `c-${cond.id}`;
      const prevElements = getPreviousPageElements(nodeId);
      const validation = validateConditionNode(cond.branches, variables);
      const isNodeDisabled = (form.disabledNodes || []).includes(nodeId);
      n.push({
        id: nodeId,
        type: 'conditionNode',
        position: getStoredPosition(form, nodeId, (pages.length + 1) * NODE_SPACING, (i + 1) * 200),
        data: {
          conditionId: cond.id,
          label: cond.label,
          branches: cond.branches,
          allInputElements: prevElements,
          variables,
          integrationNodes,
          hasError: !validation.isValid,
          isNodeDisabled,
          onToggleDisabled: () => {
            const current = form.disabledNodes || [];
            const next = current.includes(nodeId) ? current.filter(id => id !== nodeId) : [...current, nodeId];
            onFormUpdate({ disabledNodes: next });
          },
          onChange: (patch: Partial<ConditionNodeData>) => onConditionChange(cond.id, patch),
          onDelete: () => onConditionDelete(cond.id),
          onCreateVariable,
        },
      });
    });

    // Helper to build disabled props for a node
    const disabledProps = (nodeId: string) => ({
      isNodeDisabled: (form.disabledNodes || []).includes(nodeId),
      onToggleDisabled: () => {
        const current = form.disabledNodes || [];
        const next = current.includes(nodeId) ? current.filter(id => id !== nodeId) : [...current, nodeId];
        onFormUpdate({ disabledNodes: next });
      },
    });

    variableOpNodes.forEach((vop, i) => {
      const nodeId = `vo-${vop.id}`;
      const prevElements = getPreviousPageElements(nodeId);
      const validation = validateVariableOpNode(vop.operations, variables);
      n.push({
        id: nodeId,
        type: 'variableOpNode',
        position: getStoredPosition(form, nodeId, (pages.length + 2) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeId: vop.id,
          label: vop.label,
          operations: vop.operations,
          variables,
          integrationNodes,
          allInputElements: prevElements,
          hasError: !validation.isValid,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<VariableOpNodeData>) => onVariableOpChange(vop.id, patch),
          onDelete: () => onVariableOpDelete(vop.id),
          onCreateVariable,
        },
      });
    });

    integrationNodes.forEach((intg, i) => {
      const nodeId = `int-${intg.id}`;
      n.push({
        id: nodeId,
        type: 'integrationNode',
        position: getStoredPosition(form, nodeId, (pages.length + 3) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeData: intg,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<IntegrationNodeData>) => onIntegrationChange(intg.id, patch),
          onDelete: () => onIntegrationDelete(intg.id),
          variables,
        },
      });
    });

    analyticsNodes.forEach((an, i) => {
      const nodeId = `an-${an.id}`;
      n.push({
        id: nodeId,
        type: 'analyticsNode',
        position: getStoredPosition(form, nodeId, (pages.length + 4) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeData: an,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<AnalyticsNodeData>) => onAnalyticsChange(an.id, patch),
          onDelete: () => onAnalyticsDelete(an.id),
          form,
        },
      });
    });

    whatsappNodes.forEach((wa, i) => {
      const nodeId = `wa-${wa.id}`;
      const prevElements = getPreviousPageElements(nodeId);
      n.push({
        id: nodeId,
        type: 'whatsappNode',
        position: getStoredPosition(form, nodeId, (pages.length + 5) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeData: wa,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<WhatsAppNodeData>) => onWhatsAppChange(wa.id, patch),
          onDelete: () => onWhatsAppDelete(wa.id),
          variables,
          integrationNodes,
          allInputElements: prevElements,
          trackedParams: form.trackedParams,
        },
      });
    });

    emailNodes.forEach((em, i) => {
      const nodeId = `em-${em.id}`;
      const prevElements = getPreviousPageElements(nodeId);
      n.push({
        id: nodeId,
        type: 'emailNode',
        position: getStoredPosition(form, nodeId, (pages.length + 6) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeData: em,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<EmailNodeData>) => onEmailChange(em.id, patch),
          onDelete: () => onEmailDelete(em.id),
          variables,
          integrationNodes,
          allInputElements: prevElements,
          trackedParams: form.trackedParams,
        },
      });
    });

    abTestNodes.forEach((ab, i) => {
      const nodeId = `ab-${ab.id}`;
      n.push({
        id: nodeId,
        type: 'abTestNode',
        position: getStoredPosition(form, nodeId, (pages.length + 7) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeData: ab,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<ABTestNodeData>) => onABTestChange(ab.id, patch),
          onDelete: () => onABTestDelete(ab.id),
        },
      });
    });

    waitNodes.forEach((w, i) => {
      const nodeId = `wt-${w.id}`;
      n.push({
        id: nodeId,
        type: 'waitNode',
        position: getStoredPosition(form, nodeId, (pages.length + 8) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeData: w,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<WaitNodeData>) => onWaitChange(w.id, patch),
          onDelete: () => onWaitDelete(w.id),
          pages,
        },
      });
    });

    jumpNodes.forEach((j, i) => {
      const nodeId = `jp-${j.id}`;
      n.push({
        id: nodeId,
        type: 'jumpNode',
        position: getStoredPosition(form, nodeId, (pages.length + 9) * NODE_SPACING, (i + 1) * 220),
        data: {
          nodeData: j,
          pages,
          ...disabledProps(nodeId),
          onChange: (patch: Partial<JumpNodeData>) => onJumpChange(j.id, patch),
          onDelete: () => onJumpDelete(j.id),
        },
      });
    });

    return n;
  }, [form, pages, variables, inputElementsByPage, getPreviousPageElements, variableOpNodes, integrationNodes, analyticsNodes, whatsappNodes, emailNodes, abTestNodes, waitNodes, jumpNodes, onPageChange, onPageDelete, onPageSelect, onConditionChange, onConditionDelete, onVariableOpChange, onVariableOpDelete, onIntegrationChange, onIntegrationDelete, onAnalyticsChange, onAnalyticsDelete, onWhatsAppChange, onWhatsAppDelete, onEmailChange, onEmailDelete, onABTestChange, onABTestDelete, onWaitChange, onWaitDelete, onJumpChange, onJumpDelete]);

  // Ref-based stable handler to avoid declaration-order issues
  const handleEdgeDeleteRef = useRef<(edgeId: string) => void>(() => {});

  const buildEdges = useCallback((): Edge[] => {
    const edgeData = { onDelete: (id: string) => handleEdgeDeleteRef.current(id) };
    if (form.flowEdges && form.flowEdges.length > 0) {
      return form.flowEdges.map(fe => ({
        id: fe.id,
        source: fe.source,
        sourceHandle: fe.sourceHandle,
        target: fe.target,
        label: fe.label,
        ...defaultEdgeOptions,
        data: edgeData,
      }));
    }
    const e: Edge[] = [];
    pages.forEach((page, i) => {
      const nodeId = `p-${page.id}`;
      const prevId = i === 0 ? 'start' : `p-${pages[i - 1].id}`;
      e.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, ...defaultEdgeOptions, data: edgeData });
    });
    return e;
  }, [form.flowEdges, pages]);



  const [nodes, setNodes, onNodesChangeBase] = useNodesState(buildNodes());
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(buildEdges());

  const prevFormRef = useRef(form);
  useEffect(() => {
    const prev = prevFormRef.current;
    prevFormRef.current = form;

    const pagesChanged = prev.pages !== form.pages;
    const conditionsChanged = prev.conditions !== form.conditions;
    const varOpsChanged = prev.variableOpNodes !== form.variableOpNodes;
    const analyticsChanged = prev.analyticsNodes !== form.analyticsNodes;
    const intgChanged = prev.integrationNodes !== form.integrationNodes;
    const whatsappChanged = prev.whatsappNodes !== form.whatsappNodes;
    const emailChanged = prev.emailNodes !== form.emailNodes;
    const abTestChanged = prev.abTestNodes !== form.abTestNodes;
    const waitChanged = prev.waitNodes !== form.waitNodes;
    const jumpChanged = prev.jumpNodes !== form.jumpNodes;
    const varsChanged = prev.variables !== form.variables;
    const edgesChanged = prev.flowEdges !== form.flowEdges;

    if (pagesChanged || conditionsChanged || varOpsChanged || analyticsChanged || intgChanged || whatsappChanged || emailChanged || abTestChanged || waitChanged || jumpChanged || varsChanged || edgesChanged) {
      setNodes(currentNodes => {
        const newNodes = buildNodes();
        return newNodes.map(nn => {
          const existing = currentNodes.find(cn => cn.id === nn.id);
          return existing ? { ...nn, position: existing.position } : nn;
        });
      });
    }

    if (edgesChanged || pagesChanged) {
      setEdges(buildEdges());
    }
  }, [form, buildNodes, buildEdges, setNodes, setEdges]);

  const savePositions = useCallback((changedNodes: Node[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const positions = changedNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
      onFormUpdate({ nodePositions: positions });
    }, 500);
  }, [onFormUpdate]);

  const saveEdges = useCallback((currentEdges: Edge[]) => {
    const flowEdges: FlowEdge[] = currentEdges.map(e => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle as string | undefined,
      target: e.target,
      label: e.label as string | undefined,
    }));
    onFormUpdate({ flowEdges });
  }, [onFormUpdate]);

  // Wire up the stable ref after saveEdges is defined
  handleEdgeDeleteRef.current = (edgeId: string) => {
    setEdges(prev => {
      const updated = prev.filter(e => e.id !== edgeId);
      saveEdges(updated);
      return updated;
    });
  };
  // Wire up auto-layout after setNodes is available
  handleAutoLayoutRef.current = () => {
    const allNodes = getNodes();
    const edgeList = form.flowEdges || [];
    if (allNodes.length === 0) return;

    const X_GAP = 80; // horizontal gap between columns
    const Y_GAP = 40; // vertical gap between nodes in same column

    // BFS to assign layers
    const layers = new Map<string, number>();
    const queue: string[] = ['start'];
    layers.set('start', 0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const layer = layers.get(cur)!;
      for (const e of edgeList) {
        if (e.source === cur && !layers.has(e.target)) {
          layers.set(e.target, layer + 1);
          queue.push(e.target);
        }
      }
    }

    const layerGroups = new Map<number, string[]>();
    let maxLayer = 0;
    for (const node of allNodes) {
      const l = layers.get(node.id) ?? -1;
      if (l >= 0) {
        maxLayer = Math.max(maxLayer, l);
        if (!layerGroups.has(l)) layerGroups.set(l, []);
        layerGroups.get(l)!.push(node.id);
      }
    }

    let disconnectedLayer = maxLayer + 1;
    for (const node of allNodes) {
      if (!layers.has(node.id)) {
        layers.set(node.id, disconnectedLayer);
        if (!layerGroups.has(disconnectedLayer)) layerGroups.set(disconnectedLayer, []);
        layerGroups.get(disconnectedLayer)!.push(node.id);
        disconnectedLayer++;
      }
    }

    // Measure actual node widths from DOM for accurate spacing
    const nodeWidths = new Map<string, number>();
    const nodeHeights = new Map<string, number>();
    for (const node of allNodes) {
      const measured = node.measured || node;
      nodeWidths.set(node.id, (measured as any).width || 288);
      nodeHeights.set(node.id, (measured as any).height || 80);
    }

    // Compute column X positions based on widest node in each layer
    const layerX = new Map<number, number>();
    let currentX = 0;
    const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b);
    for (const layer of sortedLayers) {
      layerX.set(layer, currentX);
      const nodeIds = layerGroups.get(layer)!;
      const maxWidth = Math.max(...nodeIds.map(id => nodeWidths.get(id) || 288));
      currentX += maxWidth + X_GAP;
    }

    // Position nodes vertically centered per layer
    const newPositions: { id: string; x: number; y: number }[] = [];
    for (const [layer, nodeIds] of layerGroups) {
      const heights = nodeIds.map(id => nodeHeights.get(id) || 80);
      const totalHeight = heights.reduce((s, h) => s + h, 0) + (nodeIds.length - 1) * Y_GAP;
      let y = -totalHeight / 2;
      nodeIds.forEach((nid, i) => {
        newPositions.push({ id: nid, x: layerX.get(layer)!, y });
        y += heights[i] + Y_GAP;
      });
    }

    // Animate nodes to their new positions
    const ANIM_DURATION = 400;
    const ANIM_STEPS = 30;
    const startPositions = new Map(allNodes.map(n => [n.id, { x: n.position.x, y: n.position.y }]));
    const targetPositions = new Map(newPositions.map(p => [p.id, { x: p.x, y: p.y }]));
    let step = 0;

    const animate = () => {
      step++;
      const t = Math.min(step / ANIM_STEPS, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      setNodes(prev => prev.map(n => {
        const start = startPositions.get(n.id);
        const end = targetPositions.get(n.id);
        if (!start || !end) return n;
        return {
          ...n,
          position: {
            x: start.x + (end.x - start.x) * ease,
            y: start.y + (end.y - start.y) * ease,
          },
        };
      }));

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        onFormUpdate({ nodePositions: newPositions });
        setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50);
      }
    };

    requestAnimationFrame(animate);
  };


  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    const removeChanges = changes.filter(c => c.type === 'remove');
    const otherChanges = changes.filter(c => c.type !== 'remove');

    if (otherChanges.length > 0) {
      onNodesChangeBase(otherChanges);
      const hasDragEnd = otherChanges.some(c => c.type === 'position' && c.dragging === false);
      if (hasDragEnd) {
        setNodes(prev => { savePositions(prev); return prev; });
      }
    }

    if (removeChanges.length > 0) {
      const nodeIds = removeChanges
        .filter(c => c.type === 'remove' && c.id !== 'start')
        .map(c => (c as any).id as string);
      if (nodeIds.length > 0) {
        setDeleteConfirm({ nodeIds });
      }
    }
  }, [onNodesChangeBase, savePositions, setNodes]);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const { nodeIds } = deleteConfirm;

    for (const nodeId of nodeIds) {
      if (nodeId.startsWith('p-')) {
        onPageDelete(nodeId.replace('p-', ''));
      } else if (nodeId.startsWith('c-')) {
        onConditionDelete(nodeId.replace('c-', ''));
      } else if (nodeId.startsWith('vo-')) {
        onVariableOpDelete(nodeId.replace('vo-', ''));
      } else if (nodeId.startsWith('int-')) {
        onIntegrationDelete(nodeId.replace('int-', ''));
      } else if (nodeId.startsWith('an-')) {
        onAnalyticsDelete(nodeId.replace('an-', ''));
      } else if (nodeId.startsWith('wa-')) {
        onWhatsAppDelete(nodeId.replace('wa-', ''));
      } else if (nodeId.startsWith('em-')) {
        onEmailDelete(nodeId.replace('em-', ''));
      } else if (nodeId.startsWith('ab-')) {
        onABTestDelete(nodeId.replace('ab-', ''));
      } else if (nodeId.startsWith('wt-')) {
        onWaitDelete(nodeId.replace('wt-', ''));
      } else if (nodeId.startsWith('jp-')) {
        onJumpDelete(nodeId.replace('jp-', ''));
      }
    }

    const nodeIdSet = new Set(nodeIds);
    setEdges(prev => {
      const updated = prev.filter(e => !nodeIdSet.has(e.source) && !nodeIdSet.has(e.target));
      saveEdges(updated);
      return updated;
    });

    onNodesChangeBase(nodeIds.map(id => ({ type: 'remove' as const, id })));
    setDeleteConfirm(null);
  }, [deleteConfirm, onPageDelete, onConditionDelete, onVariableOpDelete, onIntegrationDelete, onWhatsAppDelete, onEmailDelete, onABTestDelete, onWaitDelete, onJumpDelete, setEdges, saveEdges, onNodesChangeBase]);

  const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChangeBase(changes);
    if (changes.some(c => c.type === 'remove')) {
      setEdges(prev => { saveEdges(prev); return prev; });
    }
  }, [onEdgesChangeBase, saveEdges, setEdges]);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    const sourceHandle = connection.sourceHandle;
    const sourceNodeId = connection.source;
    const isBranchHandle = sourceHandle?.startsWith('branch-');
    if (!isBranchHandle) {
      setEdges(prev => prev.filter(e => !(e.source === sourceNodeId && e.sourceHandle === (sourceHandle || undefined))));
    }
    setEdges(prev => {
      const updated = addEdge({ ...connection, ...defaultEdgeOptions }, prev);
      saveEdges(updated);
      return updated;
    });
  }, [setEdges, saveEdges]);

  const onEdgeDelete = useCallback((deletedEdges: Edge[]) => {
    setEdges(prev => {
      const ids = new Set(deletedEdges.map(e => e.id));
      const updated = prev.filter(e => !ids.has(e.id));
      saveEdges(updated);
      return updated;
    });
  }, [setEdges, saveEdges]);

  const onConnectStart = useCallback((_: any, params: { nodeId: string | null; handleId: string | null }) => {
    connectStartRef.current = params.nodeId ? { nodeId: params.nodeId, handleId: params.handleId } : null;
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    if (!connectStartRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__handle')) return;

    const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : (event as MouseEvent).clientX;
    const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : (event as MouseEvent).clientY;
    const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

    setDropMenu({
      screenPos: { x: clientX, y: clientY },
      flowPos,
      sourceNodeId: connectStartRef.current.nodeId,
      sourceHandle: connectStartRef.current.handleId || undefined,
    });
    connectStartRef.current = null;
  }, [screenToFlowPosition]);

  const handleDropAddPage = useCallback(() => {
    if (!dropMenu) return;
    const page = createDefaultFunnelPage();
    onPageAddAtPosition(page, dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onPageAddAtPosition]);

  const handleDropAddCondition = useCallback(() => {
    if (!dropMenu) return;
    onConditionAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onConditionAddAtPosition]);

  const handleDropAddVariableOp = useCallback(() => {
    if (!dropMenu) return;
    onVariableOpAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onVariableOpAddAtPosition]);

  const handleDropAddIntegration = useCallback(() => {
    if (!dropMenu) return;
    onIntegrationAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onIntegrationAddAtPosition]);

  const handleDropAddAnalytics = useCallback(() => {
    if (!dropMenu) return;
    onAnalyticsAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onAnalyticsAddAtPosition]);

  const handleDropAddWhatsApp = useCallback(() => {
    if (!dropMenu) return;
    onWhatsAppAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onWhatsAppAddAtPosition]);

  const handleDropAddEmail = useCallback(() => {
    if (!dropMenu) return;
    onEmailAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onEmailAddAtPosition]);

  const handleDropAddABTest = useCallback(() => {
    if (!dropMenu) return;
    onABTestAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onABTestAddAtPosition]);

  const handleDropAddWait = useCallback(() => {
    if (!dropMenu) return;
    onWaitAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onWaitAddAtPosition]);

  const handleDropAddJump = useCallback(() => {
    if (!dropMenu) return;
    onJumpAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onJumpAddAtPosition]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({
      screenPos: { x: event.clientX, y: event.clientY },
      flowPos,
    });
  }, [screenToFlowPosition]);

  const handleCtxAddPage = useCallback(() => {
    if (!contextMenu) return;
    const page = createDefaultFunnelPage();
    onPageAddAtPosition(page, contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onPageAddAtPosition]);

  const handleCtxAddCondition = useCallback(() => {
    if (!contextMenu) return;
    onConditionAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onConditionAddAtPosition]);

  const handleCtxAddVariableOp = useCallback(() => {
    if (!contextMenu) return;
    onVariableOpAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onVariableOpAddAtPosition]);

  const handleCtxAddIntegration = useCallback(() => {
    if (!contextMenu) return;
    onIntegrationAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onIntegrationAddAtPosition]);

  const handleCtxAddAnalytics = useCallback(() => {
    if (!contextMenu) return;
    onAnalyticsAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onAnalyticsAddAtPosition]);

  const handleCtxAddWhatsApp = useCallback(() => {
    if (!contextMenu) return;
    onWhatsAppAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onWhatsAppAddAtPosition]);

  const handleCtxAddEmail = useCallback(() => {
    if (!contextMenu) return;
    onEmailAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onEmailAddAtPosition]);

  const handleCtxAddABTest = useCallback(() => {
    if (!contextMenu) return;
    onABTestAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onABTestAddAtPosition]);

  const handleCtxAddWait = useCallback(() => {
    if (!contextMenu) return;
    onWaitAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onWaitAddAtPosition]);

  const handleCtxAddJump = useCallback(() => {
    if (!contextMenu) return;
    onJumpAddAtPosition(contextMenu.flowPos, 'start');
    setContextMenu(null);
  }, [contextMenu, onJumpAddAtPosition]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    if (node.id === 'start') return; // Can't delete start node
    setNodeContextMenu({
      screenPos: { x: event.clientX, y: event.clientY },
      nodeId: node.id,
    });
  }, []);

  const handleNodeCtxDelete = useCallback(() => {
    if (!nodeContextMenu) return;
    setDeleteConfirm({ nodeIds: [nodeContextMenu.nodeId] });
    setNodeContextMenu(null);
  }, [nodeContextMenu]);

  const handleNodeCtxSelect = useCallback(() => {
    if (!nodeContextMenu) return;
    const nodeId = nodeContextMenu.nodeId;
    if (nodeId.startsWith('p-')) {
      onPageSelect(nodeId.replace('p-', ''));
    }
    setNodeContextMenu(null);
  }, [nodeContextMenu, onPageSelect]);

  const handleNodeCtxToggleDisabled = useCallback(() => {
    if (!nodeContextMenu) return;
    const nodeId = nodeContextMenu.nodeId;
    const current = form.disabledNodes || [];
    const next = current.includes(nodeId) ? current.filter(id => id !== nodeId) : [...current, nodeId];
    onFormUpdate({ disabledNodes: next });
    setNodeContextMenu(null);
  }, [nodeContextMenu, form.disabledNodes, onFormUpdate]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgesDelete={onEdgeDelete}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
        connectionLineStyle={{ stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        nodesDraggable
        edgesFocusable
        selectNodesOnDrag={false}
        panOnScroll
        zoomOnPinch
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => { setContextMenu(null); setNodeContextMenu(null); setFocusedNodeId(null); }}
        onNodeClick={(_, node) => focusNode(node.id)}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !rounded-lg !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted"
        />
        {/* Auto-layout button */}
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-lg shadow-sm hover:bg-muted transition-colors text-foreground"
            title="Organizar workflow"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Organizar
          </button>
        </div>
        <MiniMap
          className="!bg-card !border-border !rounded-lg !shadow-sm"
          nodeColor={(node) => {
            if (node.data?.hasError) return 'hsl(var(--destructive))';
            if (node.type === 'conditionNode') return 'hsl(var(--node-condition-accent))';
            if (node.type === 'variableOpNode') return 'hsl(var(--node-variable-op-accent))';
            if (node.type === 'integrationNode') return 'hsl(var(--node-webhook-accent))';
            if (node.type === 'analyticsNode') return 'hsl(var(--node-analytics-accent))';
            if (node.type === 'whatsappNode') return 'hsl(var(--node-whatsapp-accent))';
            if (node.type === 'emailNode') return 'hsl(var(--node-email-accent))';
            if (node.type === 'abTestNode') return 'hsl(var(--node-abtest-accent))';
            if (node.type === 'waitNode') return 'hsl(var(--node-wait-accent))';
            if (node.type === 'jumpNode') return 'hsl(var(--node-jump-accent))';
            if (node.type === 'pageNode') return 'hsl(var(--muted-foreground))';
            return 'hsl(var(--muted))';
          }}
          maskColor="hsl(var(--background) / 0.7)"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Node navigation bar */}
      {focusedNodeId && (() => {
        const sorted = [...nodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
        const idx = sorted.findIndex(n => n.id === focusedNodeId);
        const prevNode = idx > 0 ? sorted[idx - 1] : null;
        const nextNode = idx < sorted.length - 1 ? sorted[idx + 1] : null;

        const nodeLabel = (n: typeof sorted[0] | null) => {
          if (!n) return null;
          const t = n.type || '';
          const d = n.data as any;
          if (t === 'pageNode') return d?.title || 'Página';
          if (t === 'startNode') return 'Início';
          if (t === 'endNode') return 'Fim';
          if (t === 'conditionNode') return 'Condição';
          if (t === 'variableOpNode') return 'Variável';
          if (t === 'integrationNode') return 'Integração';
          if (t === 'analyticsNode') return 'Analytics';
          if (t === 'whatsappNode') return 'WhatsApp';
          if (t === 'emailNode') return 'E-mail';
          if (t === 'abTestNode') return 'Teste A/B';
          if (t === 'waitNode') return 'Espera';
          if (t === 'jumpNode') return 'Pular';
          return 'Nó';
        };

        const nodeIcon = (n: typeof sorted[0] | null) => {
          if (!n) return '·';
          const t = n.type || '';
          if (t === 'pageNode') return '📄';
          if (t === 'startNode') return '▶';
          if (t === 'endNode') return '⏹';
          if (t === 'conditionNode') return '🔀';
          if (t === 'variableOpNode') return '📝';
          if (t === 'integrationNode') return '🔗';
          if (t === 'analyticsNode') return '📊';
          if (t === 'whatsappNode') return '💬';
          if (t === 'emailNode') return '📧';
          if (t === 'abTestNode') return '🔀';
          if (t === 'waitNode') return '⏳';
          if (t === 'jumpNode') return '↪';
          return '○';
        };

        return (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center bg-card border border-border rounded-full shadow-lg px-2 py-1 z-50">
            {/* Prev hint — fixed width */}
            <span className="w-[80px] text-[10px] text-muted-foreground/60 truncate select-none text-right pr-1">
              {prevNode ? `${nodeIcon(prevNode)} ${nodeLabel(prevNode)}` : ''}
            </span>
            <button
              onClick={() => navigateNode(-1)}
              disabled={idx <= 0}
              className="h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-foreground disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-xs text-muted-foreground px-2 select-none font-medium flex-shrink-0 tabular-nums">
              {idx + 1} / {sorted.length}
            </span>
            <button
              onClick={() => navigateNode(1)}
              disabled={idx >= sorted.length - 1}
              className="h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-foreground disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            {/* Next hint — fixed width */}
            <span className="w-[80px] text-[10px] text-muted-foreground/60 truncate select-none text-left pl-1">
              {nextNode ? `${nodeIcon(nextNode)} ${nodeLabel(nextNode)}` : ''}
            </span>
            <button
              onClick={() => setFocusedNodeId(null)}
              className="h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground ml-0.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        );
      })()}

      {dropMenu && (
        <ConnectDropMenu
          onAddPage={handleDropAddPage}
          onAddCondition={handleDropAddCondition}
          onAddVariableOp={handleDropAddVariableOp}
          onAddIntegration={handleDropAddIntegration}
          onAddAnalytics={handleDropAddAnalytics}
          onAddWhatsApp={handleDropAddWhatsApp}
          onAddEmail={handleDropAddEmail}
          onAddABTest={handleDropAddABTest}
          onAddWait={handleDropAddWait}
          onAddJump={handleDropAddJump}
          onClose={() => setDropMenu(null)}
        />
      )}

      {contextMenu && (
        <ConnectDropMenu
          onAddPage={handleCtxAddPage}
          onAddCondition={handleCtxAddCondition}
          onAddVariableOp={handleCtxAddVariableOp}
          onAddIntegration={handleCtxAddIntegration}
          onAddAnalytics={handleCtxAddAnalytics}
          onAddWhatsApp={handleCtxAddWhatsApp}
          onAddEmail={handleCtxAddEmail}
          onAddABTest={handleCtxAddABTest}
          onAddWait={handleCtxAddWait}
          onAddJump={handleCtxAddJump}
          onClose={() => setContextMenu(null)}
        />
      )}

      {nodeContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNodeContextMenu(null)} />
          <div
            className="fixed z-50 w-52 rounded-xl border border-border bg-popover shadow-xl py-1.5"
            style={{ left: nodeContextMenu.screenPos.x, top: nodeContextMenu.screenPos.y }}
          >
            {nodeContextMenu.nodeId.startsWith('p-') && (
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent text-left transition-colors text-foreground"
                onClick={handleNodeCtxSelect}
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                Editar página
              </button>
            )}
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent text-left transition-colors text-foreground"
              onClick={handleNodeCtxToggleDisabled}
            >
              <Power className="h-4 w-4 text-muted-foreground" />
              {(form.disabledNodes || []).includes(nodeContextMenu.nodeId) ? 'Ativar nó' : 'Desativar nó'}
            </button>
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-destructive/10 text-left transition-colors text-destructive"
              onClick={handleNodeCtxDelete}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          </div>
        </>
      )}

      <DeleteConfirmDialog
        open={!!deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

export default function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
