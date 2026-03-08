import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, Lock, Mail, User } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupName, setSetupName] = useState('');

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

        const data = (res as any).data as any;
        const dataError = typeof data?.error === 'string' ? data.error : '';

        if (dataError.includes('Setup already completed') || dataError.includes('Users exist')) {
          setSetupMode(false);
        } else if ((res as any).error) {
          const ctx = ((res as any).error as any)?.context;
          if (ctx?.status === 403) {
            setSetupMode(false);
          } else {
            setSetupMode(true);
          }
        } else {
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
    <div className="min-h-screen flex">
      {/* Left side — branding panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden items-center justify-center bg-primary">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-[15%] left-[10%] w-64 h-64 rounded-full border border-primary-foreground/30" />
          <div className="absolute bottom-[20%] right-[5%] w-96 h-96 rounded-full border border-primary-foreground/20" />
          <div className="absolute top-[50%] left-[40%] w-48 h-48 rounded-full border border-primary-foreground/25" />
        </div>

        <div className="relative z-10 px-12 max-w-md text-center">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-primary-foreground/15 backdrop-blur-sm items-center justify-center mb-6 border border-primary-foreground/10">
            <img
              src="/images/twobrain-icon.svg"
              alt="twobrain"
              className="h-8 w-8"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-2xl font-bold text-primary-foreground">TB</span>';
              }}
            />
          </div>
          <h2 className="text-2xl font-bold text-primary-foreground mb-3 tracking-tight">
            twobrain
          </h2>
          <p className="text-sm text-primary-foreground/70 leading-relaxed">
            Plataforma de funis conversacionais de alta performance. Crie, publique e otimize formulários inteligentes.
          </p>
        </div>
      </div>

      {/* Right side — login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-primary items-center justify-center mb-4">
              <img
                src="/images/twobrain-icon.svg"
                alt="twobrain"
                className="h-7 w-7 brightness-0 invert"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-xl font-bold text-primary-foreground">TB</span>';
                }}
              />
            </div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">twobrain</h1>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {setupMode ? 'Configuração inicial' : 'Bem-vindo de volta'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {setupMode
                ? 'Crie a conta do administrador para começar.'
                : 'Entre com suas credenciais para continuar.'}
            </p>
          </div>

          {setupMode && (
            <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Primeiro acesso</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Esta conta terá controle total do sistema.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={setupMode ? handleSetup : handleLogin} className="space-y-4">
            {setupMode && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-foreground">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={setupName}
                    onChange={e => setSetupName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="pl-10 h-11"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="pl-10 h-11"
                  autoFocus={!setupMode}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={setupMode ? 'Crie uma senha forte' : '••••••••'}
                  required
                  className="pl-10 h-11"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
                <p className="text-sm text-destructive flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block shrink-0" />
                  {error}
                </p>
              </div>
            )}

            <Button type="submit" className="w-full h-11 text-sm font-medium mt-2" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {setupMode ? 'Criar administrador' : 'Entrar'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-8">
            twobrain © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
