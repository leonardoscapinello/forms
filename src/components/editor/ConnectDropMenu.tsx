import { useState, useMemo } from 'react';
import { FileText, GitBranch, Variable, Webhook, BarChart2, MessageSquare, Mail, Search, X, GitMerge, Clock, CornerDownRight, Sparkles, ImageIcon } from 'lucide-react';
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
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  action: () => void;
  category: string;
}

const CATEGORIES = [
  { key: 'flow', label: 'Fluxo' },
  { key: 'logic', label: 'Lógica' },
  { key: 'integration', label: 'Integrações' },
] as const;

export default function ConnectDropMenu({
  onAddPage, onAddCondition, onAddVariableOp,
  onAddIntegration, onAddAnalytics, onAddWhatsApp, onAddEmail,
  onAddABTest, onAddWait, onAddJump, onAddAI, onClose,
}: Props) {
  const [search, setSearch] = useState('');

  const items: ActionItem[] = useMemo(() => [
    { id: 'page', label: 'Nova Página', icon: FileText, iconColor: 'text-primary', bgColor: 'bg-primary/10', action: () => { onAddPage(); onClose(); }, category: 'flow' },
    { id: 'jump', label: 'Pular', icon: CornerDownRight, iconColor: 'text-node-jump-accent', bgColor: 'bg-node-jump', action: () => { onAddJump(); onClose(); }, category: 'flow' },
    { id: 'condition', label: 'Condição', icon: GitBranch, iconColor: 'text-node-condition-accent', bgColor: 'bg-node-condition', action: () => { onAddCondition(); onClose(); }, category: 'logic' },
    { id: 'abtest', label: 'Teste A/B', icon: GitMerge, iconColor: 'text-node-abtest-accent', bgColor: 'bg-node-abtest', action: () => { onAddABTest(); onClose(); }, category: 'logic' },
    { id: 'variable', label: 'Variável', icon: Variable, iconColor: 'text-node-variable-op-accent', bgColor: 'bg-node-variable-op', action: () => { onAddVariableOp(); onClose(); }, category: 'logic' },
    { id: 'wait', label: 'Espera', icon: Clock, iconColor: 'text-node-wait-accent', bgColor: 'bg-node-wait', action: () => { onAddWait(); onClose(); }, category: 'logic' },
    { id: 'webhook', label: 'Webhook', icon: Webhook, iconColor: 'text-node-webhook-accent', bgColor: 'bg-node-webhook', action: () => { onAddIntegration(); onClose(); }, category: 'integration' },
    { id: 'analytics', label: 'Analytics', icon: BarChart2, iconColor: 'text-node-analytics-accent', bgColor: 'bg-node-analytics', action: () => { onAddAnalytics(); onClose(); }, category: 'integration' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, iconColor: 'text-node-whatsapp-accent', bgColor: 'bg-node-whatsapp', action: () => { onAddWhatsApp(); onClose(); }, category: 'integration' },
    { id: 'email', label: 'E-mail', icon: Mail, iconColor: 'text-node-email-accent', bgColor: 'bg-node-email', action: () => { onAddEmail(); onClose(); }, category: 'integration' },
    { id: 'ai', label: 'Inteligência Artificial', icon: Sparkles, iconColor: 'text-node-ai-accent', bgColor: 'bg-node-ai', action: () => { onAddAI(); onClose(); }, category: 'integration' },
  ], [onAddPage, onAddCondition, onAddVariableOp, onAddIntegration, onAddAnalytics, onAddWhatsApp, onAddEmail, onAddABTest, onAddWait, onAddJump, onAddAI, onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i => i.label.toLowerCase().includes(q));
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
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      
      {/* Side panel */}
      <div className="fixed left-0 top-0 bottom-0 z-50 w-64 bg-card border-r border-border shadow-xl flex flex-col animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Adicionar bloco</h3>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm bg-muted/50 border-border"
            />
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {groupedByCategory.map(cat => (
            <div key={cat.key} className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-2">
                {cat.label}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {cat.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-background text-sm text-foreground hover:bg-muted hover:border-muted-foreground/20 transition-colors text-left group"
                    >
                      <div className={`h-5 w-5 rounded flex items-center justify-center flex-shrink-0 ${item.bgColor}`}>
                        <Icon className={`h-3 w-3 ${item.iconColor}`} />
                      </div>
                      <span className="text-xs font-medium truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {groupedByCategory.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum bloco encontrado</p>
          )}
        </div>
      </div>
    </>
  );
}
