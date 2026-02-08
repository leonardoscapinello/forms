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
    async function check() {
      try {
        // Call setup-admin with no body — it will return 403 if users exist
        const res = await supabase.functions.invoke('setup-admin', {
          body: { email: '', password: '' },
        });
        const data = res.data as any;
        // If it says "Setup already completed", we're past setup
        if (data?.error?.includes('Setup already completed')) {
          setSetupMode(false);
        } else {
          // Either "Email and password required" (no users) or success = setup needed
          setSetupMode(true);
        }
      } catch {
        setSetupMode(false);
      }
      setCheckingSetup(false);
    }
    check();
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
            <span className="text-lg font-bold text-primary-foreground">FF</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">FormFlow</h1>
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
