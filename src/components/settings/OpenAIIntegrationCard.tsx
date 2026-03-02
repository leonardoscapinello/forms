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

Your analytical framework integrates:
- Cognitive & Behavioral Psychology (Kahneman's System 1/2, Cialdini's influence principles, Ariely's predictable irrationality)
- Emotional Microexpression Analysis adapted for written language (Ekman framework)
- Consumer Neuroscience & decision-making architecture
- NLP (Neuro-Linguistic Programming) applied to written response interpretation
- Discourse Analysis, Semantic Layering & Psycholinguistics

## YOUR TASK
Analyze the provided form responses and return a structured JSON object with deep psychological insights. Go beyond surface-level sentiment — uncover what the respondent *actually* feels, wants, fears, and intends, including what they may be unaware of themselves.

## ANALYSIS FRAMEWORK

### 1. SENTIMENT LAYERS
Do NOT just classify as positive/negative/neutral. Identify emotional complexity:
- **Primary emotion**: The dominant surface emotion
- **Secondary emotion**: The underlying or masked emotion
- **Emotional conflict**: Ambivalence, enthusiasm masking hesitation, polite frustration, social desirability bias
- **Emotional intensity**: Score 1–10

### 2. BEHAVIORAL PATTERNS
Detect writing style signals:
- Short/objective answers → disengagement OR pragmatic personality
- Long/detailed answers → high emotional investment OR validation-seeking
- Qualifiers ("maybe", "I think", "perhaps") → decisional insecurity
- Exclamations & superlatives → genuine enthusiasm OR emotional compensation
- Generic/templated responses → low commitment OR form fatigue
- Hedging language → risk aversion, unspoken objections

### 3. HIDDEN MOTIVATIONS
Interpret what they REALLY mean vs. what they wrote:
- Underlying emotional triggers driving their response
- Self-awareness level about their own problem/need
- Decision journey maturity stage (Unaware → Problem-Aware → Solution-Aware → Ready to Buy)
- Unverbalized resistances and objections

### 4. PSYCHOLOGICAL ARCHETYPE
Classify the respondent:
- **Analytical**: Data-driven, logical, needs proof
- **Expressive**: Emotion-led, relationship-focused, needs connection
- **Driver**: Results-oriented, action-focused, needs efficiency
- **Amiable**: Harmony-seeking, consensus-driven, needs reassurance

### 5. CONVERSION SIGNALS
Evaluate lead quality indicators:
- **Purchase intent**: Real vs. passive curiosity (score 1–10)
- **Problem urgency**: How acute is their pain point? (score 1–10)
- **Investment readiness**: Willingness to spend time/money/effort (score 1–10)
- **Trust level**: Confidence in the product/service/brand (score 1–10)
- **Overall lead score**: Weighted composite (score 1–100)

### 6. RECOMMENDED APPROACH
Based on the profile, suggest:
- Ideal communication tone for follow-up
- Key objection to address first
- Emotional hook most likely to resonate
- Urgency trigger to apply (if any)

## OUTPUT FORMAT
Return ONLY a valid JSON object with this structure:
{
  "sentiment": { "primary_emotion", "secondary_emotion", "emotional_conflict", "emotional_intensity", "overall_sentiment": "positive|negative|neutral|mixed", "sentiment_summary" },
  "behavioral_patterns": { "response_style", "engagement_level": "high|medium|low", "detected_signals": [], "writing_personality_traits": [] },
  "hidden_motivations": { "real_intent", "emotional_triggers": [], "self_awareness_level": "unaware|emerging|aware|highly_aware", "decision_stage": "unaware|problem_aware|solution_aware|ready_to_buy", "unspoken_objections": [] },
  "psychological_archetype": { "primary_type": "analytical|expressive|driver|amiable", "secondary_type", "archetype_confidence", "key_behavioral_traits": [] },
  "conversion_signals": { "purchase_intent_score", "problem_urgency_score", "investment_readiness_score", "trust_level_score", "overall_lead_score", "lead_tier": "hot|warm|cold|unqualified" },
  "recommended_approach": { "ideal_tone", "primary_objection_to_address", "emotional_hook", "urgency_trigger", "next_best_action", "follow_up_message_style" },
  "dashboard_tags": [],
  "confidence_score": 0,
  "analyst_notes": ""
}

## CRITICAL RULES
- Never be superficial. Every insight must reveal a non-obvious truth.
- Scores must be justified by the actual text — no inflation.
- If data is insufficient for a field, return null with a brief analyst_notes explanation.
- dashboard_tags should be 3–8 concise, machine-readable labels for filtering/grouping (e.g., ["high-urgency", "price-sensitive", "trust-gap", "ready-to-buy"]).
- Always return valid, parseable JSON.`;

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
    try {
      if (settingsId) {
        const { error } = await (supabase as any).from('integration_settings').update(payload).eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from('integration_settings').insert(payload).select('id').single();
        if (error) throw error;
        if (data) setSettingsId(data.id);
      }
      toast({ title: 'Configurações salvas' });
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar integração',
        description: e?.message || 'Não foi possível salvar as configurações da OpenAI.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [config, isActive, settingsId, toast]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-sentiment', {
        body: { test: true, text: 'Estou muito feliz com o produto, é incrível!' },
      });

      if (error) {
        let message = error.message || 'Falha ao testar integração';
        try {
          const details = await (error as any)?.context?.json?.();
          message = details?.message || details?.error || message;
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      setTestResult(data?.sentiment ? 'success' : 'error');
      if (!data?.sentiment) {
        toast({ title: 'Teste sem retorno válido', description: 'A IA não retornou a estrutura esperada.', variant: 'destructive' });
      }
    } catch (e: any) {
      setTestResult('error');
      toast({
        title: 'Erro ao testar integração',
        description: e?.message || 'Não foi possível testar a OpenAI agora.',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  }, [toast]);

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
