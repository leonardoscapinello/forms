import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Facebook, BarChart3, Music2, Linkedin, Webhook, Save, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PixelConfig {
  // Meta
  metaPixelId: string;
  metaCapiToken: string;
  metaEnabled: boolean;
  // GA4
  ga4MeasurementId: string;
  ga4ApiSecret: string;
  ga4Enabled: boolean;
  // TikTok
  tiktokPixelId: string;
  tiktokAccessToken: string;
  tiktokEnabled: boolean;
  // LinkedIn
  linkedinPartnerId: string;
  linkedinAccessToken: string;
  linkedinConversionId: string;
  linkedinEnabled: boolean;
  // Webhook global
  webhookDefaultUrl: string;
  webhookEnabled: boolean;
}

const EMPTY: PixelConfig = {
  metaPixelId: '', metaCapiToken: '', metaEnabled: false,
  ga4MeasurementId: '', ga4ApiSecret: '', ga4Enabled: false,
  tiktokPixelId: '', tiktokAccessToken: '', tiktokEnabled: false,
  linkedinPartnerId: '', linkedinAccessToken: '', linkedinConversionId: '', linkedinEnabled: false,
  webhookDefaultUrl: '', webhookEnabled: false,
};

const PLATFORMS = [
  { id: 'meta',     label: 'Meta',     Icon: Facebook,   color: 'text-[hsl(220,89%,55%)]' },
  { id: 'ga4',      label: 'GA4',      Icon: BarChart3,   color: 'text-[hsl(15,90%,50%)]'  },
  { id: 'tiktok',   label: 'TikTok',   Icon: Music2,      color: 'text-foreground'           },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin,    color: 'text-[hsl(211,65%,44%)]'  },
  { id: 'webhook',  label: 'Webhook',  Icon: Webhook,     color: 'text-node-integration-accent' },
] as const;

export default function PixelIntegrationsCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [config, setConfig] = useState<PixelConfig>(EMPTY);
  const [show, setShow] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase
      .from('integration_settings')
      .select('*')
      .eq('integration_type', 'pixels')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id);
          const cfg = data.config as any;
          setConfig({
            metaPixelId: cfg.metaPixelId || '',
            metaCapiToken: cfg.metaCapiToken || '',
            metaEnabled: cfg.metaEnabled ?? false,
            ga4MeasurementId: cfg.ga4MeasurementId || '',
            ga4ApiSecret: cfg.ga4ApiSecret || '',
            ga4Enabled: cfg.ga4Enabled ?? false,
            tiktokPixelId: cfg.tiktokPixelId || '',
            tiktokAccessToken: cfg.tiktokAccessToken || '',
            tiktokEnabled: cfg.tiktokEnabled ?? false,
            linkedinPartnerId: cfg.linkedinPartnerId || '',
            linkedinAccessToken: cfg.linkedinAccessToken || '',
            linkedinConversionId: cfg.linkedinConversionId || '',
            linkedinEnabled: cfg.linkedinEnabled ?? false,
            webhookDefaultUrl: cfg.webhookDefaultUrl || '',
            webhookEnabled: cfg.webhookEnabled ?? false,
          });
        }
        setLoading(false);
      });
  }, []);

  const upd = useCallback((patch: Partial<PixelConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = {
      integration_type: 'pixels',
      label: 'Pixels & Webhooks',
      config: config as any,
      is_active: true,
    };
    if (settingsId) {
      await supabase.from('integration_settings').update(payload).eq('id', settingsId);
    } else {
      const { data } = await supabase.from('integration_settings').insert(payload).select().single();
      if (data) setSettingsId(data.id);
    }
    toast({ title: 'Salvo', description: 'Configurações de pixels salvas.' });
    setSaving(false);
  }, [config, settingsId, toast]);

  const toggleShow = (key: string) => setShow(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-base font-semibold text-foreground">Pixels & Webhooks</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure IDs e tokens globais. Cada plataforma dispara via <strong>script</strong> (client-side) + <strong>API server-side</strong> com deduplicação automática.
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>

      <div className="p-6">
        <Tabs defaultValue="meta">
          <TabsList className="mb-6 flex gap-1 bg-muted/40 h-auto p-1 flex-wrap">
            {PLATFORMS.map(p => (
              <TabsTrigger key={p.id} value={p.id} className="flex items-center gap-1.5 text-xs px-3 py-1.5">
                <p.Icon className={`h-3.5 w-3.5 ${p.color}`} />
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Meta ── */}
          <TabsContent value="meta" className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={config.metaEnabled} onCheckedChange={v => upd({ metaEnabled: v })} />
              <Label className="text-sm">Ativar Meta Pixel</Label>
              <a href="https://business.facebook.com/events_manager" target="_blank" rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Events Manager <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Pixel ID</Label>
              <Input value={config.metaPixelId} onChange={e => upd({ metaPixelId: e.target.value })}
                placeholder="123456789012345" className="text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Conversions API Token (server-side)</Label>
              <div className="relative">
                <Input type={show.metaToken ? 'text' : 'password'} value={config.metaCapiToken}
                  onChange={e => upd({ metaCapiToken: e.target.value })}
                  placeholder="EAAxxxxxxxxxxxxxxxx" className="text-sm font-mono pr-10" />
                <button type="button" onClick={() => toggleShow('metaToken')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show.metaToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Encontre em: Events Manager → Configurações → API de conversões
              </p>
            </div>
            <InfoBox>
              O <strong>fbq('track', ...)</strong> dispara no browser. A CAPI envia o mesmo evento pelo servidor com o mesmo <code>event_id</code> — o Meta faz a deduplicação automaticamente.
            </InfoBox>
          </TabsContent>

          {/* ── GA4 ── */}
          <TabsContent value="ga4" className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={config.ga4Enabled} onCheckedChange={v => upd({ ga4Enabled: v })} />
              <Label className="text-sm">Ativar Google Analytics 4</Label>
              <a href="https://analytics.google.com" target="_blank" rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                GA4 <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Measurement ID</Label>
              <Input value={config.ga4MeasurementId} onChange={e => upd({ ga4MeasurementId: e.target.value })}
                placeholder="G-XXXXXXXXXX" className="text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Measurement Protocol API Secret</Label>
              <div className="relative">
                <Input type={show.ga4Secret ? 'text' : 'password'} value={config.ga4ApiSecret}
                  onChange={e => upd({ ga4ApiSecret: e.target.value })}
                  placeholder="xxxxxxxxxxxxxxxxxxxx" className="text-sm font-mono pr-10" />
                <button type="button" onClick={() => toggleShow('ga4Secret')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show.ga4Secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Admin → Streams de dados → Protocolo de Measurement → Criar secret
              </p>
            </div>
            <InfoBox>
              O <strong>gtag</strong> dispara no browser via script. O Measurement Protocol envia o mesmo evento com o mesmo <code>client_id / event_id</code> para deduplicação.
            </InfoBox>
          </TabsContent>

          {/* ── TikTok ── */}
          <TabsContent value="tiktok" className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={config.tiktokEnabled} onCheckedChange={v => upd({ tiktokEnabled: v })} />
              <Label className="text-sm">Ativar TikTok Pixel</Label>
              <a href="https://ads.tiktok.com/i18n/events_manager" target="_blank" rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Events Manager <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Pixel ID</Label>
              <Input value={config.tiktokPixelId} onChange={e => upd({ tiktokPixelId: e.target.value })}
                placeholder="CXXXXXXXXXXXXXXXX" className="text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Events API Access Token</Label>
              <div className="relative">
                <Input type={show.tiktokToken ? 'text' : 'password'} value={config.tiktokAccessToken}
                  onChange={e => upd({ tiktokAccessToken: e.target.value })}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" className="text-sm font-mono pr-10" />
                <button type="button" onClick={() => toggleShow('tiktokToken')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show.tiktokToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <InfoBox>
              O <strong>ttq.track()</strong> dispara no browser. A Events API envia o mesmo evento com <code>event_id</code> para deduplicação automática da plataforma.
            </InfoBox>
          </TabsContent>

          {/* ── LinkedIn ── */}
          <TabsContent value="linkedin" className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={config.linkedinEnabled} onCheckedChange={v => upd({ linkedinEnabled: v })} />
              <Label className="text-sm">Ativar LinkedIn Pixel</Label>
              <a href="https://www.linkedin.com/campaignmanager" target="_blank" rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Campaign Manager <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Partner ID (Insight Tag)</Label>
                <Input value={config.linkedinPartnerId} onChange={e => upd({ linkedinPartnerId: e.target.value })}
                  placeholder="1234567" className="text-sm font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Conversion ID</Label>
                <Input value={config.linkedinConversionId} onChange={e => upd({ linkedinConversionId: e.target.value })}
                  placeholder="9876543" className="text-sm font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Access Token (OAuth)</Label>
              <div className="relative">
                <Input type={show.linkedinToken ? 'text' : 'password'} value={config.linkedinAccessToken}
                  onChange={e => upd({ linkedinAccessToken: e.target.value })}
                  placeholder="AQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="text-sm font-mono pr-10" />
                <button type="button" onClick={() => toggleShow('linkedinToken')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show.linkedinToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <InfoBox>
              O <strong>lintrk('track', ...)</strong> dispara no browser. A Conversions API envia o evento com <code>event_id</code> para deduplicação.
            </InfoBox>
          </TabsContent>

          {/* ── Webhook ── */}
          <TabsContent value="webhook" className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={config.webhookEnabled} onCheckedChange={v => upd({ webhookEnabled: v })} />
              <Label className="text-sm">Ativar Webhook Global</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">URL padrão (pode ser sobrescrita por nó)</Label>
              <Input value={config.webhookDefaultUrl} onChange={e => upd({ webhookDefaultUrl: e.target.value })}
                placeholder="https://hooks.exemplo.com/form-event" className="text-sm" />
            </div>
            <InfoBox>
              O payload inclui: <code>event_id</code>, <code>form_id</code>, <code>timestamp</code>, <code>answers</code>, <code>variables</code>, <code>source_url</code>.
              A URL pode ser sobrescrita por nó individual no Workflow.
            </InfoBox>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border px-3.5 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
      {children}
    </div>
  );
}
