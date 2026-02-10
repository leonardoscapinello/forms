import { CollaboratorPresence } from '@/hooks/useRealtimeCollaboration';

interface Props {
  collaborators: CollaboratorPresence[];
}

export default function CursorOverlay({ collaborators }: Props) {
  const withCursors = collaborators.filter(c => c.cursor);
  if (withCursors.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {withCursors.map((c) => (
        <div
          key={c.userId}
          className="absolute transition-all duration-100 ease-out"
          style={{
            left: c.cursor!.x,
            top: c.cursor!.y,
          }}
        >
          {/* Cursor arrow */}
          <svg
            width="16"
            height="20"
            viewBox="0 0 16 20"
            fill="none"
            className="drop-shadow-sm"
          >
            <path
              d="M0.5 0.5L15 10.5L7.5 11.5L4 19.5L0.5 0.5Z"
              fill={c.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          {/* Name label */}
          <div
            className="absolute left-4 top-4 px-2 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap shadow-sm"
            style={{ backgroundColor: c.color }}
          >
            {c.displayName}
          </div>
        </div>
      ))}
    </div>
  );
}
