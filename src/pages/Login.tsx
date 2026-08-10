import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, Lock, Mail, User } from 'lucide-react';
import { getFunctionErrorMessage } from '@/lib/functionError';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853"/>
      <path d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.72.12-1.42.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84Z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335"/>
    </svg>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupName, setSetupName] = useState('');
  const [setupToken, setSetupToken] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await supabase.functions.invoke('setup-admin', {
          body: { action: 'status' },
          timeout: 5000,
        });

        if (cancelled) return;

        const data = res.data as { setupRequired?: boolean } | null;
        setSetupMode(!res.error && data?.setupRequired === true);
      } catch {
        if (!cancelled) setSetupMode(false);
      } finally {
        if (!cancelled) setCheckingSetup(false);
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) {
      setError(err);
    } else {
      // signIn succeeded at Supabase level — the useAuth hook will check
      // the role and sign out if unauthorized, which sets the sessionStorage flag.
      // We give it a moment to process, then check.
      await new Promise(r => setTimeout(r, 1500));
      const flag = sessionStorage.getItem('auth_unauthorized');
      if (flag) {
        setError('Acesso não autorizado. Sua conta não possui permissão para acessar esta ferramenta.');
        sessionStorage.removeItem('auth_unauthorized');
      }
    }
    setLoading(false);
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await supabase.functions.invoke('setup-admin', {
        headers: { 'x-setup-token': setupToken },
        body: { email, password, displayName: setupName },
      });
      if (res.error) throw new Error(await getFunctionErrorMessage(res.error));

      const { error: loginErr } = await signIn(email, password);
      if (loginErr) setError(loginErr);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    // Clear any previous unauthorized flag
    sessionStorage.removeItem('auth_unauthorized');
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result?.error) {
        setError(result.error instanceof Error ? result.error.message : String(result.error));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar com Google');
    }
    setGoogleLoading(false);
  };

  // Check for unauthorized flag (set by useAuth when user has no role)
  useEffect(() => {
    const flag = sessionStorage.getItem('auth_unauthorized');
    if (flag) {
      setError('Acesso não autorizado. Sua conta não possui permissão para acessar esta ferramenta. Solicite acesso a um administrador.');
      sessionStorage.removeItem('auth_unauthorized');
    }
  }, []);

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-lg bg-black flex items-center justify-center">
            <img
              src="/images/brand-icon.svg"
              alt=""
              className="h-5 w-5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <span className="text-base font-semibold text-foreground tracking-tight">Forms</span>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {setupMode ? 'Configuração inicial' : 'Entrar'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {setupMode
              ? 'Crie a conta de administrador para começar.'
              : 'Acesse sua conta para continuar.'}
          </p>
        </div>

        {/* Setup banner */}
        {setupMode && (
          <div className="mb-5 rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
            <UserPlus className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Primeiro acesso</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Esta conta terá controle total do sistema.
              </p>
            </div>
          </div>
        )}

        {/* Google sign-in (only when not in setup mode) */}
        {!setupMode && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full h-10 text-sm font-medium gap-2.5"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              Continuar com Google
            </Button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-3 text-muted-foreground">ou</span>
              </div>
            </div>
          </>
        )}

        {/* Form */}
        <form onSubmit={setupMode ? handleSetup : handleLogin} className="space-y-4">
          {setupMode && (
            <div className="space-y-1.5">
              <Label htmlFor="setup-name" className="text-xs font-medium text-muted-foreground">Nome</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="setup-name"
                  value={setupName}
                  onChange={e => setSetupName(e.target.value)}
                  placeholder="Seu nome"
                  className="pl-10 h-10"
                  autoFocus
                />
              </div>
            </div>
          )}

          {setupMode && (
            <div className="space-y-1.5">
              <Label htmlFor="setup-token" className="text-xs font-medium text-muted-foreground">Token de configuração</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="setup-token"
                  type="password"
                  value={setupToken}
                  onChange={e => setSetupToken(e.target.value)}
                  placeholder="Token temporário do ambiente"
                  required
                  className="pl-10 h-10"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs font-medium text-muted-foreground">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                required
                className="pl-10 h-10"
                autoFocus={!setupMode}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={setupMode ? 12 : undefined}
                maxLength={128}
                className="pl-10 h-10"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full h-10 text-sm font-medium" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {setupMode ? 'Criar administrador' : 'Entrar'}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground/40 text-center mt-8">
          © {new Date().getFullYear()} Forms
        </p>
      </div>
    </div>
  );
}
