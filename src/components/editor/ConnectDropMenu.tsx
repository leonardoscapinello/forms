import { useState, useMemo } from 'react';
import {
  FileText,
  GitBranch,
  Variable,
  Webhook,
  BarChart2,
  MessageSquare,
  Mail,
  Search,
  X,
  GitMerge,
  Clock,
  CornerDownRight,
  Sparkles,
  ImageIcon,
  Blocks,
  Route,
  Waypoints,
  PlugZap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Props {
  onAddPage: () => void;
  onAddCondition: () => void;
  onAddVariableOp: () => void;
  onAddIntegration: () => void;
  onAddAnalytics: () => void;
  onAddWhatsApp: () => void;
  onAddEmail: () => void;
  onAddABTest: () => void;
  onAddWait: () => void;
  onAddJump: () => void;
  onAddAI: () => void;
  onAddImageGen: () => void;
  onClose: () => void;
}

interface ActionItem {
  id: string;
  label: string;
  description: string;
  keywords?: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  action: () => void;
  category: string;
}

const CATEGORIES = [
  { key: 'flow', label: 'Fluxo', description: 'Etapas e navegação', icon: Route },
  { key: 'logic', label: 'Lógica', description: 'Regras e ramificações', icon: Waypoints },
  { key: 'integration', label: 'Integrações', description: 'Ações e serviços externos', icon: PlugZap },
] as const;

export default function ConnectDropMenu({
  onAddPage, onAddCondition, onAddVariableOp,
  onAddIntegration, onAddAnalytics, onAddWhatsApp, onAddEmail,
  onAddABTest, onAddWait, onAddJump, onAddAI, onAddImageGen, onClose,
}: Props) {
  const [search, setSearch] = useState('');

  const items: ActionItem[] = useMemo(() => [
    { id: 'page', label: 'Nova página', description: 'Adicione uma etapa visível do formulário.', keywords: 'tela etapa', icon: FileText, iconColor: 'text-primary', bgColor: 'bg-primary/10', action: () => { onAddPage(); onClose(); }, category: 'flow' },
    { id: 'jump', label: 'Ir para outro bloco', description: 'Continue o fluxo em uma etapa específica.', keywords: 'pular salto redirecionar', icon: CornerDownRight, iconColor: 'text-node-jump-accent', bgColor: 'bg-node-jump', action: () => { onAddJump(); onClose(); }, category: 'flow' },
    { id: 'condition', label: 'Condição', description: 'Crie caminhos conforme respostas e variáveis.', keywords: 'regra se senão caminho', icon: GitBranch, iconColor: 'text-node-condition-accent', bgColor: 'bg-node-condition', action: () => { onAddCondition(); onClose(); }, category: 'logic' },
    { id: 'abtest', label: 'Teste A/B', description: 'Distribua pessoas entre variações do fluxo.', keywords: 'experimento variante', icon: GitMerge, iconColor: 'text-node-abtest-accent', bgColor: 'bg-node-abtest', action: () => { onAddABTest(); onClose(); }, category: 'logic' },
    { id: 'variable', label: 'Alterar variável', description: 'Defina ou transforme um valor durante o fluxo.', keywords: 'atribuir calcular dado', icon: Variable, iconColor: 'text-node-variable-op-accent', bgColor: 'bg-node-variable-op', action: () => { onAddVariableOp(); onClose(); }, category: 'logic' },
    { id: 'wait', label: 'Aguardar', description: 'Pause o fluxo por um intervalo configurável.', keywords: 'espera pausa tempo delay', icon: Clock, iconColor: 'text-node-wait-accent', bgColor: 'bg-node-wait', action: () => { onAddWait(); onClose(); }, category: 'logic' },
    { id: 'webhook', label: 'Webhook', description: 'Envie dados para uma URL e use a resposta.', keywords: 'api http integração', icon: Webhook, iconColor: 'text-node-webhook-accent', bgColor: 'bg-node-webhook', action: () => { onAddIntegration(); onClose(); }, category: 'integration' },
    { id: 'analytics', label: 'Analytics e pixels', description: 'Dispare eventos de conversão e rastreamento.', keywords: 'meta google tiktok linkedin evento pixel', icon: BarChart2, iconColor: 'text-node-analytics-accent', bgColor: 'bg-node-analytics', action: () => { onAddAnalytics(); onClose(); }, category: 'integration' },
    { id: 'whatsapp', label: 'Enviar WhatsApp', description: 'Envie uma mensagem pelo provedor configurado.', keywords: 'evolution mensagem', icon: MessageSquare, iconColor: 'text-node-whatsapp-accent', bgColor: 'bg-node-whatsapp', action: () => { onAddWhatsApp(); onClose(); }, category: 'integration' },
    { id: 'email', label: 'Enviar e-mail', description: 'Entregue uma mensagem personalizada ao lead.', keywords: 'resend mensagem correio', icon: Mail, iconColor: 'text-node-email-accent', bgColor: 'bg-node-email', action: () => { onAddEmail(); onClose(); }, category: 'integration' },
    { id: 'ai', label: 'Inteligência artificial', description: 'Processe respostas e gere conteúdo com IA.', keywords: 'openai prompt modelo', icon: Sparkles, iconColor: 'text-node-ai-accent', bgColor: 'bg-node-ai', action: () => { onAddAI(); onClose(); }, category: 'integration' },
    { id: 'imagegen', label: 'Gerar imagem', description: 'Crie uma imagem dinamicamente durante o fluxo.', keywords: 'ia imagem visual', icon: ImageIcon, iconColor: 'text-node-imagegen-accent', bgColor: 'bg-node-imagegen', action: () => { onAddImageGen(); onClose(); }, category: 'integration' },
  ], [onAddPage, onAddCondition, onAddVariableOp, onAddIntegration, onAddAnalytics, onAddWhatsApp, onAddEmail, onAddABTest, onAddWait, onAddJump, onAddAI, onAddImageGen, onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i => `${i.label} ${i.description} ${i.keywords || ''}`.toLowerCase().includes(q));
  }, [items, search]);

  const groupedByCategory = useMemo(() => {
    return CATEGORIES.map(cat => ({
      ...cat,
      items: filtered.filter(i => i.category === cat.key),
    })).filter(cat => cat.items.length > 0);
  }, [filtered]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]" onClick={onClose} />
      
      {/* Side panel */}
      <aside
        className="fixed bottom-0 left-0 top-0 z-50 flex w-[min(92vw,370px)] flex-col border-r border-border bg-card shadow-2xl animate-in slide-in-from-left duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Adicionar bloco ao workflow"
      >
        {/* Header */}
        <div className="border-b border-border bg-gradient-to-br from-primary/[0.08] via-card to-card px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Blocks className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Adicionar bloco</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Escolha o que deve acontecer nesta parte do workflow.</p>
              </div>
            </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Fechar menu de blocos"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar página, condição, webhook..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 bg-muted/35 pl-9 pr-9 text-sm"
              aria-label="Buscar bloco do workflow"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 pb-5">
          {groupedByCategory.map(cat => {
            const CategoryIcon = cat.icon;
            return (
              <section key={cat.key} className="mb-5">
                <div className="mb-2.5 flex items-center gap-2 px-1">
                  <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">{cat.label}</p>
                    <p className="text-[10px] text-muted-foreground">{cat.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {cat.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={item.action}
                        className="group flex min-h-[58px] items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-left text-foreground shadow-sm transition-all hover:-translate-y-px hover:border-primary/25 hover:bg-muted/55 hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bgColor}`}>
                          <Icon className={`h-4 w-4 ${item.iconColor}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-foreground">{item.label}</span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{item.description}</span>
                        </div>
                        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {groupedByCategory.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <Search className="mx-auto h-5 w-5 text-muted-foreground/50" />
              <p className="mt-2 text-xs font-medium text-foreground">Nenhum bloco encontrado</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Tente buscar por outro nome ou finalidade.</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
