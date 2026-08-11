import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Plus, Trash2, Save, Loader2, Eye, EyeOff, TestTube, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import {
  deleteIntegrationSetting,
  fetchEvolutionInstances,
  listIntegrationSettings,
  MASKED_INTEGRATION_SECRET,
  saveIntegrationSetting,
  testEvolutionInstance,
} from '@/lib/integrationSettings';

interface EvolutionInstance {
  id?: string;
  label: string;
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  isActive: boolean;
  isNew?: boolean;
}

export default function EvolutionApiCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error'>>({});
  const [fetchingInstances, setFetchingInstances] = useState<string | null>(null);
  const [availableInstances, setAvailableInstances] = useState<Record<string, string[]>>({});

  useEffect(() => {
    listIntegrationSettings('evolution_api')
      .then((rows) => {
        if (rows && rows.length > 0) {
          setInstances(rows.map(r => {
            const cfg = r.config as any;
            return {
              id: r.id,
              label: r.label,
              apiUrl: cfg.apiUrl || '',
              apiKey: cfg.apiKey || '',
              instanceName: cfg.instanceName || '',
              isActive: r.is_active,
            };
          }));
        }
        setLoading(false);
      })
      .catch((error: Error) => {
        toast({
          title: 'Erro ao carregar Evolution API',
          description: error.message || 'Não foi possível carregar as instâncias.',
          variant: 'destructive',
        });
        setLoading(false);
      });
  }, [toast]);

  const addInstance = useCallback(() => {
    setInstances(prev => [...prev, {
      label: `Instância ${prev.length + 1}`,
      apiUrl: '',
      apiKey: '',
      instanceName: '',
      isActive: true,
      isNew: true,
    }]);
  }, []);

  const updateInstance = useCallback((index: number, patch: Partial<EvolutionInstance>) => {
    setInstances(prev => prev.map((inst, i) => i === index ? { ...inst, ...patch } : inst));
    // Clear test result on change
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
    try {
      const row = await saveIntegrationSetting({
        id: inst.id,
        integrationType: 'evolution_api',
        label: inst.label || 'Evolution API',
        isActive: inst.isActive,
        config: { apiUrl: inst.apiUrl, apiKey: inst.apiKey, instanceName: inst.instanceName },
      });
      setInstances(prev => prev.map((p, i) => i === index
        ? { ...p, id: row.id, apiKey: row.config.apiKey || p.apiKey, isNew: false }
        : p));
      toast({
        title: inst.isActive ? 'Salvo e validado' : 'Salvo desativado',
        description: `Instância "${inst.label}" salva.`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar Evolution API',
        description: error?.message || 'Não foi possível salvar a instância.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  }, [instances, toast]);

  const deleteInstance = useCallback(async (index: number) => {
    const inst = instances[index];
    try {
      if (inst.id) {
        await deleteIntegrationSetting(inst.id, 'evolution_api');
      }
      setInstances(prev => prev.filter((_, i) => i !== index));
      toast({ title: 'Removido', description: `Instância "${inst.label}" removida.` });
    } catch (error: any) {
      toast({
        title: 'Erro ao remover instância',
        description: error?.message || 'Não foi possível remover a instância.',
        variant: 'destructive',
      });
    }
  }, [instances, toast]);

  const fetchAvailableInstances = useCallback(async (index: number) => {
    const inst = instances[index];
    const key = inst.id || `new-${index}`;
    if (!inst.apiUrl || !inst.apiKey) {
      toast({ title: 'Preencha URL e API Key', description: 'Necessário para buscar instâncias.', variant: 'destructive' });
      return;
    }
    setFetchingInstances(key);
    try {
      const names = await fetchEvolutionInstances({
        id: inst.id,
        apiUrl: inst.apiUrl,
        apiKey: inst.apiKey === MASKED_INTEGRATION_SECRET ? undefined : inst.apiKey,
      });
      setAvailableInstances(prev => ({ ...prev, [key]: names }));
      if (names.length === 0) {
        toast({ title: 'Nenhuma instância encontrada', description: 'Verifique se há instâncias criadas na Evolution API.' });
      } else if (names.length === 1 && !inst.instanceName) {
        updateInstance(index, { instanceName: names[0] });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao buscar instâncias', description: err.message || 'Falha na conexão.', variant: 'destructive' });
    } finally {
      setFetchingInstances(null);
    }
  }, [instances, toast, updateInstance]);

  const testInstance = useCallback(async (index: number) => {
    const inst = instances[index];
    const key = inst.id || `new-${index}`;
    setTesting(key);
    setTestResults(prev => { const c = { ...prev }; delete c[key]; return c; });
    try {
      const result = await testEvolutionInstance({
        id: inst.id,
        apiUrl: inst.apiUrl,
        apiKey: inst.apiKey === MASKED_INTEGRATION_SECRET ? undefined : inst.apiKey,
        instanceName: inst.instanceName,
      });
      const ok = result.connected;
      setTestResults(prev => ({ ...prev, [key]: ok ? 'success' : 'error' }));
      toast({
        title: ok ? 'Conectado' : 'Falha',
        description: ok ? 'Instância WhatsApp conectada.' : `Estado retornado: ${result.state || 'desconhecido'}.`,
        variant: ok ? 'default' : 'destructive',
      });
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [key]: 'error' }));
      toast({ title: 'Erro', description: err.message || 'Falha na conexão.', variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  }, [instances, toast]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-node-whatsapp flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-node-whatsapp-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">WhatsApp (Evolution API)</h2>
            <p className="text-xs text-muted-foreground">Enviar mensagens pelo WhatsApp no workflow</p>
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
                <Label className="text-xs text-muted-foreground">URL da API</Label>
                <Input
                  value={inst.apiUrl}
                  onChange={e => updateInstance(index, { apiUrl: e.target.value })}
                  placeholder="https://evolution.seudominio.com"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <div className="relative">
                  <Input
                    type={showKeys[key] ? 'text' : 'password'}
                    value={inst.apiKey}
                    onChange={e => updateInstance(index, { apiKey: e.target.value })}
                    placeholder="Sua chave de API"
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
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Instância</Label>
                <div className="flex items-center gap-2">
                  {(availableInstances[key]?.length ?? 0) > 0 ? (
                    <Select value={inst.instanceName} onValueChange={v => updateInstance(index, { instanceName: v })}>
                      <SelectTrigger className="text-sm flex-1">
                        <SelectValue placeholder="Selecione uma instância" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableInstances[key].map(name => (
                          <SelectItem key={name} value={name} className="text-sm">{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={inst.instanceName}
                      onChange={e => updateInstance(index, { instanceName: e.target.value })}
                      placeholder="Busque as instâncias →"
                      className="text-sm flex-1"
                    />
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => fetchAvailableInstances(index)}
                    disabled={fetchingInstances === key || !inst.apiUrl || !inst.apiKey}
                    title="Buscar instâncias da API"
                  >
                    {fetchingInstances === key
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Preencha URL e API Key, depois clique em buscar.</p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => testInstance(index)} disabled={isTesting || !inst.apiUrl || !inst.apiKey || !inst.instanceName}>
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
