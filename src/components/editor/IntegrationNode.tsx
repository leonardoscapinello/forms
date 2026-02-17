import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Webhook, Facebook, BarChart3, Music2, Linkedin, Trash2, Plus, X } from 'lucide-react';
import { IntegrationNodeData, IntegrationPlatform, PixelEventType, WebhookParam } from '@/types/form';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';

// ── Config ──────────────────────────────────────────────────────────────────

export const INTEGRATION_PLATFORMS: {
  value: IntegrationPlatform;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  /** 'webhook' | 'analytics' — drives node color tokens */
  category: 'webhook' | 'analytics';
}[] = [
  {
    value: 'webhook',
    label: 'Webhook',
    description: 'Enviar dados para uma URL',
    icon: Webhook,
    colorClass: 'text-node-webhook-accent',
    bgClass: 'bg-node-webhook',
    category: 'webhook',
  },
  {
    value: 'meta_pixel',
    label: 'Meta Pixel',
    description: 'Facebook / Instagram Ads',
    icon: Facebook,
    colorClass: 'text-node-analytics-accent',
    bgClass: 'bg-node-analytics',
    category: 'analytics',
  },
  {
    value: 'google_analytics',
    label: 'Google Analytics',
    description: 'GA4 / Google Ads',
    icon: BarChart3,
    colorClass: 'text-node-analytics-accent',
    bgClass: 'bg-node-analytics',
    category: 'analytics',
  },
  {
    value: 'tiktok_pixel',
    label: 'TikTok Pixel',
    description: 'TikTok Ads',
    icon: Music2,
    colorClass: 'text-node-analytics-accent',
    bgClass: 'bg-node-analytics',
    category: 'analytics',
  },
  {
    value: 'linkedin_pixel',
    label: 'LinkedIn Pixel',
    description: 'LinkedIn Ads',
    icon: Linkedin,
    colorClass: 'text-node-analytics-accent',
    bgClass: 'bg-node-analytics',
    category: 'analytics',
  },
];

const PIXEL_EVENTS: { value: PixelEventType; label: string }[] = [
  { value: 'Lead',                  label: 'Lead' },
  { value: 'Purchase',              label: 'Purchase' },
  { value: 'ViewContent',           label: 'ViewContent' },
  { value: 'CompleteRegistration',  label: 'CompleteRegistration' },
  { value: 'InitiateCheckout',      label: 'InitiateCheckout' },
  { value: 'AddToCart',             label: 'AddToCart' },
  { value: 'Search',                label: 'Search' },
  { value: 'Contact',               label: 'Contact' },
  { value: 'SubmitApplication',     label: 'SubmitApplication' },
  { value: 'custom',                label: 'Evento customizado...' },
];

const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

// ── Component ────────────────────────────────────────────────────────────────

interface IntegrationNodeProps {
  nodeData: IntegrationNodeData;
  onChange: (patch: Partial<IntegrationNodeData>) => void;
  onDelete: () => void;
}

function IntegrationNode({ data, selected }: NodeProps & { data: IntegrationNodeProps }) {
  const { nodeData, onChange, onDelete } = data;

  const platformCfg = INTEGRATION_PLATFORMS.find(p => p.value === nodeData.platform)
    ?? INTEGRATION_PLATFORMS[0];
  const Icon = platformCfg.icon;
  const isPixel = nodeData.platform !== 'webhook';

  const accentBorder = platformCfg.category === 'webhook'
    ? 'border-node-webhook-accent shadow-md ring-2 ring-node-webhook-accent/20'
    : 'border-node-analytics-accent shadow-md ring-2 ring-node-analytics-accent/20';
  const headerBorder = platformCfg.category === 'webhook'
    ? 'border-node-webhook-accent/30'
    : 'border-node-analytics-accent/30';
  const handleColor = platformCfg.category === 'webhook'
    ? '!bg-node-webhook-accent'
    : '!bg-node-analytics-accent';
  const categoryLabel = platformCfg.category === 'webhook' ? 'Integração' : 'Analytics';

  return (
    <TooltipProvider>
      <div
        className={`w-72 rounded-xl border bg-card shadow-sm transition-all ${
          selected ? accentBorder : 'border-border'
        }`}
      >
        <Handle type="target" position={Position.Left}  className={`!w-3 !h-3 ${handleColor} !border-2 !border-card`} />
        <Handle type="source" position={Position.Right} className={`!w-3 !h-3 ${handleColor} !border-2 !border-card`} />

        {/* Header */}
        <div className={`flex items-center gap-2 px-3 py-2 border-b ${headerBorder} ${platformCfg.bgClass} rounded-t-xl`}>
          <Icon className={`h-3.5 w-3.5 ${platformCfg.colorClass}`} />
          <span className={`text-[11px] font-medium uppercase tracking-wide ${platformCfg.colorClass}`}>
            {categoryLabel}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-3 space-y-2.5">
          {/* Platform picker */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Plataforma</span>
            <Select
              value={nodeData.platform}
              onValueChange={val => onChange({ platform: val as IntegrationPlatform })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTEGRATION_PLATFORMS.map(p => {
                  const PIcon = p.icon;
                  return (
                    <SelectItem key={p.value} value={p.value} className="text-xs">
                      <div className="flex items-center gap-2">
                        <PIcon className={`h-3.5 w-3.5 ${p.colorClass}`} />
                        <span>{p.label}</span>
                        <span className="text-muted-foreground">— {p.description}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Pixel: event type */}
          {isPixel && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Evento</span>
              <Select
                value={nodeData.eventType || 'Lead'}
                onValueChange={val => onChange({ eventType: val as PixelEventType })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIXEL_EVENTS.map(e => (
                    <SelectItem key={e.value} value={e.value} className="text-xs">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {nodeData.eventType === 'custom' && (
                <Input
                  value={nodeData.customEventName || ''}
                  onChange={e => onChange({ customEventName: e.target.value })}
                  placeholder="NomeDoEvento"
                  className="h-8 text-xs mt-1.5"
                />
              )}
            </div>
          )}

          {/* Webhook: URL + method + extra params */}
          {!isPixel && (
            <>
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  URL de destino <span className="text-destructive">*</span>
                </span>
                <Input
                  value={nodeData.webhookUrl || ''}
                  onChange={e => onChange({ webhookUrl: e.target.value })}
                  placeholder="https://hooks.example.com/..."
                  className={`h-8 text-xs ${!nodeData.webhookUrl ? 'border-destructive/50' : ''}`}
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Método</span>
                <Select
                  value={nodeData.webhookMethod || 'POST'}
                  onValueChange={val => onChange({ webhookMethod: val as any })}
                >
                  <SelectTrigger className="h-8 text-xs w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEBHOOK_METHODS.map(m => (
                      <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Extra params */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Parâmetros extras</span>
                  <Button
                    variant="ghost" size="icon"
                    className="h-5 w-5 text-muted-foreground"
                    onClick={() => {
                      const newParam: WebhookParam = { id: crypto.randomUUID(), key: '', value: '' };
                      onChange({ webhookParams: [...(nodeData.webhookParams || []), newParam] });
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {(nodeData.webhookParams || []).map((param, idx) => (
                  <div key={param.id} className="flex items-center gap-1">
                    <Input
                      value={param.key}
                      onChange={e => {
                        const updated = [...(nodeData.webhookParams || [])];
                        updated[idx] = { ...updated[idx], key: e.target.value };
                        onChange({ webhookParams: updated });
                      }}
                      placeholder="chave"
                      className="h-7 text-xs w-0 flex-1 font-mono"
                    />
                    <Input
                      value={param.value}
                      onChange={e => {
                        const updated = [...(nodeData.webhookParams || [])];
                        updated[idx] = { ...updated[idx], value: e.target.value };
                        onChange({ webhookParams: updated });
                      }}
                      placeholder="valor"
                      className="h-7 text-xs w-0 flex-1"
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const updated = (nodeData.webhookParams || []).filter((_, i) => i !== idx);
                        onChange({ webhookParams: updated });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Info pill */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] ${platformCfg.bgClass} ${platformCfg.colorClass}`}>
            <Icon className="h-3 w-3 flex-shrink-0" />
            {isPixel
              ? `Script client-side + API server-side com dedup`
              : `Disparo HTTP com answers + variáveis + metadata`}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default memo(IntegrationNode);
