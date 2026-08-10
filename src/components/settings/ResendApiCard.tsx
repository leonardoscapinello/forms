import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Mail, Plus, Trash2, Save, Loader2, Eye, EyeOff, TestTube, CheckCircle2, XCircle, Send } from 'lucide-react';

interface ResendInstance {
  id?: string;
  label: string;
  apiKey: string;
  defaultFrom: string;
  isActive: boolean;
  isNew?: boolean;
}

export default function ResendApiCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [instances, setInstances] = useState<ResendInstance[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error'>>({});

  useEffect(() => {
    supabase.from('integration_settings')
      .select('*')
      .eq('integration_type', 'resend')
      .then(({ data: rows }) => {
        if (rows && rows.length > 0) {
          setInstances(rows.map(r => {
            const cfg = r.config as any;
            return {
              id: r.id,
              label: r.label,
              apiKey: cfg.apiKey || '',
              defaultFrom: cfg.defaultFrom || '',
              isActive: r.is_active,
            };
          }));
        }
        setLoading(false);
      });
  }, []);

  const addInstance = useCallback(() => {
    setInstances(prev => [...prev, {
      label: `Resend ${prev.length + 1}`,
      apiKey: '',
      defaultFrom: '',
      isActive: true,
      isNew: true,
    }]);
  }, []);

  const updateInstance = useCallback((index: number, patch: Partial<ResendInstance>) => {
    setInstances(prev => prev.map((inst, i) => i === index ? { ...inst, ...patch } : inst));
    setTestResults(prev => {
      const key = instances[index]?.id || `new-${index}`;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }, [instances]);

  const saveInstance = useCallback(async (index: number) => {
    const inst = instances[index];
    const key = inst.id || `new-${index}`;
    setSaving(key);
    const payload = {
      integration_type: 'resend',
      label: inst.label || 'Resend',
      config: { apiKey: inst.apiKey, defaultFrom: inst.defaultFrom } as any,
      is_active: inst.isActive,
    };
    if (inst.id) {
      await supabase.from('integration_settings').update(payload).eq('id', inst.id);
    } else {
      const { data } = await supabase.from('integration_settings').insert(payload).select().single();
      if (data) {
        setInstances(prev => prev.map((p, i) => i === index ? { ...p, id: data.id, isNew: false } : p));
      }
    }
    toast({ title: 'Salvo', description: `Instância "${inst.label}" salva.` });
    setSaving(null);
  }, [instances, toast]);

  const deleteInstance = useCallback(async (index: number) => {
    const inst = instances[index];
    if (inst.id) {
      await supabase.from('integration_settings').delete().eq('id', inst.id);
    }
    setInstances(prev => prev.filter((_, i) => i !== index));
    toast({ title: 'Removido', description: `Instância "${inst.label}" removida.` });
  }, [instances, toast]);

  const testInstance = useCallback(async (index: number) => {
    const inst = instances[index];
    const key = inst.id || `new-${index}`;
    if (!inst.id) {
      toast({ title: 'Salve primeiro', description: 'Salve a instância antes de testar.', variant: 'destructive' });
      return;
    }
    setTesting(key);
    setTestResults(prev => { const c = { ...prev }; delete c[key]; return c; });
    try {
      const { data: res } = await supabase.functions.invoke('resend-send', {
        body: {
          instanceId: inst.id,
          toEmail: inst.defaultFrom || 'delivered@resend.dev',
          fromEmail: inst.defaultFrom || 'onboarding@resend.dev',
          subject: 'Teste de conexão — Forms',
          bodyText: 'Este é um e-mail de teste enviado pela plataforma.',
          testMode: true,
        },
      });
      setTestResults(prev => ({ ...prev, [key]: res?.success ? 'success' : 'error' }));
      toast({
        title: res?.success ? 'E-mail enviado' : 'Falha',
        description: res?.success ? 'E-mail de teste enviado com sucesso.' : `Erro: ${JSON.stringify(res?.data || res?.error).slice(0, 120)}`,
        variant: res?.success ? 'default' : 'destructive',
      });
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [key]: 'error' }));
      toast({ title: 'Erro', description: err.message || 'Falha na conexão.', variant: 'destructive' });
    }
    setTesting(null);
  }, [instances, toast]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-node-email flex items-center justify-center">
            <Mail className="h-5 w-5 text-node-email-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">E-mail (Resend)</h2>
            <p className="text-xs text-muted-foreground">Enviar e-mails transacionais no workflow</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={addInstance}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nova instância
        </Button>
      </div>

      <div className="p-6 space-y-6">
        {instances.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma instância configurada. Clique em "Nova instância" para adicionar.</p>
        )}

        {instances.map((inst, index) => {
          const key = inst.id || `new-${index}`;
          const isSaving = saving === key;
          const isTesting = testing === key;
          return (
            <div key={key} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={inst.isActive}
                    onCheckedChange={v => updateInstance(index, { isActive: v })}
                  />
                  <Input
                    value={inst.label}
                    onChange={e => updateInstance(index, { label: e.target.value })}
                    className="text-sm font-medium border-0 shadow-none focus-visible:ring-0 px-0 w-48 bg-transparent"
                    placeholder="Nome da instância"
                  />
                </div>
                <button onClick={() => deleteInstance(index)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <div className="relative">
                  <Input
                    type={showKeys[key] ? 'text' : 'password'}
                    value={inst.apiKey}
                    onChange={e => updateInstance(index, { apiKey: e.target.value })}
                    placeholder="re_xxxxxxxxxx"
                    className="text-sm font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeys(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKeys[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Obtenha em <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">resend.com/api-keys</a></p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">E-mail remetente padrão</Label>
                <Input
                  value={inst.defaultFrom}
                  onChange={e => updateInstance(index, { defaultFrom: e.target.value })}
                  placeholder="noreply@seudominio.com"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">Domínio deve estar verificado no Resend. Para testes use <code className="font-mono text-[10px] bg-muted px-1 rounded">onboarding@resend.dev</code></p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => testInstance(index)} disabled={isTesting || !inst.apiKey}>
                  {isTesting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <TestTube className="mr-1.5 h-3.5 w-3.5" />}
                  Testar
                  {testResults[key] === 'success' && <CheckCircle2 className="ml-1.5 h-3.5 w-3.5 text-success" />}
                  {testResults[key] === 'error' && <XCircle className="ml-1.5 h-3.5 w-3.5 text-destructive" />}
                </Button>
                <Button size="sm" onClick={() => saveInstance(index)} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Salvar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
