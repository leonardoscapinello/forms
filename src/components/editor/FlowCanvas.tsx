import { useCallback, useMemo, useRef } from 'react';
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
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Question, FormData as FormDataType, FlowEdge } from '@/types/form';
import QuestionNode from './QuestionNode';
import StartNode from './StartNode';
import EndNode from './EndNode';
import AddNode from './AddNode';

const NODE_SPACING = 350;

const nodeTypes = {
  questionNode: QuestionNode,
  startNode: StartNode,
  endNode: EndNode,
  addNode: AddNode,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' },
};

interface Props {
  form: FormDataType;
  onQuestionChange: (qId: string, patch: Partial<Question>) => void;
  onQuestionDelete: (qId: string) => void;
  onQuestionAdd: (question: Question) => void;
  onFormUpdate: (patch: Partial<FormDataType>) => void;
}

function getStoredPosition(form: FormDataType, nodeId: string, fallbackX: number, fallbackY: number) {
  const stored = form.nodePositions?.find(p => p.id === nodeId);
  return stored ? { x: stored.x, y: stored.y } : { x: fallbackX, y: fallbackY };
}

export default function FlowCanvas({ form, onQuestionChange, onQuestionDelete, onQuestionAdd, onFormUpdate }: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build initial nodes
  const initialNodes = useMemo((): Node[] => {
    const n: Node[] = [];

    // Start node
    n.push({
      id: 'start',
      type: 'startNode',
      position: getStoredPosition(form, 'start', 0, 0),
      data: {},
    });

    // Question nodes
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
        },
      });
    });

    // Add node (always at the right end)
    const addX = (form.questions.length + 1) * NODE_SPACING;
    n.push({
      id: 'add',
      type: 'addNode',
      position: getStoredPosition(form, 'add', addX, 15),
      data: { onAdd: onQuestionAdd },
    });

    return n;
  }, [form, onQuestionChange, onQuestionDelete, onQuestionAdd]);

  // Build initial edges from stored or defaults
  const initialEdges = useMemo((): Edge[] => {
    if (form.flowEdges && form.flowEdges.length > 0) {
      return form.flowEdges.map(fe => ({
        id: fe.id,
        source: fe.source,
        target: fe.target,
        label: fe.label,
        ...defaultEdgeOptions,
      }));
    }
    // Default: linear chain
    const e: Edge[] = [];
    form.questions.forEach((q, i) => {
      const nodeId = `q-${q.id}`;
      const prevId = i === 0 ? 'start' : `q-${form.questions[i - 1].id}`;
      e.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, ...defaultEdgeOptions });
    });
    if (form.questions.length > 0) {
      const lastId = `q-${form.questions[form.questions.length - 1].id}`;
      e.push({ id: `e-${lastId}-add`, source: lastId, target: 'add', ...defaultEdgeOptions, style: { ...defaultEdgeOptions.style, strokeDasharray: '6 3' } });
    } else {
      e.push({ id: 'e-start-add', source: 'start', target: 'add', ...defaultEdgeOptions, style: { ...defaultEdgeOptions.style, strokeDasharray: '6 3' } });
    }
    return e;
  }, [form.flowEdges, form.questions]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initialEdges);

  // Debounced save of positions
  const savePositions = useCallback((changedNodes: Node[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const positions = changedNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
      onFormUpdate({ nodePositions: positions });
    }, 500);
  }, [onFormUpdate]);

  // Save edges
  const saveEdges = useCallback((currentEdges: Edge[]) => {
    const flowEdges: FlowEdge[] = currentEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label as string | undefined,
    }));
    onFormUpdate({ flowEdges });
  }, [onFormUpdate]);

  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChangeBase(changes);
    // Save positions on drag
    const hasDrag = changes.some(c => c.type === 'position' && c.dragging === false);
    if (hasDrag) {
      // Get updated nodes after changes
      setNodes(prev => {
        savePositions(prev);
        return prev;
      });
    }
  }, [onNodesChangeBase, savePositions, setNodes]);

  const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChangeBase(changes);
    // Save after edge removal
    if (changes.some(c => c.type === 'remove')) {
      setEdges(prev => {
        saveEdges(prev);
        return prev;
      });
    }
  }, [onEdgesChangeBase, saveEdges, setEdges]);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
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

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
    </div>
  );
}
