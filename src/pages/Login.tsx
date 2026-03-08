import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, Lock, Mail, User, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

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
    <div className="min-h-screen flex bg-background">
      {/* Left — branding */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] relative flex-col justify-between p-10 overflow-hidden"
        style={{ background: '#0C0E17' }}
      >
        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full border-2 opacity-[0.06]"
          style={{ borderColor: 'hsl(var(--primary))' }}
        />
        <div className="absolute -bottom-32 -left-16 w-[400px] h-[400px] rounded-full border opacity-[0.03]"
          style={{ borderColor: 'hsl(var(--primary))' }}
        />

        {/* Top: logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <img
                src="/images/twobrain-icon.svg"
                alt="twobrain"
                className="h-5 w-5 brightness-0 invert"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <span className="text-lg font-semibold tracking-tight"
              style={{ color: 'hsl(var(--primary-foreground))' }}
            >
              twobrain
            </span>
          </div>
        </motion.div>

        {/* Center: tagline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative z-10 space-y-4"
        >
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight"
            style={{ color: 'hsl(var(--primary-foreground))' }}
          >
            Funis conversacionais<br />
            de alta performance.
          </h2>
          <p className="text-sm leading-relaxed max-w-[320px]"
            style={{ color: 'hsl(var(--primary-foreground) / 0.65)' }}
          >
            Crie, publique e otimize formulários inteligentes que convertem mais.
          </p>
        </motion.div>

        {/* Bottom: footer */}
        <div className="relative z-10">
          <p className="text-xs"
            style={{ color: 'hsl(var(--primary-foreground) / 0.4)' }}
          >
            © {new Date().getFullYear()} twobrain
          </p>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-12">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <img
                src="/images/twobrain-icon.svg"
                alt="twobrain"
                className="h-4.5 w-4.5 brightness-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <span className="text-base font-semibold text-foreground tracking-tight">twobrain</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {setupMode ? 'Configuração inicial' : 'Entrar na sua conta'}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {setupMode
                ? 'Crie a conta de administrador para começar a usar a plataforma.'
                : 'Insira suas credenciais para acessar o painel.'}
            </p>
          </div>

          {/* Setup banner */}
          {setupMode && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 rounded-xl border border-primary/25 bg-primary/5 p-4 flex items-start gap-3"
            >
              <div className="mt-0.5 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Primeiro acesso detectado</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Esta conta terá controle total do sistema.
                </p>
              </div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={setupMode ? handleSetup : handleLogin} className="space-y-5">
            {setupMode && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Nome
                </Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                  <Input
                    value={setupName}
                    onChange={e => setSetupName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="pl-11 h-12 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-colors"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                  className="pl-11 h-12 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-colors"
                  autoFocus={!setupMode}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={setupMode ? 'Crie uma senha forte' : '••••••••'}
                  required
                  className="pl-11 h-12 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-colors"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3"
              >
                <p className="text-sm text-destructive flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block shrink-0" />
                  {error}
                </p>
              </motion.div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-sm font-semibold rounded-xl mt-1 gap-2"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {setupMode ? 'Criar administrador' : 'Continuar'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Mobile footer */}
          <p className="text-xs text-muted-foreground/50 text-center mt-10 lg:hidden">
            © {new Date().getFullYear()} twobrain
          </p>
        </motion.div>
      </div>
    </div>
  );
}
