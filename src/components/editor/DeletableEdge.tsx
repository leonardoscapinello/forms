import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath, useReactFlow } from '@xyflow/react';
import { X } from 'lucide-react';

interface DeletableEdgeData {
  onDelete?: (id: string) => void;
}

export default function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style, markerEnd, data,
}: EdgeProps & { data?: DeletableEdgeData }) {
  const { setEdges, getEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const edgeToDelete = getEdges().find(edge => edge.id === id);
    if (edgeToDelete) {
      // Trigger onEdgesDelete by removing from state — ReactFlow fires the event
      setEdges(edges => edges.filter(edge => edge.id !== id));
      // Also call custom handler if provided (for saveEdges)
      data?.onDelete?.(id);
    }
  };

  return (
    <>
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          className="absolute pointer-events-auto nodrag nopan"
        >
          <button
            onClick={onDelete}
            className="
              flex items-center justify-center
              w-5 h-5 rounded-full
              bg-background border border-border
              text-muted-foreground hover:text-destructive hover:border-destructive
              shadow-sm transition-all duration-150
              opacity-0
              [.react-flow__edge:hover_&]:opacity-100
              [.react-flow__edge.selected_&]:opacity-100
            "
            title="Remover conexão"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

