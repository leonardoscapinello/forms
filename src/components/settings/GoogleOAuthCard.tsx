import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Eye, EyeOff, ExternalLink, CheckCircle2, Unplug, Copy } from 'lucide-react';

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  connectedEmail?: string;
  connectedAt?: string;
}

const EMPTY: GoogleOAuthConfig = { clientId: '', clientSecret: '' };

export default function GoogleOAuthCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<GoogleOAuthConfig>(EMPTY);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from('integration_settings')
      .select('*')
      .eq('integration_type', 'google_oauth')
      .maybeSingle();
    if (data) {
      setSettingsId(data.id);
      setIsActive(data.is_active);
      const cfg = data.config as any;
      setConfig({
        clientId: cfg.clientId || '',
        clientSecret: cfg.clientSecret || '',
        accessToken: cfg.accessToken,
        refreshToken: cfg.refreshToken,
        tokenExpiry: cfg.tokenExpiry,
        connectedEmail: cfg.connectedEmail,
        connectedAt: cfg.connectedAt,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Check for OAuth callback result in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_oauth');
    if (result === 'success') {
      toast({ title: 'Google conectado!', description: 'Autenticação OAuth2 concluída com sucesso.' });
      loadSettings();
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('google_oauth');
      window.history.replaceState({}, '', url.toString());
    } else if (result === 'error') {
      const reason = params.get('reason') || 'desconhecido';
      toast({ title: 'Erro na autenticação', description: `Falha: ${reason}`, variant: 'destructive' });
      const url = new URL(window.location.href);
      url.searchParams.delete('google_oauth');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, [toast, loadSettings]);

  const updateConfig = useCallback((patch: Partial<GoogleOAuthConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = {
      integration_type: 'google_oauth',
      label: 'Google OAuth2',
      config: { clientId: config.clientId, clientSecret: config.clientSecret, accessToken: config.accessToken, refreshToken: config.refreshToken, tokenExpiry: config.tokenExpiry, connectedEmail: config.connectedEmail, connectedAt: config.connectedAt } as any,
      is_active: isActive,
    };
    if (settingsId) {
      await supabase.from('integration_settings').update(payload).eq('id', settingsId);
    } else {
      const { data } = await supabase.from('integration_settings').insert(payload).select().single();
      if (data) setSettingsId(data.id);
    }
    toast({ title: 'Salvo', description: 'Credenciais Google OAuth salvas.' });
    setSaving(false);
  }, [config, isActive, settingsId, toast]);

  const handleConnect = useCallback(async () => {
    // Save first to make sure credentials are persisted
    await handleSave();
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-oauth-start', {
        body: { returnUrl: window.location.origin + '/settings' },
      });
      if (error || !data?.authUrl) {
        toast({ title: 'Erro', description: data?.error || 'Não foi possível iniciar autenticação.', variant: 'destructive' });
        setConnecting(false);
        return;
      }
      // Redirect to Google consent
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      setConnecting(false);
    }
  }, [handleSave, toast]);

  const handleDisconnect = useCallback(async () => {
    const updated = { clientId: config.clientId, clientSecret: config.clientSecret };
    setConfig({ ...updated });
    if (settingsId) {
      await supabase.from('integration_settings').update({ config: updated as any }).eq('id', settingsId);
    }
    toast({ title: 'Desconectado', description: 'Tokens Google removidos.' });
  }, [config.clientId, config.clientSecret, settingsId, toast]);

  const isConnected = !!config.accessToken;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Google OAuth2</h2>
            <p className="text-xs text-muted-foreground">Credenciais para Google Sheets, Drive, etc.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Conectado
            </div>
          )}
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Connected status */}
        {isConnected && config.connectedEmail && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between">
            <div className="text-xs space-y-0.5">
              <p className="font-medium text-foreground">Conta conectada: <span className="font-mono">{config.connectedEmail}</span></p>
              {config.connectedAt && (
                <p className="text-muted-foreground">
                  Conectado em {new Date(config.connectedAt).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleDisconnect}>
              <Unplug className="h-3 w-3" />
              Desconectar
            </Button>
          </div>
        )}

        {/* Instructions */}
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">Como configurar:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Acesse o{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                Google Cloud Console <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>Ative a <strong>Google Sheets API</strong> e <strong>Google Drive API</strong></li>
            <li>Crie credenciais <strong>OAuth 2.0 → Web Application</strong></li>
            <li>Adicione a URI de redirecionamento abaixo nas <strong>Authorized redirect URIs</strong></li>
          </ol>
        </div>

        {/* Redirect URI for copy */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Redirect URI (copie para o Google Console)</Label>
          <div className="flex gap-2">
            <Input value={redirectUri} readOnly className="text-xs font-mono bg-muted/30" />
            <Button
              variant="outline"
              size="icon"
              className="flex-shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(redirectUri);
                toast({ title: 'Copiado!' });
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Client ID</Label>
          <Input
            value={config.clientId}
            onChange={e => updateConfig({ clientId: e.target.value })}
            placeholder="123456789.apps.googleusercontent.com"
            className="text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Client Secret</Label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={config.clientSecret}
              onChange={e => updateConfig({ clientSecret: e.target.value })}
              placeholder="••••••••"
              className="text-sm font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30 rounded-b-xl">
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          disabled={!config.clientId || !config.clientSecret || connecting}
          onClick={handleConnect}
        >
          {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            </svg>
          )}
          {isConnected ? 'Reconectar' : 'Conectar com Google'}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
