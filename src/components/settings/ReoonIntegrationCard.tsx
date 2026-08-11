import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Save, Loader2, Eye, EyeOff, Mail,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { listIntegrationSettings, saveIntegrationSetting } from '@/lib/integrationSettings';

interface ReoonConfig {
  apiKey: string;
  mode: 'quick' | 'power';
}

const EMPTY_REOON: ReoonConfig = { apiKey: '', mode: 'power' };

export default function ReoonIntegrationCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<ReoonConfig>(EMPTY_REOON);

  useEffect(() => {
    listIntegrationSettings('reoon_email')
      .then((rows) => {
        const data = rows[0];
        if (data) {
          setSettingsId(data.id);
          setIsActive(data.is_active);
          const cfg = data.config as any;
          setConfig({
            apiKey: cfg.apiKey || '',
            mode: cfg.mode || 'power',
          });
        }
        setLoading(false);
      })
      .catch((error: Error) => {
        toast({
          title: 'Erro ao carregar Reoon',
          description: error.message || 'Não foi possível carregar a integração.',
          variant: 'destructive',
        });
        setLoading(false);
      });
  }, [toast]);

  const updateConfig = useCallback((patch: Partial<ReoonConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const row = await saveIntegrationSetting({
        id: settingsId,
        integrationType: 'reoon_email',
        label: 'Reoon Email Verifier',
        isActive,
        config: { ...config },
      });
      setSettingsId(row.id);
      setConfig(prev => ({ ...prev, apiKey: row.config.apiKey || prev.apiKey }));
      toast({ title: isActive ? 'Salvo e validado' : 'Salvo', description: 'Configuração do Reoon salva.' });
    } catch (error: any) {
      toast({
        title: 'Credencial Reoon inválida',
        description: error?.message || 'A conexão falhou e nada foi salvo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [config, isActive, settingsId, toast]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Mail className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Reoon Email Verifier</h2>
            <p className="text-xs text-muted-foreground">Validação de e-mails em tempo real</p>
          </div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <div className="p-6 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">API Key</Label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={config.apiKey}
              onChange={e => updateConfig({ apiKey: e.target.value })}
              placeholder="Sua chave de API do Reoon"
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
          <p className="text-xs text-muted-foreground mt-1">
            Obtenha sua chave em{' '}
            <a href="https://emailverifier.reoon.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              emailverifier.reoon.com
            </a>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Modo de verificação</Label>
          <Select value={config.mode} onValueChange={v => updateConfig({ mode: v as 'quick' | 'power' })}>
            <SelectTrigger className="text-sm max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="power">Power (completo)</SelectItem>
              <SelectItem value="quick">Quick (rápido)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Power: verificação completa com SMTP. Quick: apenas sintaxe e domínio.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end px-6 py-4 border-t border-border bg-muted/30 rounded-b-xl">
        <Button size="sm" onClick={handleSave} disabled={saving || !config.apiKey}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
