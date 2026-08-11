import { useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { signInErrorMessage } from '@/lib/authMessages';
import { AuthContext, type AuthContextType } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('display_name, email, avatar_url, is_active').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      ]);

      const userRole = roleRes.data?.role as 'admin' | 'user' | undefined;

      // A role alone is not enough: deactivated accounts must lose access even
      // while an old Supabase session/token is still valid.
      if (!userRole || profileRes.data?.is_active !== true) {
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
    // Track whether we already fetched user data from getSession
    let initialFetchDone = false;
    const loadingTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        // We handle INITIAL_SESSION via getSession below
        if (event === 'INITIAL_SESSION') return;
        // Skip token refreshes entirely — no state changes needed
        if (event === 'TOKEN_REFRESHED') return;

        if (event === 'PASSWORD_RECOVERY') {
          try { sessionStorage.setItem('password_recovery_started_at', String(Date.now())); } catch { /* unavailable */ }
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          setLoading(false);
          return;
        }

        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        // Only re-fetch on SIGNED_IN if we haven't already fetched via getSession
        if (event === 'SIGNED_IN' && nextSession?.user) {
          if (initialFetchDone) {
            setLoading(false);
            return;
          }
          initialFetchDone = true;
          setLoading(true);
          setTimeout(async () => {
            if (!mounted) return;
            const authorized = await fetchUserData(nextSession.user.id);
            if (!authorized && mounted) {
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setProfile(null);
              setRole(null);
              sessionStorage.setItem('auth_unauthorized', '1');
            }
            if (mounted) setLoading(false);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          initialFetchDone = false;
          setProfile(null);
          setRole(null);
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
    );

    // Then get the persisted session
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          initialFetchDone = true;
          const authorized = await fetchUserData(session.user.id);
          if (!authorized && mounted) {
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            sessionStorage.setItem('auth_unauthorized', '1');
          }
          if (mounted) setLoading(false);
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: signInErrorMessage(error.code, error.message) };
    if (!data.user || !data.session) return { error: signInErrorMessage() };

    const authorized = await fetchUserData(data.user.id);
    if (!authorized) {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole(null);
      return { error: 'Acesso não autorizado. Solicite acesso a um administrador.' };
    }
    return { error: null };
  }, [fetchUserData]);

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
