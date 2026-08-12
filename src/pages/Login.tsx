import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/authContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Lock, Mail } from 'lucide-react';
import { getCopyright } from '@/lib/brand';
import { useBrand } from '@/hooks/brandContext';
import { supabase } from '@/integrations/supabase/client';
import { passwordResetRedirectUrl } from '@/lib/passwordRecovery';
import { getFunctionErrorMessage } from '@/lib/functionError';

export default function Login() {
  const { signIn } = useAuth();
  const { brand } = useBrand();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [notice, setNotice] = useState(
    (location.state as { passwordReset?: boolean } | null)?.passwordReset
      ? 'Senha atualizada. Entre novamente com a nova senha.'
      : '',
  );

  useEffect(() => {
    let cancelled = false;

    void supabase.functions.invoke('setup-admin', {
      body: { action: 'status' },
      timeout: 5_000,
    }).then(({ data, error: setupError }) => {
      if (cancelled) return;
      const status = data as { setupRequired?: boolean } | null;
      setSetupMode(!setupError && status?.setupRequired === true);
    }).catch(() => {
      if (!cancelled) setSetupMode(false);
    }).finally(() => {
      if (!cancelled) setCheckingSetup(false);
    });

    return () => { cancelled = true; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: signInError } = await signIn(email.trim(), password);
      if (signInError) setError(signInError);
    } catch {
      setError('Não foi possível entrar agora. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const redirectTo = passwordResetRedirectUrl(import.meta.env.VITE_PUBLIC_APP_URL);
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (recoveryError) {
        setError('Não foi possível enviar a recuperação agora. Aguarde um instante e tente novamente.');
        return;
      }
      setNotice('Se existir uma conta ativa para este e-mail, enviaremos um link de recuperação. Verifique também a caixa de spam.');
    } catch {
      setError('Não foi possível enviar a recuperação agora. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const { data: setupData, error: setupError } = await supabase.functions.invoke('setup-admin', {
        headers: { 'x-setup-token': setupToken },
        body: {
          email: email.trim(),
          password,
          displayName: setupName.trim(),
        },
      });
      if (setupError) throw new Error(await getFunctionErrorMessage(setupError));
      if ((setupData as { success?: boolean } | null)?.success !== true) {
        throw new Error('A criação do administrador não foi confirmada.');
      }

      const { error: loginError } = await signIn(email.trim(), password);
      if (loginError) setError(loginError);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Não foi possível criar o administrador.');
    } finally {
      setLoading(false);
    }
  };

  // Check for unauthorized flag (set by useAuth when user has no role)
  useEffect(() => {
    const flag = sessionStorage.getItem('auth_unauthorized');
    if (flag) {
      setError('Acesso não autorizado. Sua conta não possui permissão para acessar esta ferramenta. Solicite acesso a um administrador.');
      sessionStorage.removeItem('auth_unauthorized');
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <img
            src={brand.logoUrl}
            alt=""
            className="h-9 w-9 shrink-0 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground tracking-tight">{brand.productName}</p>
            <p className="text-[11px] text-muted-foreground">por {brand.ownerName}</p>
          </div>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {setupMode ? 'Configuração inicial' : recoveryMode ? 'Recuperar senha' : 'Entrar'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {setupMode
              ? 'Crie a primeira conta de administrador usando o token temporário do ambiente.'
              : recoveryMode
                ? 'Enviaremos um link seguro para o e-mail da conta.'
                : 'Acesse sua conta para continuar.'}
          </p>
        </div>

        {checkingSetup && (
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Verificando configuração do ambiente…
          </div>
        )}

        {setupMode && (
          <div className="mb-5 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground">Primeiro acesso protegido</p>
            <p className="mt-0.5 text-xs text-muted-foreground">A criação só será aceita enquanto não existir usuário e o token estiver correto.</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={setupMode ? handleSetup : recoveryMode ? handleRecovery : handleLogin} className="space-y-4">
          {setupMode && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="setup-name" className="text-xs font-medium text-muted-foreground">Nome</Label>
                <Input
                  id="setup-name"
                  value={setupName}
                  onChange={(event) => setSetupName(event.target.value)}
                  placeholder="Seu nome"
                  maxLength={100}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-token" className="text-xs font-medium text-muted-foreground">Token de configuração</Label>
                <Input
                  id="setup-token"
                  type="password"
                  value={setupToken}
                  onChange={(event) => setSetupToken(event.target.value)}
                  placeholder="Token temporário do ambiente"
                  required
                  autoComplete="off"
                  className="h-10"
                />
              </div>
            </>
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
                placeholder="seu@email.com"
                required
                className="pl-10 h-10"
                autoFocus
              />
            </div>
          </div>

          {!setupMode && notice && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5" role="status">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>
            </div>
          )}

          {(setupMode || !recoveryMode) && (
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
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5" role="alert">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full h-10 text-sm font-medium" disabled={loading || checkingSetup}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {setupMode ? 'Criar administrador' : recoveryMode ? 'Enviar link de recuperação' : 'Entrar'}
          </Button>

          {!setupMode && (
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              disabled={loading || checkingSetup}
              onClick={() => { setRecoveryMode((current) => !current); setError(''); setNotice(''); }}
            >
              {recoveryMode && <ArrowLeft className="h-3.5 w-3.5" />}
              {recoveryMode ? 'Voltar ao login' : 'Esqueci minha senha'}
            </button>
          )}
        </form>

        <p className="text-[11px] text-muted-foreground/40 text-center mt-8">
          {getCopyright(undefined, brand)}
        </p>
      </div>
    </div>
  );
}
