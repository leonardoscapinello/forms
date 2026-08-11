import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './authContext';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface CollaboratorPresence {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  cursor?: { x: number; y: number };
  lockedElementId?: string;
  currentPageId?: string;
}

const COLLABORATOR_COLORS = [
  '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
}

interface UseRealtimeCollaborationOptions {
  formId: string;
  currentPageId?: string | null;
}

export function useRealtimeCollaboration({ formId, currentPageId }: UseRealtimeCollaborationOptions) {
  const { user, profile } = useAuth();
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [lockedElements, setLockedElements] = useState<Map<string, CollaboratorPresence>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !formId) return;

    const channelName = `form-collab:${formId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channelRef.current = channel;

    // Track presence
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{
        userId: string;
        displayName: string;
        avatarUrl?: string;
        color: string;
        lockedElementId?: string;
        currentPageId?: string;
      }>();

      const others: CollaboratorPresence[] = [];
      const locks = new Map<string, CollaboratorPresence>();

      for (const [key, presences] of Object.entries(state)) {
        if (key === user.id) continue;
        const p = presences[0];
        if (p) {
          const collab: CollaboratorPresence = {
            userId: p.userId,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl,
            color: p.color,
            lockedElementId: p.lockedElementId,
            currentPageId: p.currentPageId,
          };
          others.push(collab);
          if (p.lockedElementId) {
            locks.set(p.lockedElementId, collab);
          }
        }
      }

      setCollaborators(others);
      setLockedElements(locks);
    });

    // Listen for cursor broadcasts
    channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      if (payload.userId === user.id) return;
      setCollaborators(prev =>
        prev.map(c =>
          c.userId === payload.userId
            ? { ...c, cursor: payload.cursor }
            : c
        )
      );
    });

    // Subscribe with initial presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId: user.id,
          displayName: profile?.display_name || user.email || 'Anônimo',
          avatarUrl: profile?.avatar_url,
          color: getColorForUser(user.id),
          lockedElementId: null,
          currentPageId: currentPageId || null,
        });
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [user, formId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update presence when page changes
  useEffect(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.track({
      userId: user.id,
      displayName: profile?.display_name || user.email || 'Anônimo',
      avatarUrl: profile?.avatar_url,
      color: getColorForUser(user.id),
      currentPageId: currentPageId || null,
    });
  }, [currentPageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock an element (when user starts editing)
  const lockElement = useCallback((elementId: string) => {
    if (!channelRef.current || !user) return;
    channelRef.current.track({
      userId: user.id,
      displayName: profile?.display_name || user.email || 'Anônimo',
      avatarUrl: profile?.avatar_url,
      color: getColorForUser(user.id),
      lockedElementId: elementId,
      currentPageId: currentPageId || null,
    });
  }, [user, profile, currentPageId]);

  // Unlock element
  const unlockElement = useCallback(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.track({
      userId: user.id,
      displayName: profile?.display_name || user.email || 'Anônimo',
      avatarUrl: profile?.avatar_url,
      color: getColorForUser(user.id),
      lockedElementId: null,
      currentPageId: currentPageId || null,
    });
  }, [user, profile, currentPageId]);

  // Broadcast cursor position (throttled)
  const broadcastCursor = useCallback((x: number, y: number) => {
    if (!channelRef.current || !user) return;
    if (cursorThrottleRef.current) return;
    cursorThrottleRef.current = setTimeout(() => {
      cursorThrottleRef.current = null;
    }, 50);
    channelRef.current.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { userId: user.id, cursor: { x, y } },
    });
  }, [user]);

  // Check if an element is locked by another user
  const isLockedByOther = useCallback((elementId: string): CollaboratorPresence | null => {
    return lockedElements.get(elementId) || null;
  }, [lockedElements]);

  return {
    collaborators,
    lockedElements,
    lockElement,
    unlockElement,
    broadcastCursor,
    isLockedByOther,
  };
}
