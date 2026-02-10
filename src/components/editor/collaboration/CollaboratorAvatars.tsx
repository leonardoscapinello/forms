import { CollaboratorPresence } from '@/hooks/useRealtimeCollaboration';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  collaborators: CollaboratorPresence[];
}

export default function CollaboratorAvatars({ collaborators }: Props) {
  if (collaborators.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {collaborators.slice(0, 5).map((c) => (
        <Tooltip key={c.userId}>
          <TooltipTrigger asChild>
            <div
              className="h-7 w-7 rounded-full border-2 border-card flex items-center justify-center text-[10px] font-bold text-white shadow-sm cursor-default"
              style={{ backgroundColor: c.color }}
            >
              {c.avatarUrl ? (
                <img src={c.avatarUrl} alt={c.displayName} className="h-full w-full rounded-full object-cover" />
              ) : (
                c.displayName.charAt(0).toUpperCase()
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {c.displayName}
          </TooltipContent>
        </Tooltip>
      ))}
      {collaborators.length > 5 && (
        <div className="h-7 w-7 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
          +{collaborators.length - 5}
        </div>
      )}
    </div>
  );
}
