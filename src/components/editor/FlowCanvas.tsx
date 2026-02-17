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
  VariableOpNodeData, IntegrationNodeData,
} from '@/types/form';
import PageNode from './PageNode';
import StartNode from './StartNode';
import EndNode from './EndNode';
import ConditionNode from './ConditionNode';
import VariableOpNode from './VariableOpNode';
import IntegrationNode from './IntegrationNode';
import ConnectDropMenu from './ConnectDropMenu';
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
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const defaultEdgeOptions = {
  type: 'deletable',
  style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' },
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
  onFormUpdate: (patch: Partial<FormDataType>) => void;
  onPageSelect: (pageId: string) => void;
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
  onFormUpdate, onPageSelect,
}: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectStartRef = useRef<{ nodeId: string; handleId?: string | null } | null>(null);
  const [dropMenu, setDropMenu] = useState<{
    screenPos: { x: number; y: number };
    flowPos: { x: number; y: number };
    sourceNodeId: string;
    sourceHandle?: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeIds: string[] } | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const pages = form.pages || [];
  const variables = form.variables || [];
  const variableOpNodes = form.variableOpNodes || [];
  const integrationNodes = form.integrationNodes || [];

  // Build a grouped structure of input elements per page
  const inputElementsByPage = useMemo(() => {
    return pages.map(page => ({
      pageId: page.id,
      pageTitle: page.title,
      elements: (page.elements || [])
        .filter(el => el.type.startsWith('input_'))
        .map(el => ({
          elementId: el.id,
          elementLabel: el.label || el.type.replace('input_', '').replace(/_/g, ' '),
        })),
    })).filter(p => p.elements.length > 0);
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
          allInputElements: prevElements,
        },
      });
    });


    (form.conditions || []).forEach((cond, i) => {
      const nodeId = `c-${cond.id}`;
      const validation = validateConditionNode(cond.branches, variables);
      n.push({
        id: nodeId,
        type: 'conditionNode',
        position: getStoredPosition(form, nodeId, (pages.length + 1) * NODE_SPACING, (i + 1) * 200),
        data: {
          conditionId: cond.id,
          label: cond.label,
          branches: cond.branches,
          questions: form.questions || [],
          variables,
          hasError: !validation.isValid,
          onChange: (patch: Partial<ConditionNodeData>) => onConditionChange(cond.id, patch),
          onDelete: () => onConditionDelete(cond.id),
        },
      });
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
          allInputElements: prevElements,
          hasError: !validation.isValid,
          onChange: (patch: Partial<VariableOpNodeData>) => onVariableOpChange(vop.id, patch),
          onDelete: () => onVariableOpDelete(vop.id),
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
          onChange: (patch: Partial<IntegrationNodeData>) => onIntegrationChange(intg.id, patch),
          onDelete: () => onIntegrationDelete(intg.id),
        },
      });
    });

    return n;
  }, [form, pages, variables, inputElementsByPage, getPreviousPageElements, variableOpNodes, integrationNodes, onPageChange, onPageDelete, onPageSelect, onConditionChange, onConditionDelete, onVariableOpChange, onVariableOpDelete, onIntegrationChange, onIntegrationDelete]);

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
    const varsChanged = prev.variables !== form.variables;
    const edgesChanged = prev.flowEdges !== form.flowEdges;

    if (pagesChanged || conditionsChanged || varOpsChanged || varsChanged || edgesChanged) {
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
  }, [deleteConfirm, onPageDelete, onConditionDelete, onVariableOpDelete, setEdges, saveEdges, onNodesChangeBase]);

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
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !rounded-lg !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted"
        />
        <MiniMap
          className="!bg-card !border-border !rounded-lg !shadow-sm"
          nodeColor={(node) => {
            if (node.data?.hasError) return 'hsl(var(--destructive))';
            if (node.type === 'conditionNode') return 'hsl(var(--node-condition-accent))';
            if (node.type === 'variableOpNode') return 'hsl(var(--node-variable-op-accent))';
            if (node.type === 'pageNode') return 'hsl(var(--muted-foreground))';
            return 'hsl(var(--muted))';
          }}
          maskColor="hsl(var(--background) / 0.7)"
          pannable
          zoomable
        />

      </ReactFlow>

      {dropMenu && (
        <ConnectDropMenu
          position={dropMenu.screenPos}
          onAddPage={handleDropAddPage}
          onAddCondition={handleDropAddCondition}
          onAddVariableOp={handleDropAddVariableOp}
          onAddIntegration={handleDropAddIntegration}
          onClose={() => setDropMenu(null)}
        />
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
