import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: { display_name: string; email: string; avatar_url?: string } | null;
  role: 'admin' | 'user' | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('display_name, email, avatar_url').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      ]);

      setProfile(profileRes.data ?? null);
      setRole((roleRes.data?.role as 'admin' | 'user' | undefined) ?? null);
    } catch {
      setProfile(null);
      setRole(null);
    }
  }, []);

  const recoverSession = useCallback(async (): Promise<Session | null> => {
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession) return existingSession;

    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return refreshed.session ?? null;
  }, []);

  useEffect(() => {
    let mounted = true;

    const applySession = async (incomingSession: Session | null, shouldTryRecover = false) => {
      let resolvedSession = incomingSession;

      if (!resolvedSession && shouldTryRecover) {
        resolvedSession = await recoverSession();
      }

      if (!mounted) return;

      setSession(resolvedSession);
      setUser(resolvedSession?.user ?? null);

      if (resolvedSession?.user) {
        await fetchUserData(resolvedSession.user.id);
      } else {
        setProfile(null);
        setRole(null);
      }

      if (mounted) setLoading(false);
    };

    // IMPORTANT: Set up listener FIRST, then get initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (!mounted) return;

        // Ignore INITIAL_SESSION — we handle it via getSession below
        if (event === 'INITIAL_SESSION') return;

        setLoading(true);

        // Defer to avoid Supabase auth deadlock
        setTimeout(() => {
          void applySession(nextSession, !nextSession);
        }, 0);
      }
    );

    // Get the initial session (with recovery fallback)
    setLoading(true);
    void supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session, !session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData, recoverSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, profile, role, loading, signIn, signOut,
      isAdmin: role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
