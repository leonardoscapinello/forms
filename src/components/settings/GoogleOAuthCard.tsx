import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Eye, EyeOff, ExternalLink } from 'lucide-react';

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

const EMPTY: GoogleOAuthConfig = { clientId: '', clientSecret: '' };

export default function GoogleOAuthCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<GoogleOAuthConfig>(EMPTY);

  useEffect(() => {
    supabase
      .from('integration_settings')
      .select('*')
      .eq('integration_type', 'google_oauth')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id);
          setIsActive(data.is_active);
          const cfg = data.config as any;
          setConfig({
            clientId: cfg.clientId || '',
            clientSecret: cfg.clientSecret || '',
          });
        }
        setLoading(false);
      });
  }, []);

  const updateConfig = useCallback((patch: Partial<GoogleOAuthConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = {
      integration_type: 'google_oauth',
      label: 'Google OAuth2',
      config: config as any,
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
            <p className="text-xs text-muted-foreground">Credenciais para integração com Google Sheets, Drive, etc.</p>
          </div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <div className="p-6 space-y-4">
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
          <p>
            Crie um projeto no{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              Google Cloud Console <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <p>Ative a API do Google Sheets e crie credenciais OAuth2 (Web Application).</p>
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

      <div className="flex items-center justify-end px-6 py-4 border-t border-border bg-muted/30 rounded-b-xl">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
