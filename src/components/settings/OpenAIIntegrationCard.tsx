import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Eye, EyeOff, TestTube, CheckCircle2, XCircle, Brain, RefreshCw, Bot } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  provider: 'openai' | 'lovable';
  assistantId?: string;
}

interface OpenAIModel {
  id: string;
  owned_by: string;
}

interface OpenAIAssistant {
  id: string;
  name: string | null;
  model: string;
  description: string | null;
  created_at: number;
}

const FALLBACK_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
];

const EMPTY: OpenAIConfig = { apiKey: '', model: 'gpt-4o-mini', provider: 'openai', assistantId: '' };

export default function OpenAIIntegrationCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<OpenAIConfig>(EMPTY);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // Dynamic models & assistants
  const [models, setModels] = useState<OpenAIModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [assistants, setAssistants] = useState<OpenAIAssistant[]>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from('integration_settings')
      .select('*')
      .eq('integration_type', 'openai')
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setSettingsId(data.id);
          setIsActive(data.is_active);
          const c = (data.config || {}) as any;
          setConfig({
            apiKey: c.apiKey || '',
            model: c.model || 'gpt-4o-mini',
            provider: c.provider || 'openai',
            assistantId: c.assistantId || '',
          });
        }
        setLoading(false);
      });
  }, []);

  // Fetch models and assistants when API key changes
  useEffect(() => {
    if (config.apiKey && config.apiKey.startsWith('sk-')) {
      fetchModels(config.apiKey);
      fetchAssistants(config.apiKey);
    }
  }, [config.apiKey]);

  const fetchModels = useCallback(async (apiKey: string) => {
    setLoadingModels(true);
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const chatModels = (data.data as OpenAIModel[])
        .filter(m =>
          m.id.includes('gpt') ||
          m.id.includes('o1') ||
          m.id.includes('o3') ||
          m.id.includes('o4') ||
          m.id.includes('chatgpt')
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      setModels(chatModels);
    } catch {
      setModels([]);
    }
    setLoadingModels(false);
  }, []);

  const fetchAssistants = useCallback(async (apiKey: string) => {
    setLoadingAssistants(true);
    try {
      const res = await fetch('https://api.openai.com/v1/assistants', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setAssistants((data.data as OpenAIAssistant[]) || []);
    } catch {
      setAssistants([]);
    }
    setLoadingAssistants(false);
  }, []);

  const updateConfig = useCallback((patch: Partial<OpenAIConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = {
      integration_type: 'openai',
      label: 'OpenAI',
      is_active: isActive,
      config: config as any,
    };
    if (settingsId) {
      await (supabase as any).from('integration_settings').update(payload).eq('id', settingsId);
    } else {
      const { data } = await (supabase as any).from('integration_settings').insert(payload).select('id').single();
      if (data) setSettingsId(data.id);
    }
    setSaving(false);
    toast({ title: 'Configurações salvas' });
  }, [config, isActive, settingsId, toast]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-sentiment', {
        body: { test: true, text: 'Estou muito feliz com o produto, é incrível!' },
      });
      if (error) throw error;
      setTestResult(data?.sentiment ? 'success' : 'error');
    } catch {
      setTestResult('error');
    }
    setTesting(false);
  }, []);

  const handleRefresh = useCallback(() => {
    if (config.apiKey && config.apiKey.startsWith('sk-')) {
      fetchModels(config.apiKey);
      fetchAssistants(config.apiKey);
    }
  }, [config.apiKey, fetchModels, fetchAssistants]);

  if (loading) return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const modelOptions = models.length > 0
    ? models.map(m => ({ value: m.id, label: m.id }))
    : FALLBACK_MODELS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">OpenAI</h3>
            <p className="text-xs text-muted-foreground">Análise de sentimentos, agentes e IA</p>
          </div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <div className="space-y-4">
        {/* API Key */}
        <div className="space-y-2">
          <Label className="text-xs">API Key</Label>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={config.apiKey}
              onChange={e => updateConfig({ apiKey: e.target.value })}
              className="pr-10 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Obtenha em{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">
              platform.openai.com/api-keys
            </a>
          </p>
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Modelo</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loadingModels || !config.apiKey}
              className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${loadingModels ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
          <Select value={config.model} onValueChange={v => updateConfig({ model: v })}>
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <ScrollArea className="max-h-60">
                {modelOptions.map(m => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                ))}
              </ScrollArea>
            </SelectContent>
          </Select>
          {models.length > 0 && (
            <p className="text-[10px] text-muted-foreground">{models.length} modelos disponíveis na sua conta</p>
          )}
        </div>

        {/* Assistant / Agent selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Agente (Assistant)
            </Label>
            {loadingAssistants && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {assistants.length > 0 ? (
            <Select
              value={config.assistantId || '__none__'}
              onValueChange={v => updateConfig({ assistantId: v === '__none__' ? '' : v })}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Nenhum agente selecionado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs text-muted-foreground">Nenhum (usar modelo direto)</SelectItem>
                {assistants.map(a => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    <div className="flex flex-col">
                      <span>{a.name || a.id}</span>
                      <span className="text-[10px] text-muted-foreground">{a.model} · {a.id}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-1.5">
              <Input
                placeholder="asst_..."
                value={config.assistantId || ''}
                onChange={e => updateConfig({ assistantId: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            {assistants.length > 0
              ? `${assistants.length} agente(s) encontrado(s) na sua conta`
              : 'Insira o ID do assistente ou configure a API Key para listar automaticamente'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Compatível com a{' '}
            <a href="https://platform.openai.com/docs/api-reference/responses" target="_blank" rel="noopener noreferrer" className="underline">
              Responses API
            </a>{' '}
            da OpenAI
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>
        <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config.apiKey} className="gap-1.5">
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
          Testar
        </Button>
        {testResult === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        {testResult === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
      </div>
    </div>
  );
}
