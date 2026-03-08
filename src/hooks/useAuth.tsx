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

  const fetchUserData = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('display_name, email, avatar_url').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      ]);

      const userRole = roleRes.data?.role as 'admin' | 'user' | undefined;

      // If user has no role, they are not authorized
      if (!userRole) {
        setProfile(null);
        setRole(null);
        return false;
      }

      setProfile(profileRes.data ?? null);
      setRole(userRole ?? null);
      return true;
    } catch {
      setProfile(null);
      setRole(null);
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadingTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        // We handle INITIAL_SESSION via getSession below
        if (event === 'INITIAL_SESSION') return;

        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);

        // Only re-fetch profile on actual sign-in, not token refreshes
        if (event === 'SIGNED_IN' && nextSession?.user) {
          setTimeout(() => {
            if (mounted) fetchUserData(nextSession.user.id);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setRole(null);
        }
      }
    );

    // Then get the persisted session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Don't block the whole app on profile/role fetch
          setLoading(false);
          fetchUserData(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setLoading(false);
      })
      .finally(() => {
        clearTimeout(loadingTimeout);
      });

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

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
