import { useState, useRef, useCallback, useMemo } from 'react';
import type { FormData, FormSEO } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, FileText, Image, Globe, Bot, Twitter,
  Code2, Palette, Link2, Tag, Eye, ChevronDown, ChevronUp, Upload, Loader2, X, Trash2,
} from 'lucide-react';
import ColorPickerField from '@/components/editor/shared/ColorPickerField';
import { toast } from 'sonner';
import { resolveFormSeo, truncateSeoText } from '@/lib/formSeo';
import { useBrand } from '@/hooks/brandContext';
import { useImageUpload } from '@/hooks/useImageUpload';

interface Props {
  form: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
}

function Section({ icon: Icon, title, description, children, defaultOpen = true }: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full group"
      >
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-6">{description}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AutomaticSocialPreview({ form, title, description, productName, ownerName }: {
  form: FormData;
  title: string;
  description: string;
  productName: string;
  ownerName: string;
}) {
  const page = form.showWelcomeScreen && form.welcomePage?.elements?.length
    ? form.welcomePage
    : form.pages?.find((candidate) => candidate.elements?.length) || form.pages?.[0];
  const fields = (page?.elements || [])
    .filter((element) => element.type.startsWith('input_'))
    .map((element) => element.label || element.placeholder || 'Sua resposta')
    .slice(0, 3);
  if (!fields.length) fields.push('Sua resposta');
  const primary = /^#[0-9a-f]{6}$/i.test(form.style?.buttonBgColor || '')
    ? form.style.buttonBgColor
    : '#635BFF';

  return (
    <div className="aspect-[1200/630] overflow-hidden rounded-[10px] border border-border bg-[#0b1024] p-4 text-white">
      <div className="grid h-full grid-cols-[1.25fr_.75fr] gap-4">
        <div className="flex min-w-0 flex-col justify-between py-1">
          <div className="flex items-center gap-2.5">
            <img src="/images/brand-icon.svg" alt="" className="h-8 w-8 shrink-0 object-contain" />
            <span className="truncate text-[11px] font-semibold">{productName} · {ownerName}</span>
          </div>
          <div className="min-w-0 space-y-2">
            <span className="block h-1 w-10 rounded-full" style={{ backgroundColor: primary }} />
            <p className="line-clamp-2 text-lg font-bold leading-tight">{truncateSeoText(title, 72)}</p>
            <p className="line-clamp-2 text-[10px] leading-relaxed text-white/70">{truncateSeoText(description, 120)}</p>
          </div>
          <p className="text-[9px] text-white/55">● Formulário online</p>
        </div>
        <div className="my-1 flex rotate-[1deg] flex-col rounded-[10px] bg-[#f8fafc] p-3 text-[#111827] shadow-xl">
          <div className="mb-2 flex gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red-400" /><i className="h-1.5 w-1.5 rounded-full bg-amber-300" /><i className="h-1.5 w-1.5 rounded-full bg-emerald-400" /></div>
          <p className="mb-2 truncate text-[9px] font-semibold">{page?.title || form.title}</p>
          <div className="space-y-1.5">
            {fields.map((field, index) => <div key={`${field}-${index}`} className="truncate rounded border bg-white px-2 py-1.5 text-[7px] text-slate-400">{field}</div>)}
          </div>
          <div className="mt-auto rounded py-1.5 text-center text-[7px] font-semibold text-white" style={{ backgroundColor: primary }}>Continuar →</div>
        </div>
      </div>
    </div>
  );
}

export default function FormSEOSettings({ form, onUpdate }: Props) {
  const { brand } = useBrand();
  const seo: FormSEO = useMemo(() => form.seo || {}, [form.seo]);
  const ogInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const resolvedSeo = useMemo(() => resolveFormSeo({
    id: form.id,
    title: form.title,
    description: form.description,
    status: form.status,
    updatedAt: form.updatedAt,
    brand,
    seo,
    preview: { primaryColor: form.style?.buttonBgColor || form.style?.primaryColor },
  }, { origin: window.location.origin }), [brand, form, seo]);

  const update = useCallback((patch: Partial<FormSEO>) => {
    onUpdate({ seo: { ...seo, ...patch } });
  }, [onUpdate, seo]);

  const { upload: handleOgUpload, uploading: uploadingOg } = useImageUpload({
    pathPrefix: 'og-images',
    maxSizeMB: 2,
    onSuccess: (url) => {
      update({ ogImage: url });
      toast.success('Imagem enviada');
    },
    onError: () => toast.error('Erro ao enviar imagem'),
  });

  const { upload: handleFaviconUpload, uploading: uploadingFavicon } = useImageUpload({
    pathPrefix: 'favicons',
    maxSizeMB: 0.5,
    onSuccess: (url) => {
      update({ favicon: url });
      toast.success('Favicon enviado');
    },
    onError: () => toast.error('Erro ao enviar favicon'),
  });

  const titleLen = (seo.title || '').length;
  const descLen = (seo.description || '').length;

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            SEO & Meta Tags
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure como este formulário aparece nos mecanismos de busca e redes sociais.
          </p>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Prévia no Google</p>
          <div className="space-y-0.5">
            <p className="text-[#1a0dab] text-base font-medium truncate">
              {resolvedSeo.title}
            </p>
            <p className="text-[#006621] text-xs truncate">
              {resolvedSeo.canonicalUrl}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {resolvedSeo.description}
            </p>
          </div>
        </div>

        {/* Basic SEO */}
        <Section icon={FileText} title="Básico" description="Título e descrição exibidos nos resultados de busca.">
          <Field label="Título SEO" hint={`${titleLen}/60 caracteres recomendados`}>
            <Input
              value={seo.title || ''}
              onChange={e => update({ title: e.target.value })}
              placeholder={form.title || 'Título do formulário'}
              className="text-xs h-9"
              maxLength={120}
            />
          </Field>

          <Field label="Meta descrição" hint={`${descLen}/160 caracteres recomendados`}>
            <Textarea
              value={seo.description || ''}
              onChange={e => update({ description: e.target.value })}
              placeholder={resolvedSeo.description}
              className="text-xs min-h-[80px] resize-none"
              maxLength={320}
            />
          </Field>

          <Field label="Palavras-chave" hint="Separadas por vírgula. Menos usado pelo Google, mas ainda relevante para outros buscadores.">
            <Input
              value={seo.keywords || ''}
              onChange={e => update({ keywords: e.target.value })}
              placeholder={resolvedSeo.keywords}
              className="text-xs h-9"
            />
          </Field>
        </Section>

        {/* Open Graph / Social */}
        <Section icon={Image} title="Open Graph (Redes sociais)" description="Como o link aparece quando compartilhado no Facebook, WhatsApp, LinkedIn, etc." defaultOpen={false}>
          <Field label="Imagem de capa (og:image)" hint="A capa automática em 1200×630px nunca fica vazia. Envie uma imagem para substituí-la.">
            <input
              ref={ogInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleOgUpload(f);
                e.target.value = '';
              }}
            />

            {seo.ogImage ? (
              <div className="space-y-2">
                <div className="rounded-[8px] border border-border overflow-hidden">
                  <img
                    src={seo.ogImage}
                    alt="OG Preview"
                    className="w-full h-32 object-cover bg-muted"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => ogInputRef.current?.click()}>
                    <Upload className="h-3 w-3 mr-1.5" />Trocar imagem
                  </Button>
                  <Button
                    variant="outline" size="sm" className="text-xs text-destructive hover:text-destructive"
                    onClick={() => update({ ogImage: '' })}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />Remover
                  </Button>
                </div>
                <Input
                  value={seo.ogImage || ''}
                  onChange={e => update({ ogImage: e.target.value })}
                  placeholder="ou cole uma URL"
                  className="text-xs font-mono h-8"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <AutomaticSocialPreview
                  form={form}
                  title={resolvedSeo.title}
                  description={resolvedSeo.description}
                  productName={resolvedSeo.productName}
                  ownerName={resolvedSeo.ownerName}
                />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">Capa automática ativa</p>
                    <p className="text-[10px] text-muted-foreground">Título, descrição, logotipo e prévia do formulário são atualizados sozinhos.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">1200 × 630</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-10 text-xs border-dashed gap-2"
                  disabled={uploadingOg}
                  onClick={() => ogInputRef.current?.click()}
                >
                  {uploadingOg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadingOg ? 'Enviando...' : 'Substituir por uma imagem personalizada'}
                </Button>
                <Input
                  value={seo.ogImage || ''}
                  onChange={e => update({ ogImage: e.target.value })}
                  placeholder="ou cole uma URL: https://..."
                  className="text-xs font-mono h-8"
                />
              </div>
            )}
          </Field>

          <Field label="Tipo (og:type)">
            <Select value={seo.ogType || 'website'} onValueChange={v => update({ ogType: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="website" className="text-xs">website</SelectItem>
                <SelectItem value="article" className="text-xs">article</SelectItem>
                <SelectItem value="product" className="text-xs">product</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Section>

        {/* Twitter */}
        <Section icon={Twitter} title="Twitter Card" description="Aparência do link no Twitter/X." defaultOpen={false}>
          <Field label="Tipo do card">
            <Select value={seo.twitterCard || 'summary_large_image'} onValueChange={v => update({ twitterCard: v as any })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary" className="text-xs">Summary (miniatura pequena)</SelectItem>
                <SelectItem value="summary_large_image" className="text-xs">Summary Large Image (imagem grande)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Section>

        {/* Technical */}
        <Section icon={Bot} title="Técnico" description="Configurações avançadas para crawlers e indexação." defaultOpen={false}>
          <Field label="URL canônica" hint="Define a URL preferida para este conteúdo (evita duplicidade).">
            <Input
              value={seo.canonicalUrl || ''}
              onChange={e => update({ canonicalUrl: e.target.value })}
              placeholder={resolvedSeo.canonicalUrl}
              className="text-xs font-mono h-9"
            />
          </Field>

          <Field label="Robots" hint="Controla indexação e rastreamento. Padrão: index, follow.">
            <Select value={seo.robots || 'index, follow'} onValueChange={v => update({ robots: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="index, follow" className="text-xs">index, follow (padrão)</SelectItem>
                <SelectItem value="noindex, follow" className="text-xs">noindex, follow</SelectItem>
                <SelectItem value="index, nofollow" className="text-xs">index, nofollow</SelectItem>
                <SelectItem value="noindex, nofollow" className="text-xs">noindex, nofollow</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Favicon" hint="Ícone exibido na aba do navegador. Use .ico, .png ou .svg.">
            <input
              ref={faviconInputRef}
              type="file"
              accept=".ico,.png,.svg,image/x-icon,image/png,image/svg+xml"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFaviconUpload(f);
                e.target.value = '';
              }}
            />

            {seo.favicon ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 rounded-[8px] border border-border bg-muted/30">
                  <img
                    src={seo.favicon}
                    alt="Favicon"
                    className="h-8 w-8 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="text-xs text-muted-foreground truncate flex-1 font-mono">{seo.favicon}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => faviconInputRef.current?.click()}>
                    <Upload className="h-3 w-3 mr-1.5" />Trocar
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => update({ favicon: '' })}>
                    <Trash2 className="h-3 w-3 mr-1" />Remover
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => update({ favicon: '/favicon.ico' })}>
                    <Globe className="h-3 w-3 mr-1" />Padrão
                  </Button>
                </div>
                <Input
                  value={seo.favicon || ''}
                  onChange={e => update({ favicon: e.target.value })}
                  placeholder="ou cole uma URL"
                  className="text-xs font-mono h-8"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-10 text-xs border-dashed gap-2"
                    disabled={uploadingFavicon}
                    onClick={() => faviconInputRef.current?.click()}
                  >
                    {uploadingFavicon ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingFavicon ? 'Enviando...' : 'Enviar favicon'}
                  </Button>
                  <Button variant="outline" className="h-10 text-xs gap-1.5" onClick={() => update({ favicon: '/favicon.ico' })}>
                    <Globe className="h-3.5 w-3.5" />Usar padrão do sistema
                  </Button>
                </div>
                <Input
                  value={seo.favicon || ''}
                  onChange={e => update({ favicon: e.target.value })}
                  placeholder="ou cole uma URL: https://..."
                  className="text-xs font-mono h-8"
                />
              </div>
            )}
          </Field>

          <Field label="Cor do tema (theme-color)" hint="Cor da barra do navegador em dispositivos móveis.">
            <ColorPickerField
              value={seo.themeColor || ''}
              onChange={v => update({ themeColor: v })}
              placeholder="#ffffff"
              defaultColor="#ffffff"
            />
          </Field>
        </Section>

        {/* Structured Data */}
        <Section icon={Code2} title="Dados estruturados (JSON-LD)" description="Schema.org markup para rich results nos buscadores." defaultOpen={false}>
          <Field label="JSON-LD" hint="Edite o JSON-LD gerado automaticamente ou cole um personalizado.">
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => {
                  const generated = resolveFormSeo({
                    id: form.id,
                    title: form.title,
                    description: form.description,
                    status: form.status,
                    updatedAt: form.updatedAt,
                    seo: { ...seo, structuredData: undefined },
                  }, { origin: window.location.origin });
                  update({ structuredData: JSON.stringify(generated.jsonLd, null, 2) });
                  toast.success('JSON-LD gerado com base nas informações do formulário');
                }}
              >
                <Code2 className="h-3 w-3" />
                Gerar automaticamente
              </Button>
              <Textarea
                value={seo.structuredData || ''}
                onChange={e => update({ structuredData: e.target.value })}
                placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "Meu formulário"\n}'}
                className="text-xs font-mono min-h-[120px] resize-y"
              />
            </div>
          </Field>
        </Section>
      </div>
    </div>
  );
}
