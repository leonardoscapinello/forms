import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { HardDrive, Save, TestTube, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';

interface MinioConfig {
  endpoint: string;
  port: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSSL: boolean;
  region: string;
}

const EMPTY_MINIO: MinioConfig = {
  endpoint: '',
  port: '9000',
  accessKey: '',
  secretKey: '',
  bucket: '',
  useSSL: true,
  region: 'us-east-1',
};

export default function Settings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<MinioConfig>(EMPTY_MINIO);

  // Load existing settings
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('integration_type', 'minio_s3')
        .maybeSingle();

      if (data) {
        setSettingsId(data.id);
        setIsActive(data.is_active);
        const cfg = data.config as any;
        setConfig({
          endpoint: cfg.endpoint || '',
          port: cfg.port || '9000',
          accessKey: cfg.accessKey || '',
          secretKey: cfg.secretKey || '',
          bucket: cfg.bucket || '',
          useSSL: cfg.useSSL ?? true,
          region: cfg.region || 'us-east-1',
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  const updateConfig = useCallback((patch: Partial<MinioConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setTestResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        integration_type: 'minio_s3',
        label: 'MinIO S3',
        config: config as any,
        is_active: isActive,
      };

      if (settingsId) {
        await supabase.from('integration_settings').update(payload).eq('id', settingsId);
      } else {
        const { data } = await supabase.from('integration_settings').insert(payload).select().single();
        if (data) setSettingsId(data.id);
      }

      toast({ title: 'Salvo', description: 'Configuração do MinIO salva com sucesso.' });
    } catch {
      toast({ title: 'Erro', description: 'Falha ao salvar configuração.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [config, isActive, settingsId, toast]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await supabase.functions.invoke('minio-test', {
        body: { config },
      });
      if (res.error) throw res.error;
      const data = res.data as any;
      setTestResult(data?.success ? 'success' : 'error');
      toast({
        title: data?.success ? 'Conexão OK' : 'Falha na conexão',
        description: data?.message || (data?.success ? 'MinIO acessível.' : 'Verifique as credenciais.'),
        variant: data?.success ? 'default' : 'destructive',
      });
    } catch {
      setTestResult('error');
      toast({ title: 'Erro', description: 'Não foi possível testar a conexão.', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  }, [config, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure as integrações externas do sistema.
        </p>
      </div>

      {/* MinIO S3 Card */}
      <div className="rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-node-integration flex items-center justify-center">
              <HardDrive className="h-5 w-5 text-node-integration-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">MinIO S3</h2>
              <p className="text-xs text-muted-foreground">Armazenamento de arquivos compatível com S3</p>
            </div>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>

        {/* Config fields */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Endpoint</Label>
              <Input
                value={config.endpoint}
                onChange={e => updateConfig({ endpoint: e.target.value })}
                placeholder="minio.exemplo.com"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Porta</Label>
              <Input
                value={config.port}
                onChange={e => updateConfig({ port: e.target.value })}
                placeholder="9000"
                className="text-sm w-28"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Access Key</Label>
            <Input
              value={config.accessKey}
              onChange={e => updateConfig({ accessKey: e.target.value })}
              placeholder="minioadmin"
              className="text-sm font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Secret Key</Label>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={config.secretKey}
                onChange={e => updateConfig({ secretKey: e.target.value })}
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bucket</Label>
              <Input
                value={config.bucket}
                onChange={e => updateConfig({ bucket: e.target.value })}
                placeholder="form-uploads"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Região</Label>
              <Input
                value={config.region}
                onChange={e => updateConfig({ region: e.target.value })}
                placeholder="us-east-1"
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.useSSL}
                onCheckedChange={v => updateConfig({ useSSL: v })}
                id="ssl"
              />
              <Label htmlFor="ssl" className="text-xs text-muted-foreground cursor-pointer">Usar SSL (HTTPS)</Label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30 rounded-b-xl">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config.endpoint}>
            {testing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <TestTube className="mr-2 h-3.5 w-3.5" />}
            Testar conexão
            {testResult === 'success' && <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-success" />}
            {testResult === 'error' && <XCircle className="ml-2 h-3.5 w-3.5 text-destructive" />}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
