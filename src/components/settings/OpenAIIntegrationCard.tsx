import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Eye, EyeOff, TestTube, CheckCircle2, XCircle, Brain, RefreshCw, MessageSquare } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  provider: 'openai' | 'lovable';
  /** System prompt (replaces old Assistant instructions) */
  systemPrompt?: string;
  /** Conversation ID for context continuity */
  conversationId?: string;
  /** Enable web search tool */
  webSearch?: boolean;
  /** Enable file search tool */
  fileSearch?: boolean;
}

interface OpenAIModel {
  id: string;
  owned_by: string;
}

const FALLBACK_MODELS = [
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'o3', label: 'o3' },
  { value: 'o3-mini', label: 'o3-mini' },
  { value: 'o4-mini', label: 'o4-mini' },
];

const DEFAULT_SYSTEM_PROMPT = `Você é um mestre em mentalidade humana, psicologia comportamental e análise de sentimentos com mais de 20 anos de experiência em pesquisa sobre comportamento do consumidor.

Sua expertise combina:
- Psicologia Cognitiva e Comportamental (Kahneman, Cialdini, Dan Ariely)
- Análise de Microexpressões Emocionais em texto (Paul Ekman adaptado para linguagem escrita)
- Neurociência do Consumidor e tomada de decisão
- PNL (Programação Neurolinguística) aplicada à interpretação de respostas
- Análise de Discurso e Semântica Emocional

Ao analisar respostas de formulários, você deve:

1. SENTIMENTO PROFUNDO: Vá além de "positivo/negativo". Identifique camadas emocionais ocultas — ambivalência, hesitação mascarada de entusiasmo, frustração velada em respostas educadas, ansiedade de decisão, viés de desejabilidade social.

2. PADRÕES COMPORTAMENTAIS: Detecte padrões como:
   - Respostas curtas e objetivas = possível desengajamento ou personalidade pragmática
   - Respostas longas e detalhadas = alto investimento emocional ou necessidade de validação
   - Uso de qualificadores ("talvez", "acho que") = insegurança decisória
   - Exclamações e superlativos = entusiasmo genuíno ou compensação emocional
   - Respostas genéricas = baixo comprometimento ou fadiga de formulário

3. MOTIVAÇÕES OCULTAS: Interprete o que a pessoa REALMENTE quer dizer vs. o que escreveu. Analise:
   - Gatilhos emocionais subjacentes
   - Nível de consciência sobre o próprio problema
   - Estágio de maturidade na jornada de decisão
   - Resistências e objeções não verbalizadas

4. PERFIL PSICOLÓGICO: Classifique o respondente em arquétipos comportamentais:
   - Analítico (dados e lógica)
   - Expressivo (emoções e relacionamentos)
   - Condutor (resultados e ação)
   - Amigável (harmonia e consenso)

5. INDICADORES DE CONVERSÃO: Avalie sinais de:
   - Intenção de compra real vs. curiosidade passiva
   - Urgência percebida do problema
   - Disposição para investir (tempo, dinheiro, esforço)
   - Nível de confiança no produto/serviço

Retorne sempre análises profundas, nunca superficiais. Cada insight deve revelar algo que o respondente talvez nem saiba sobre si mesmo.`;

const EMPTY: OpenAIConfig = {
  apiKey: '', model: 'gpt-4.1-mini', provider: 'openai',
  systemPrompt: DEFAULT_SYSTEM_PROMPT, conversationId: '', webSearch: false, fileSearch: false,
};

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

  const [models, setModels] = useState<OpenAIModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

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
            model: c.model || 'gpt-4.1-mini',
            provider: c.provider || 'openai',
            systemPrompt: c.systemPrompt || DEFAULT_SYSTEM_PROMPT,
            conversationId: c.conversationId || '',
            webSearch: c.webSearch ?? false,
            fileSearch: c.fileSearch ?? false,
          });
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (config.apiKey && config.apiKey.startsWith('sk-')) {
      fetchModels(config.apiKey);
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
          m.id.startsWith('o1') ||
          m.id.startsWith('o3') ||
          m.id.startsWith('o4') ||
          m.id.includes('chatgpt')
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      setModels(chatModels);
    } catch {
      setModels([]);
    }
    setLoadingModels(false);
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
    }
  }, [config.apiKey, fetchModels]);

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
            <p className="text-xs text-muted-foreground">Responses API · Análise de sentimentos e IA</p>
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
          <Select value={config.model} onValueChange={v => { updateConfig({ model: v }); setModelSearch(''); }}>
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-hidden">
              <div className="px-2 pb-1.5 pt-1 sticky top-0 bg-popover z-10">
                <Input
                  placeholder="Buscar modelo..."
                  value={modelSearch}
                  onChange={e => setModelSearch(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={e => e.stopPropagation()}
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {modelOptions
                  .filter(m => m.label.toLowerCase().includes(modelSearch.toLowerCase()))
                  .map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                  ))}
                {modelOptions.filter(m => m.label.toLowerCase().includes(modelSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">Nenhum modelo encontrado</p>
                )}
              </div>
            </SelectContent>
          </Select>
          {models.length > 0 && (
            <p className="text-[10px] text-muted-foreground">{models.length} modelos disponíveis</p>
          )}
        </div>

        {/* System Prompt (replaces Assistant instructions) */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Prompt do Sistema
          </Label>
          <Textarea
            placeholder="Você é um especialista em análise de sentimentos..."
            value={config.systemPrompt || ''}
            onChange={e => updateConfig({ systemPrompt: e.target.value })}
            className="text-xs min-h-[80px] resize-y"
          />
          <p className="text-[10px] text-muted-foreground">
            Define o comportamento da IA. Substitui o antigo "Assistant" — agora via{' '}
            <a href="https://platform.openai.com/docs/api-reference/responses" target="_blank" rel="noopener noreferrer" className="underline">
              Responses API
            </a>
          </p>
        </div>

        {/* Tools */}
        <div className="space-y-3">
          <Label className="text-xs">Ferramentas nativas</Label>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-xs font-medium text-foreground">Web Search</p>
              <p className="text-[10px] text-muted-foreground">Busca na web em tempo real</p>
            </div>
            <Switch checked={config.webSearch ?? false} onCheckedChange={v => updateConfig({ webSearch: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-xs font-medium text-foreground">File Search</p>
              <p className="text-[10px] text-muted-foreground">Busca em arquivos enviados</p>
            </div>
            <Switch checked={config.fileSearch ?? false} onCheckedChange={v => updateConfig({ fileSearch: v })} />
          </div>
        </div>

        {/* Conversation ID */}
        <div className="space-y-2">
          <Label className="text-xs">Conversation ID (opcional)</Label>
          <Input
            placeholder="conv_..."
            value={config.conversationId || ''}
            onChange={e => updateConfig({ conversationId: e.target.value })}
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Manter contexto entre chamadas. Substitui o antigo Thread ID.
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

      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Arquitetura Responses API:</strong> Assistants API foi descontinuada.
          Agora usamos Responses API + Conversations + Prompts modulares — mais performance, menos complexidade.
        </p>
      </div>
    </div>
  );
}
