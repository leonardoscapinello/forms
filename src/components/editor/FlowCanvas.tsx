import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { Question, FormData as FormDataType, FlowEdge, ConditionNodeData } from '@/types/form';
import QuestionNode from './QuestionNode';
import StartNode from './StartNode';
import EndNode from './EndNode';
import AddNode from './AddNode';
import ConditionNode from './ConditionNode';

const NODE_SPACING = 350;

const nodeTypes = {
  questionNode: QuestionNode,
  startNode: StartNode,
  endNode: EndNode,
  addNode: AddNode,
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
  onConditionAdd: () => void;
  onConditionChange: (cId: string, patch: Partial<ConditionNodeData>) => void;
  onConditionDelete: (cId: string) => void;
  onFormUpdate: (patch: Partial<FormDataType>) => void;
}

function getStoredPosition(form: FormDataType, nodeId: string, fallbackX: number, fallbackY: number) {
  const stored = form.nodePositions?.find(p => p.id === nodeId);
  return stored ? { x: stored.x, y: stored.y } : { x: fallbackX, y: fallbackY };
}

export default function FlowCanvas({ form, onQuestionChange, onQuestionDelete, onQuestionAdd, onConditionAdd, onConditionChange, onConditionDelete, onFormUpdate }: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build nodes from form data
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
        },
      });
    });

    const addX = (form.questions.length + 1) * NODE_SPACING;
    n.push({
      id: 'add',
      type: 'addNode',
      position: getStoredPosition(form, 'add', addX, 15),
      data: { onAdd: onQuestionAdd, onAddCondition: onConditionAdd },
    });

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
  }, [form, onQuestionChange, onQuestionDelete, onQuestionAdd, onConditionAdd, onConditionChange, onConditionDelete]);

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

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(buildNodes());
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(buildEdges());

  // Sync nodes when form changes (questions added/removed/edited, conditions changed)
  const prevFormRef = useRef(form);
  useEffect(() => {
    const prev = prevFormRef.current;
    prevFormRef.current = form;

    // Check if structure changed (not just positions)
    const questionsChanged = prev.questions !== form.questions;
    const conditionsChanged = prev.conditions !== form.conditions;

    if (questionsChanged || conditionsChanged) {
      setNodes(currentNodes => {
        const newNodes = buildNodes();
        // Preserve positions of existing nodes from current canvas state
        return newNodes.map(nn => {
          const existing = currentNodes.find(cn => cn.id === nn.id);
          if (existing) {
            return { ...nn, position: existing.position };
          }
          return nn;
        });
      });
    }

    // Only rebuild edges if flowEdges or question list changed
    const edgesChanged = prev.flowEdges !== form.flowEdges;
    if (edgesChanged || questionsChanged) {
      setEdges(buildEdges());
    }
  }, [form, buildNodes, buildEdges, setNodes, setEdges]);

  // Debounced save of positions
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
      setNodes(prev => {
        savePositions(prev);
        return prev;
      });
    }
  }, [onNodesChangeBase, savePositions, setNodes]);

  const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChangeBase(changes);
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
    </div>
  );
}
