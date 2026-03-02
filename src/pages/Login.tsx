import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupName, setSetupName] = useState('');

  // Check if setup is needed by trying setup-admin with a dry-run
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await Promise.race([
          supabase.functions.invoke('setup-admin', {
            body: { email: '', password: '' },
          }),
          new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error('setup_check_timeout')), 5000)
          ),
        ]);

        if (cancelled) return;

        // When function returns 403, supabase puts it in res.error
        // res.data may contain the JSON body, or it may be null
        const data = (res as any).data as any;
        const dataError = typeof data?.error === 'string' ? data.error : '';

        if (dataError.includes('Setup already completed') || dataError.includes('Users exist')) {
          setSetupMode(false);
        } else if ((res as any).error) {
          // Non-2xx response: try to read the error context
          // FunctionsHttpError stores the response, check if it's a 403 (setup done)
          const ctx = ((res as any).error as any)?.context;
          if (ctx?.status === 403) {
            setSetupMode(false);
          } else {
            // Other error (e.g. 400 "Email and password required") means no users yet
            setSetupMode(true);
          }
        } else {
          // 200 success means setup just happened or is possible
          setSetupMode(true);
        }
      } catch {
        if (!cancelled) setSetupMode(false);
      } finally {
        if (!cancelled) setCheckingSetup(false);
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await supabase.functions.invoke('setup-admin', {
        body: { email, password, displayName: setupName },
      });
      const data = res.data as any;
      if (data?.error) throw new Error(data.error);
      if (res.error) throw new Error(res.error.message);

      // Auto-login after setup
      const { error: loginErr } = await signIn(email, password);
      if (loginErr) setError(loginErr);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-xl bg-primary items-center justify-center mb-4">
            <span className="text-lg font-bold text-primary-foreground">TB</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">twobrain</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {setupMode ? 'Configure o administrador inicial' : 'Entre com suas credenciais'}
          </p>
        </div>

        {setupMode && (
          <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-primary text-sm font-medium mb-1">
              <UserPlus className="h-4 w-4" />
              Primeiro acesso
            </div>
            <p className="text-xs text-muted-foreground">
              Crie a conta do administrador que terá controle total do sistema.
            </p>
          </div>
        )}

        <form onSubmit={setupMode ? handleSetup : handleLogin} className="space-y-4">
          {setupMode && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input
                value={setupName}
                onChange={e => setSetupName(e.target.value)}
                placeholder="Seu nome"
                autoFocus
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@exemplo.com"
              required
              autoFocus={!setupMode}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={setupMode ? 'Crie uma senha forte' : '••••••••'}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block" />
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {setupMode ? 'Criar administrador' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
