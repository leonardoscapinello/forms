import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Question, FormData } from '@/types/form';
import QuestionNode from './QuestionNode';
import StartNode from './StartNode';
import EndNode from './EndNode';
import AddNode from './AddNode';

const NODE_SPACING = 320;
const NODE_Y = 0;

const nodeTypes = {
  questionNode: QuestionNode,
  startNode: StartNode,
  endNode: EndNode,
  addNode: AddNode,
};

interface Props {
  form: FormData;
  onQuestionChange: (qId: string, patch: Partial<Question>) => void;
  onQuestionDelete: (qId: string) => void;
  onQuestionAdd: (question: Question) => void;
}

export default function FlowCanvas({ form, onQuestionChange, onQuestionDelete, onQuestionAdd }: Props) {
  const { nodes, edges } = useMemo(() => {
    const n: Node[] = [];
    const e: Edge[] = [];

    // Start node
    n.push({
      id: 'start',
      type: 'startNode',
      position: { x: 0, y: NODE_Y },
      data: {},
      draggable: false,
    });

    // Question nodes
    form.questions.forEach((q, i) => {
      const nodeId = `q-${q.id}`;
      n.push({
        id: nodeId,
        type: 'questionNode',
        position: { x: (i + 1) * NODE_SPACING, y: NODE_Y },
        data: {
          question: q,
          index: i,
          onChange: (patch: Partial<Question>) => onQuestionChange(q.id, patch),
          onDelete: () => onQuestionDelete(q.id),
        },
      });

      // Edge from previous node
      const prevId = i === 0 ? 'start' : `q-${form.questions[i - 1].id}`;
      e.push({
        id: `e-${prevId}-${nodeId}`,
        source: prevId,
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
      });
    });

    // Add node
    const addX = (form.questions.length + 1) * NODE_SPACING;
    n.push({
      id: 'add',
      type: 'addNode',
      position: { x: addX, y: NODE_Y + 10 },
      data: { onAdd: onQuestionAdd },
      draggable: false,
    });

    // Edge to add node
    const lastQuestionId = form.questions.length > 0
      ? `q-${form.questions[form.questions.length - 1].id}`
      : 'start';
    e.push({
      id: `e-${lastQuestionId}-add`,
      source: lastQuestionId,
      target: 'add',
      type: 'smoothstep',
      style: { stroke: 'hsl(var(--border))', strokeWidth: 2, strokeDasharray: '6 3' },
    });

    // End node
    const endX = addX + NODE_SPACING * 0.8;
    n.push({
      id: 'end',
      type: 'endNode',
      position: { x: endX, y: NODE_Y },
      data: {},
      draggable: false,
    });

    e.push({
      id: 'e-add-end',
      source: 'add',
      target: 'end',
      type: 'smoothstep',
      style: { stroke: 'hsl(var(--border))', strokeWidth: 2, strokeDasharray: '6 3' },
    });

    return { nodes: n, edges: e };
  }, [form.questions, onQuestionChange, onQuestionDelete, onQuestionAdd]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
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
        />
      </ReactFlow>
    </div>
  );
}
