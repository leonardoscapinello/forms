import { CollaboratorPresence } from '@/hooks/useRealtimeCollaboration';
import { Lock } from 'lucide-react';

interface Props {
  lockedBy: CollaboratorPresence;
}

export default function ElementLockIndicator({ lockedBy }: Props) {
  return (
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white shadow-sm whitespace-nowrap"
      style={{ backgroundColor: lockedBy.color }}
    >
      <Lock className="h-2.5 w-2.5" />
      <span>{lockedBy.displayName}</span>
    </div>
  );
}
