import { useState } from 'react';
import type { FormData, FormSEO } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, FileText, Image, Globe, Bot, Twitter,
  Code2, Palette, Link2, Tag, Eye, ChevronDown, ChevronUp,
} from 'lucide-react';
import ColorPickerField from '@/components/editor/shared/ColorPickerField';

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

export default function FormSEOSettings({ form, onUpdate }: Props) {
  const seo: FormSEO = form.seo || {};

  const update = (patch: Partial<FormSEO>) => {
    onUpdate({ seo: { ...seo, ...patch } });
  };

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
              {seo.title || form.title || 'Título do formulário'}
            </p>
            <p className="text-[#006621] text-xs truncate">
              {seo.canonicalUrl || `${window.location.origin}/f/${form.id}`}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {seo.description || 'Adicione uma descrição para melhorar a visibilidade nos mecanismos de busca.'}
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
              placeholder="Uma descrição concisa do formulário para mecanismos de busca..."
              className="text-xs min-h-[80px] resize-none"
              maxLength={320}
            />
          </Field>

          <Field label="Palavras-chave" hint="Separadas por vírgula. Menos usado pelo Google, mas ainda relevante para outros buscadores.">
            <Input
              value={seo.keywords || ''}
              onChange={e => update({ keywords: e.target.value })}
              placeholder="formulário, pesquisa, feedback"
              className="text-xs h-9"
            />
          </Field>
        </Section>

        {/* Open Graph / Social */}
        <Section icon={Image} title="Open Graph (Redes sociais)" description="Como o link aparece quando compartilhado no Facebook, WhatsApp, LinkedIn, etc." defaultOpen={false}>
          <Field label="Imagem de capa (og:image)" hint="Recomendado: 1200×630px. Use uma URL pública.">
            <Input
              value={seo.ogImage || ''}
              onChange={e => update({ ogImage: e.target.value })}
              placeholder="https://exemplo.com/imagem-capa.jpg"
              className="text-xs font-mono h-9"
            />
          </Field>

          {seo.ogImage && (
            <div className="rounded-lg border border-border overflow-hidden">
              <img src={seo.ogImage} alt="OG Preview" className="w-full h-32 object-cover bg-muted" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}

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
              placeholder={`${window.location.origin}/f/${form.id}`}
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

          <Field label="Favicon (URL)" hint="Ícone exibido na aba do navegador. Use .ico, .png ou .svg.">
            <Input
              value={seo.favicon || ''}
              onChange={e => update({ favicon: e.target.value })}
              placeholder="https://exemplo.com/favicon.ico"
              className="text-xs font-mono h-9"
            />
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
          <Field label="JSON-LD" hint="Cole um objeto JSON-LD válido. Será inserido como <script type='application/ld+json'>.">
            <Textarea
              value={seo.structuredData || ''}
              onChange={e => update({ structuredData: e.target.value })}
              placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "Meu formulário"\n}'}
              className="text-xs font-mono min-h-[120px] resize-y"
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}
