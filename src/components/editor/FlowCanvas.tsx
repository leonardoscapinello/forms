import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Question, FormData as FormDataType, FlowEdge, ConditionNodeData } from '@/types/form';
import QuestionNode from './QuestionNode';
import StartNode from './StartNode';
import EndNode from './EndNode';
import ConditionNode from './ConditionNode';
import ConnectDropMenu from './ConnectDropMenu';

const NODE_SPACING = 350;

const nodeTypes = {
  questionNode: QuestionNode,
  startNode: StartNode,
  endNode: EndNode,
  conditionNode: ConditionNode,
};

const defaultEdgeOptions = {
  type: 'default',
  style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' },
};

interface Props {
  form: FormDataType;
  onQuestionChange: (qId: string, patch: Partial<Question>) => void;
  onQuestionDelete: (qId: string) => void;
  onQuestionAdd: (question: Question) => void;
  onQuestionAddAtPosition: (question: Question, position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onConditionAddAtPosition: (position: { x: number; y: number }, sourceNodeId: string, sourceHandle?: string) => void;
  onConditionChange: (cId: string, patch: Partial<ConditionNodeData>) => void;
  onConditionDelete: (cId: string) => void;
  onFormUpdate: (patch: Partial<FormDataType>) => void;
  onQuestionSelect: (qId: string) => void;
}

function getStoredPosition(form: FormDataType, nodeId: string, fallbackX: number, fallbackY: number) {
  const stored = form.nodePositions?.find(p => p.id === nodeId);
  return stored ? { x: stored.x, y: stored.y } : { x: fallbackX, y: fallbackY };
}

function FlowCanvasInner({ form, onQuestionChange, onQuestionDelete, onQuestionAdd, onQuestionAddAtPosition, onConditionAddAtPosition, onConditionChange, onConditionDelete, onFormUpdate, onQuestionSelect }: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectStartRef = useRef<{ nodeId: string; handleId?: string | null } | null>(null);
  const [dropMenu, setDropMenu] = useState<{ screenPos: { x: number; y: number }; flowPos: { x: number; y: number }; sourceNodeId: string; sourceHandle?: string } | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const buildNodes = useCallback((): Node[] => {
    const n: Node[] = [];

    n.push({
      id: 'start',
      type: 'startNode',
      position: getStoredPosition(form, 'start', 0, 0),
      data: {},
    });

    form.questions.forEach((q, i) => {
      const nodeId = `q-${q.id}`;
      n.push({
        id: nodeId,
        type: 'questionNode',
        position: getStoredPosition(form, nodeId, (i + 1) * NODE_SPACING, 0),
        data: {
          question: q,
          index: i,
          onChange: (patch: Partial<Question>) => onQuestionChange(q.id, patch),
          onDelete: () => onQuestionDelete(q.id),
          onSelect: () => onQuestionSelect(q.id),
        },
      });
    });

    const addX = (form.questions.length + 1) * NODE_SPACING;

    (form.conditions || []).forEach((cond, i) => {
      const nodeId = `c-${cond.id}`;
      n.push({
        id: nodeId,
        type: 'conditionNode',
        position: getStoredPosition(form, nodeId, addX + NODE_SPACING, (i + 1) * 200),
        data: {
          conditionId: cond.id,
          label: cond.label,
          branches: cond.branches,
          questions: form.questions,
          onChange: (patch: Partial<ConditionNodeData>) => onConditionChange(cond.id, patch),
          onDelete: () => onConditionDelete(cond.id),
        },
      });
    });

    return n;
  }, [form, onQuestionChange, onQuestionDelete, onQuestionSelect, onConditionChange, onConditionDelete]);

  const buildEdges = useCallback((): Edge[] => {
    if (form.flowEdges && form.flowEdges.length > 0) {
      return form.flowEdges.map(fe => ({
        id: fe.id,
        source: fe.source,
        sourceHandle: fe.sourceHandle,
        target: fe.target,
        label: fe.label,
        ...defaultEdgeOptions,
      }));
    }
    const e: Edge[] = [];
    form.questions.forEach((q, i) => {
      const nodeId = `q-${q.id}`;
      const prevId = i === 0 ? 'start' : `q-${form.questions[i - 1].id}`;
      e.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, ...defaultEdgeOptions });
    });
    return e;
  }, [form.flowEdges, form.questions]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(buildNodes());
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(buildEdges());

  const prevFormRef = useRef(form);
  useEffect(() => {
    const prev = prevFormRef.current;
    prevFormRef.current = form;

    const questionsChanged = prev.questions !== form.questions;
    const conditionsChanged = prev.conditions !== form.conditions;

    if (questionsChanged || conditionsChanged) {
      setNodes(currentNodes => {
        const newNodes = buildNodes();
        return newNodes.map(nn => {
          const existing = currentNodes.find(cn => cn.id === nn.id);
          return existing ? { ...nn, position: existing.position } : nn;
        });
      });
    }

    const edgesChanged = prev.flowEdges !== form.flowEdges;
    if (edgesChanged || questionsChanged) {
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

  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChangeBase(changes);
    const hasDragEnd = changes.some(c => c.type === 'position' && c.dragging === false);
    if (hasDragEnd) {
      setNodes(prev => { savePositions(prev); return prev; });
    }
  }, [onNodesChangeBase, savePositions, setNodes]);

  const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChangeBase(changes);
    if (changes.some(c => c.type === 'remove')) {
      setEdges(prev => { saveEdges(prev); return prev; });
    }
  }, [onEdgesChangeBase, saveEdges, setEdges]);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    // Check if this is an option-handle connection (per-option routing)
    const sourceHandle = connection.sourceHandle;
    if (sourceHandle?.startsWith('option-')) {
      const optionId = sourceHandle.replace('option-', '');
      const sourceNodeId = connection.source;
      const targetNodeId = connection.target;
      // Find the question and update the option's nextNodeId
      if (sourceNodeId?.startsWith('q-')) {
        const qId = sourceNodeId.replace('q-', '');
        const question = form.questions.find(q => q.id === qId);
        if (question) {
          const updatedOptions = (question.options || []).map(o =>
            o.id === optionId ? { ...o, nextNodeId: targetNodeId || undefined } : o
          );
          onQuestionChange(qId, { options: updatedOptions });
        }
      }
    }

    setEdges(prev => {
      const updated = addEdge({ ...connection, ...defaultEdgeOptions }, prev);
      saveEdges(updated);
      return updated;
    });
  }, [setEdges, saveEdges, form.questions, onQuestionChange]);

  const onEdgeDelete = useCallback((deletedEdges: Edge[]) => {
    // Clear option routing for deleted option-handle edges
    for (const edge of deletedEdges) {
      if (edge.sourceHandle?.startsWith('option-')) {
        const optionId = edge.sourceHandle.replace('option-', '');
        const qId = edge.source.replace('q-', '');
        const question = form.questions.find(q => q.id === qId);
        if (question) {
          const updatedOptions = (question.options || []).map(o =>
            o.id === optionId ? { ...o, nextNodeId: undefined } : o
          );
          onQuestionChange(qId, { options: updatedOptions });
        }
      }
    }

    setEdges(prev => {
      const ids = new Set(deletedEdges.map(e => e.id));
      const updated = prev.filter(e => !ids.has(e.id));
      saveEdges(updated);
      return updated;
    });
  }, [setEdges, saveEdges, form.questions, onQuestionChange]);

  // Track connection start
  const onConnectStart = useCallback((_: any, params: { nodeId: string | null; handleId: string | null }) => {
    connectStartRef.current = params.nodeId ? { nodeId: params.nodeId, handleId: params.handleId } : null;
  }, []);

  // When connection dropped on empty space, show menu
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    if (!connectStartRef.current) return;

    const target = event.target as HTMLElement;
    // If dropped on a node handle, React Flow handles it via onConnect
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

  const handleDropAdd = useCallback((question: Question) => {
    if (!dropMenu) return;
    onQuestionAddAtPosition(question, dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onQuestionAddAtPosition]);

  const handleDropAddCondition = useCallback(() => {
    if (!dropMenu) return;
    onConditionAddAtPosition(dropMenu.flowPos, dropMenu.sourceNodeId, dropMenu.sourceHandle);
    setDropMenu(null);
  }, [dropMenu, onConditionAddAtPosition]);

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
        edgesReconnectable
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !rounded-lg !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted"
        />
        <MiniMap
          className="!bg-card !border-border !rounded-lg !shadow-sm"
          nodeColor="hsl(var(--muted))"
          maskColor="hsl(var(--background) / 0.7)"
          pannable
          zoomable
        />
      </ReactFlow>

      {dropMenu && (
        <ConnectDropMenu
          position={dropMenu.screenPos}
          onAdd={handleDropAdd}
          onAddCondition={handleDropAddCondition}
          onClose={() => setDropMenu(null)}
        />
      )}
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
