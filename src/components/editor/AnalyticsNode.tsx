import { memo, useState, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Facebook, BarChart3, Music2, Linkedin, Trash2, BarChart2, Plus, Settings, Check, X, ChevronDown, ChevronUp, User, Mail, Phone } from 'lucide-react';
import { AnalyticsNodeData, AnalyticsPlatform, PixelEventType, AnalyticsPlatformEntry, UserDataMapping, FormData as AppFormData } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';

// ── Config ───────────────────────────────────────────────────────────────────

export const ANALYTICS_PLATFORMS: {
  value: AnalyticsPlatform;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { value: 'meta_pixel',       label: 'Meta Pixel',       description: 'Facebook / Instagram',  icon: Facebook,  color: 'text-blue-500' },
  { value: 'google_analytics', label: 'Google Analytics', description: 'GA4 / Google Ads',       icon: BarChart3, color: 'text-orange-500' },
  { value: 'tiktok_pixel',     label: 'TikTok Pixel',     description: 'TikTok Ads',             icon: Music2,    color: 'text-pink-500' },
  { value: 'linkedin_pixel',   label: 'LinkedIn Pixel',   description: 'LinkedIn Ads',           icon: Linkedin,  color: 'text-sky-600' },
];

const PIXEL_EVENTS: { value: PixelEventType | 'PageView'; label: string }[] = [
  { value: 'PageView',             label: 'PageView' },
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

function defaultPlatforms(): AnalyticsPlatformEntry[] {
  return ANALYTICS_PLATFORMS.map(p => ({
    id: crypto.randomUUID(),
    platform: p.value,
    eventType: 'Lead' as PixelEventType,
    enabled: false,
    customParams: [],
  }));
}

function migrateNode(nodeData: AnalyticsNodeData): AnalyticsPlatformEntry[] {
  if (nodeData.platforms && nodeData.platforms.length > 0) return nodeData.platforms;
  // Migrate from old single-platform format
  const defaults = defaultPlatforms();
  if (nodeData.platform) {
    return defaults.map(p =>
      p.platform === nodeData.platform
        ? { ...p, enabled: true, eventType: nodeData.eventType || 'Lead', customEventName: nodeData.customEventName }
        : p
    );
  }
  return defaults;
}

// ── Helper: extract all input elements from form ──────────────────────────────

function extractInputElements(form?: AppFormData): { id: string; label: string; type: string }[] {
  if (!form) return [];
  const els: { id: string; label: string; type: string }[] = [];
  for (const page of form.pages || []) {
    for (const el of page.elements || []) {
      if (el.type?.startsWith('input_')) {
        els.push({
          id: el.id,
          label: el.label || el.placeholder || el.type.replace('input_', '').replace(/_/g, ' '),
          type: el.type,
        });
      }
    }
  }
  return els;
}

function FieldSelector({ label, icon: Icon, value, elements, filterTypes, onChange }: {
  label: string;
  icon: React.ElementType;
  value?: string;
  elements: { id: string; label: string; type: string }[];
  filterTypes?: string[];
  onChange: (val: string) => void;
}) {
  const filtered = filterTypes ? elements.filter(e => filterTypes.includes(e.type)) : elements;
  const allOptions = [...filtered];
  // Add non-matching elements as "other" options
  if (filterTypes) {
    const others = elements.filter(e => !filterTypes.includes(e.type));
    allOptions.push(...others);
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </label>
      <Select value={value || '__auto__'} onValueChange={v => onChange(v === '__auto__' ? '' : v)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Auto-detectar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__auto__" className="text-xs text-muted-foreground">Auto-detectar (primeiro encontrado)</SelectItem>
          <SelectItem value="__none__" className="text-xs text-muted-foreground">Não enviar</SelectItem>
          {allOptions.map(el => (
            <SelectItem key={el.id} value={el.id} className="text-xs">
              {el.label}
              <span className="ml-1 text-muted-foreground text-[10px]">({el.type.replace('input_', '')})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Platform Detail Modal ─────────────────────────────────────────────────────

function PlatformDetailModal({
  entry,
  onClose,
  onChange,
  formElements,
}: {
  entry: AnalyticsPlatformEntry;
  onClose: () => void;
  onChange: (patch: Partial<AnalyticsPlatformEntry>) => void;
  formElements: { id: string; label: string; type: string }[];
}) {
  const cfg = ANALYTICS_PLATFORMS.find(p => p.value === entry.platform)!;
  const Icon = cfg.icon;
  const params = entry.customParams || [];
  const mapping = entry.userDataMapping || {};

  const addParam = () => onChange({
    customParams: [...params, { id: crypto.randomUUID(), key: '', value: '' }],
  });

  const updateParam = (id: string, field: 'key' | 'value', val: string) => {
    onChange({ customParams: params.map(p => p.id === id ? { ...p, [field]: val } : p) });
  };

  const removeParam = (id: string) => {
    onChange({ customParams: params.filter(p => p.id !== id) });
  };

  const updateMapping = (patch: Partial<UserDataMapping>) => {
    onChange({ userDataMapping: { ...mapping, ...patch } });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${cfg.color}`} />
            <span>{cfg.label}</span>
            <span className="text-xs text-muted-foreground font-normal ml-1">— {cfg.description}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Event type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Evento</label>
            <Select
              value={entry.eventType}
              onValueChange={val => onChange({ eventType: val as PixelEventType | 'PageView' })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIXEL_EVENTS.map(e => (
                  <SelectItem key={e.value} value={e.value} className="text-xs">{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {entry.eventType === 'custom' && (
              <Input
                value={entry.customEventName || ''}
                onChange={e => onChange({ customEventName: e.target.value })}
                placeholder="NomeDoEvento"
                className="h-8 text-xs mt-1.5"
              />
            )}
          </div>

          {/* Lead data mapping */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Dados do lead
            </label>
            <p className="text-[10px] text-muted-foreground -mt-1">
              Selecione quais campos enviar como dados do lead para a plataforma.
            </p>
            <div className="space-y-1.5 bg-muted/30 rounded-lg p-2.5">
              <FieldSelector
                label="E-mail"
                icon={Mail}
                value={mapping.emailElementId}
                elements={formElements}
                filterTypes={['input_email']}
                onChange={v => updateMapping({ emailElementId: v })}
              />
              <FieldSelector
                label="Telefone"
                icon={Phone}
                value={mapping.phoneElementId}
                elements={formElements}
                filterTypes={['input_phone']}
                onChange={v => updateMapping({ phoneElementId: v })}
              />
              <FieldSelector
                label="Nome"
                icon={User}
                value={mapping.nameElementId}
                elements={formElements}
                filterTypes={['input_short_text', 'input_text', 'input_contact_name']}
                onChange={v => updateMapping({ nameElementId: v })}
              />
            </div>
          </div>

          {/* Custom params */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Parâmetros extras
              </label>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={addParam}>
                <Plus className="h-3 w-3 mr-1" />
                Adicionar
              </Button>
            </div>
            {params.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum parâmetro extra. Os valores serão enviados no payload padrão.
              </p>
            )}
            <div className="space-y-1.5">
              {params.map(p => (
                <div key={p.id} className="flex gap-1.5">
                  <Input
                    value={p.key}
                    onChange={e => updateParam(p.id, 'key', e.target.value)}
                    placeholder="chave"
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    value={p.value}
                    onChange={e => updateParam(p.id, 'value', e.target.value)}
                    placeholder="valor"
                    className="h-7 text-xs flex-1"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeParam(p.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button size="sm" onClick={onClose}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface AnalyticsNodeProps {
  nodeData: AnalyticsNodeData;
  onChange: (patch: Partial<AnalyticsNodeData>) => void;
  onDelete: () => void;
  form?: AppFormData;
}

function AnalyticsNode({ data, selected }: NodeProps & { data: AnalyticsNodeProps }) {
  const { nodeData, onChange, onDelete, form } = data;
  const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);
  const formElements = useMemo(() => extractInputElements(form), [form]);

  const platforms = migrateNode(nodeData);
  const enabledCount = platforms.filter(p => p.enabled).length;

  const updatePlatforms = (updated: AnalyticsPlatformEntry[]) => {
    onChange({ platforms: updated });
  };

  const toggleEnabled = (id: string, enabled: boolean) => {
    updatePlatforms(platforms.map(p => p.id === id ? { ...p, enabled } : p));
  };

  const updateEntry = (id: string, patch: Partial<AnalyticsPlatformEntry>) => {
    updatePlatforms(platforms.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const editingEntry = editingPlatformId ? platforms.find(p => p.id === editingPlatformId) : null;

  return (
    <TooltipProvider>
      <div
        className={`w-72 rounded-xl border bg-card shadow-sm transition-all ${
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
          {enabledCount > 0 && (
            <span className="ml-1 text-[10px] bg-node-analytics-accent/20 text-node-analytics-accent px-1.5 py-0.5 rounded-full">
              {enabledCount} ativo{enabledCount > 1 ? 's' : ''}
            </span>
          )}
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

        {/* Platform rows */}
        <div className="px-2 py-2 space-y-1">
          {platforms.map(entry => {
            const cfg = ANALYTICS_PLATFORMS.find(p => p.value === entry.platform)!;
            const Icon = cfg.icon;
            const eventLabel = entry.eventType === 'custom'
              ? (entry.customEventName || 'Custom')
              : entry.eventType;
            const hasParams = (entry.customParams || []).length > 0;

            return (
              <div
                key={entry.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                  entry.enabled
                    ? 'bg-node-analytics border border-node-analytics-accent/20'
                    : 'opacity-50'
                }`}
              >
                <Switch
                  checked={entry.enabled}
                  onCheckedChange={val => toggleEnabled(entry.id, val)}
                  className="scale-75 shrink-0"
                />
                <Icon className={`h-3.5 w-3.5 shrink-0 ${entry.enabled ? cfg.color : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground truncate">{cfg.label}</p>
                  {entry.enabled && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {eventLabel}
                      {hasParams && <span className="ml-1 text-node-analytics-accent">+{(entry.customParams || []).length} param</span>}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => setEditingPlatformId(entry.id)}
                >
                  <Settings className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        {enabledCount === 0 && (
          <div className="px-3 pb-3 pt-1">
            <p className="text-[10px] text-muted-foreground text-center">
              Ative ao menos uma plataforma
            </p>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {editingEntry && (
        <PlatformDetailModal
          entry={editingEntry}
          onClose={() => setEditingPlatformId(null)}
          onChange={(patch) => updateEntry(editingEntry.id, patch)}
          formElements={formElements}
        />
      )}
    </TooltipProvider>
  );
}

export default memo(AnalyticsNode);
