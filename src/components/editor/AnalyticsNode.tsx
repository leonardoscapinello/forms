import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Facebook, BarChart3, Music2, Linkedin, Trash2, BarChart2 } from 'lucide-react';
import { AnalyticsNodeData, AnalyticsPlatform, PixelEventType } from '@/types/form';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';

// ── Config ──────────────────────────────────────────────────────────────────

export const ANALYTICS_PLATFORMS: {
  value: AnalyticsPlatform;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: 'meta_pixel',
    label: 'Meta Pixel',
    description: 'Facebook / Instagram Ads',
    icon: Facebook,
  },
  {
    value: 'google_analytics',
    label: 'Google Analytics',
    description: 'GA4 / Google Ads',
    icon: BarChart3,
  },
  {
    value: 'tiktok_pixel',
    label: 'TikTok Pixel',
    description: 'TikTok Ads',
    icon: Music2,
  },
  {
    value: 'linkedin_pixel',
    label: 'LinkedIn Pixel',
    description: 'LinkedIn Ads',
    icon: Linkedin,
  },
];

const PIXEL_EVENTS: { value: PixelEventType; label: string }[] = [
  { value: 'Lead',                 label: 'Lead' },
  { value: 'Purchase',             label: 'Purchase' },
  { value: 'ViewContent',          label: 'ViewContent' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration' },
  { value: 'InitiateCheckout',     label: 'InitiateCheckout' },
  { value: 'AddToCart',            label: 'AddToCart' },
  { value: 'Search',               label: 'Search' },
  { value: 'Contact',              label: 'Contact' },
  { value: 'SubmitApplication',    label: 'SubmitApplication' },
  { value: 'custom',               label: 'Evento customizado...' },
];

// ── Component ────────────────────────────────────────────────────────────────

interface AnalyticsNodeProps {
  nodeData: AnalyticsNodeData;
  onChange: (patch: Partial<AnalyticsNodeData>) => void;
  onDelete: () => void;
}

function AnalyticsNode({ data, selected }: NodeProps & { data: AnalyticsNodeProps }) {
  const { nodeData, onChange, onDelete } = data;

  const platformCfg = ANALYTICS_PLATFORMS.find(p => p.value === nodeData.platform)
    ?? ANALYTICS_PLATFORMS[0];
  const Icon = platformCfg.icon;

  return (
    <TooltipProvider>
      <div
        className={`w-64 rounded-xl border bg-card shadow-sm transition-all ${
          selected
            ? 'border-node-analytics-accent shadow-md ring-2 ring-node-analytics-accent/20'
            : 'border-border'
        }`}
      >
        <Handle type="target" position={Position.Left}  className="!w-3 !h-3 !bg-node-analytics-accent !border-2 !border-card" />
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-node-analytics-accent !border-2 !border-card" />

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-node-analytics-accent/30 bg-node-analytics rounded-t-xl">
          <BarChart2 className="h-3.5 w-3.5 text-node-analytics-accent" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-node-analytics-accent">
            Analytics
          </span>
          <div className="ml-auto">
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
              onValueChange={val => onChange({ platform: val as AnalyticsPlatform })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANALYTICS_PLATFORMS.map(p => {
                  const PIcon = p.icon;
                  return (
                    <SelectItem key={p.value} value={p.value} className="text-xs">
                      <div className="flex items-center gap-2">
                        <PIcon className="h-3.5 w-3.5 text-node-analytics-accent" />
                        <span>{p.label}</span>
                        <span className="text-muted-foreground">— {p.description}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Event type */}
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

          {/* Info pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] bg-node-analytics text-node-analytics-accent">
            <Icon className="h-3 w-3 flex-shrink-0" />
            Script client-side + API server-side com dedup
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default memo(AnalyticsNode);
