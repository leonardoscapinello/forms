import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/hooks/brandContext';
import { getCopyright } from '@/lib/brand';
import { passwordValidationError } from '@/lib/passwordRecovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { brand } = useBrand();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const recoveryStartedRecently = () => {
      try {
        const startedAt = Number(sessionStorage.getItem('password_recovery_started_at'));
        return Number.isFinite(startedAt) && Date.now() - startedAt < 15 * 60 * 1000;
      } catch {
        return false;
      }
    };
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setChecking(false);
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        try { sessionStorage.setItem('password_recovery_started_at', String(Date.now())); } catch { /* unavailable */ }
        setHasRecoverySession(true);
        setChecking(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasRecoverySession(Boolean(data.session?.user) && recoveryStartedRecently());
      setChecking(false);
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = passwordValidationError(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('Não foi possível atualizar a senha. Solicite um novo link de recuperação.');
        return;
      }
      try { sessionStorage.removeItem('password_recovery_started_at'); } catch { /* unavailable */ }
      await supabase.auth.signOut();
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-8">
          <img src={brand.logoUrl} alt="" className="h-9 w-9 shrink-0 object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground tracking-tight">{brand.productName}</p>
            <p className="text-[11px] text-muted-foreground">por {brand.ownerName}</p>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground tracking-tight">Definir nova senha</h1>
          <p className="text-sm text-muted-foreground mt-1">Use pelo menos 12 caracteres e não reutilize uma senha antiga.</p>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Validando link seguro…
          </div>
        ) : !hasRecoverySession ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
              Este link é inválido ou expirou. Solicite uma nova recuperação de senha.
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Voltar ao login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-medium text-muted-foreground">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10 h-10" required autoFocus />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-medium text-muted-foreground">Confirmar nova senha</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-10" required />
            </div>
            {error && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive" role="alert">{error}</div>}
            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Atualizar senha
            </Button>
          </form>
        )}

        <p className="text-[11px] text-muted-foreground/40 text-center mt-8">{getCopyright(undefined, brand)}</p>
      </div>
    </div>
  );
}
