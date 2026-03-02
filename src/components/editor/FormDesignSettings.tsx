import { useState, useRef, useCallback } from 'react';
import type { FormData, BackgroundType } from '@/types/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Palette, Type, Image, Upload, Loader2, X, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ColorPickerField from '@/components/editor/shared/ColorPickerField';
import GradientEditor from '@/components/editor/shared/GradientEditor';

interface Props {
  form: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
}

const FONT_OPTIONS = [
  { value: 'Borna', label: 'Borna' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
];


export default function FormDesignSettings({ form, onUpdate }: Props) {
  const style = form.style;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const updateStyle = useCallback((patch: Partial<typeof style>) => {
    onUpdate({ style: { ...style, ...patch } });
  }, [style, onUpdate]);

  const handleImageUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `form-backgrounds/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      const { data: res, error } = await supabase.functions.invoke('minio-upload', { body: formData });
      if (error || !res?.success) {
        toast.error(res?.message || 'Falha no upload');
        return;
      }
      updateStyle({ backgroundImage: res.url, backgroundType: 'image' });
      toast.success('Imagem de fundo enviada');
    } catch {
      toast.error('Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  }, [updateStyle]);

  const handleLogoUpload = useCallback(async (file: File) => {
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `form-logos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      const { data: res, error } = await supabase.functions.invoke('minio-upload', { body: formData });
      if (error || !res?.success) {
        toast.error(res?.message || 'Falha no upload do logotipo');
        return;
      }
      updateStyle({ logoUrl: res.url });
      toast.success('Logotipo enviado com sucesso');
    } catch {
      toast.error('Erro ao enviar logotipo');
    } finally {
      setUploadingLogo(false);
    }
  }, [updateStyle]);

  const bgType: BackgroundType = style.backgroundType || 'solid';

  return (
    <div className="space-y-6">

      {/* ─── Fundo ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Fundo</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Background type selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tipo</Label>
            <div className="flex gap-2">
              {([
                { value: 'solid' as const, label: 'Cor sólida' },
                { value: 'gradient' as const, label: 'Degradê' },
                { value: 'image' as const, label: 'Imagem' },
              ]).map(opt => (
                <Button
                  key={opt.value}
                  variant={bgType === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => updateStyle({ backgroundType: opt.value })}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Solid color */}
          {bgType === 'solid' && (
            <ColorPickerField
              label="Cor de fundo"
              value={resolveHex(style.backgroundColor, '#FAFAF6')}
              onChange={v => updateStyle({ backgroundColor: v || '#FAFAF6' })}
              placeholder="#FAFAF6"
              allowTransparent={false}
              defaultColor="#FAFAF6"
            />
          )}

          {/* Gradient */}
          {bgType === 'gradient' && (
            <GradientEditor
              value={style.backgroundGradient || ''}
              onChange={v => updateStyle({ backgroundGradient: v })}
            />
          )}

          {/* Image */}
          {bgType === 'image' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                  e.target.value = '';
                }}
              />
              {style.backgroundImage ? (
                <div className="space-y-2">
                  <div
                    className="h-24 rounded-lg border border-border bg-cover bg-center"
                    style={{ backgroundImage: `url(${style.backgroundImage})` }}
                  />
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3 w-3 mr-1.5" />Trocar imagem
                    </Button>
                    <Button
                      variant="outline" size="sm" className="text-xs"
                      onClick={() => updateStyle({ backgroundImage: '' })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Ajuste</Label>
                    <Select value={style.backgroundSize || 'cover'} onValueChange={v => updateStyle({ backgroundSize: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cover" className="text-xs">Cover (preencher)</SelectItem>
                        <SelectItem value="contain" className="text-xs">Contain (caber)</SelectItem>
                        <SelectItem value="auto" className="text-xs">Tamanho original</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-20 text-xs border-dashed"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Image className="h-4 w-4 mr-2" />}
                  {uploading ? 'Enviando...' : 'Enviar imagem de fundo'}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Cor do texto ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Cor do texto</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <ColorPickerField
            value={style.textColor || '#203300'}
            onChange={v => updateStyle({ textColor: v })}
            placeholder="#203300 (padrão)"
            allowTransparent
            defaultColor="#203300"
          />
        </div>
      </div>

      {/* ─── Tipografias ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Tipografias</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fonte geral</Label>
            <Select value={style.fontFamily || 'Borna'} onValueChange={v => updateStyle({ fontFamily: v })}>
              <SelectTrigger className="h-8 text-xs" style={{ fontFamily: style.fontFamily || 'Borna' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fonte dos títulos</Label>
            <Select value={style.headingFontFamily || style.fontFamily || 'Borna'} onValueChange={v => updateStyle({ headingFontFamily: v })}>
              <SelectTrigger className="h-8 text-xs" style={{ fontFamily: style.headingFontFamily || style.fontFamily || 'Borna' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fonte do corpo</Label>
            <Select value={style.bodyFontFamily || style.fontFamily || 'Borna'} onValueChange={v => updateStyle({ bodyFontFamily: v })}>
              <SelectTrigger className="h-8 text-xs" style={{ fontFamily: style.bodyFontFamily || style.fontFamily || 'Borna' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font preview */}
          <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
            <p className="text-lg font-semibold" style={{ fontFamily: style.headingFontFamily || style.fontFamily || 'Borna', color: style.textColor || undefined }}>
              Título de exemplo
            </p>
            <p className="text-sm" style={{ fontFamily: style.bodyFontFamily || style.fontFamily || 'Borna', color: style.textColor || undefined }}>
              Este é um texto de corpo para visualizar como ficará no formulário publicado.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Logotipo ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Logotipo</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Exibido no canto superior esquerdo do formulário publicado.
          </p>

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleLogoUpload(f);
              e.target.value = '';
            }}
          />

          {style.logoUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <img
                  src={style.logoUrl}
                  alt="Logotipo"
                  className="max-h-12 max-w-[160px] object-contain"
                  style={{ height: style.logoHeight || 40 }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1.5" />Trocar
                </Button>
                <Button
                  variant="outline" size="sm" className="text-xs"
                  onClick={() => updateStyle({ logoUrl: '', logoHeight: undefined })}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Altura</Label>
                  <span className="text-xs text-muted-foreground">{style.logoHeight || 40}px</span>
                </div>
                <Slider
                  value={[style.logoHeight || 40]}
                  onValueChange={([v]) => updateStyle({ logoHeight: v })}
                  min={20}
                  max={80}
                  step={4}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Use default logo */}
              <Button
                variant="outline"
                className="w-full h-14 text-xs gap-2"
                onClick={() => {
                  updateStyle({ logoUrl: '/images/twobrain-logo-dark.svg' });
                  toast.success('Logotipo padrão aplicado');
                }}
              >
                <img src="/images/twobrain-logo-dark.svg" alt="Logo padrão" className="h-6 object-contain" />
                Usar logotipo padrão
              </Button>

              {/* Upload custom */}
              <Button
                variant="outline"
                className="w-full h-12 text-xs border-dashed gap-2"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadingLogo ? 'Enviando...' : 'Enviar logotipo personalizado'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Color conversion helpers ──

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslToHex(hsl: string): string {
  const parts = hsl.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return 'faf9f7';
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

/** Resolve a color value (hex or HSL string) to a hex string for inputs */
function resolveHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith('#')) return value;
  // Assume HSL string like "30 20% 98%"
  return `#${hslToHex(value)}`;
}
