import { useState, useCallback, useMemo, useRef } from 'react';
import { 
  Type, ImageIcon, MousePointer2, Minus, Space, Columns2, 
  Trash2, GripVertical, ChevronUp, ChevronDown, Plus, X,
  AlignLeft, AlignCenter, AlignRight, Upload, FolderOpen, Link, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useGallery } from '@/hooks/useGallery';
import GalleryPicker from '@/components/editor/GalleryPicker';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragOverlay, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Block types ────────────────────────────────────────────────────
type BlockType = 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'columns';

interface BlockPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface BaseBlock {
  id: string;
  type: BlockType;
  padding: BlockPadding;
}

interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  align: 'left' | 'center' | 'right';
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
}

interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt: string;
  width: string;
  align: 'left' | 'center' | 'right';
  link: string;
}

type ButtonLinkMode = 'custom' | 'variable' | 'pass_all_params' | 'pass_utms' | 'pass_variables';

interface ButtonBlock extends BaseBlock {
  type: 'button';
  text: string;
  href: string;
  linkMode: ButtonLinkMode;
  bgColor: string;
  textColor: string;
  borderRadius: number;
  align: 'left' | 'center' | 'right';
  fontSize: number;
  paddingX: number;
  paddingY: number;
}

interface DividerBlock extends BaseBlock {
  type: 'divider';
  color: string;
  thickness: number;
  width: string;
}

interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: number;
}

interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  columns: EmailBlock[][];
}

type EmailBlock = TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | ColumnsBlock;

// ─── Defaults ────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

const DEFAULT_PADDING: BlockPadding = { top: 8, right: 24, bottom: 8, left: 24 };

function createBlock(type: BlockType): EmailBlock {
  const id = uid();
  const padding = { ...DEFAULT_PADDING };
  switch (type) {
    case 'text': return { id, type, padding, content: 'Seu texto aqui...', align: 'left', fontSize: 16, fontWeight: 'normal', color: '#333333' };
    case 'image': return { id, type, padding, src: '', alt: '', width: '100%', align: 'center', link: '' };
    case 'button': return { id, type, padding: { top: 16, right: 24, bottom: 16, left: 24 }, text: 'Clique aqui', href: '#', linkMode: 'custom' as ButtonLinkMode, bgColor: '#4F46E5', textColor: '#FFFFFF', borderRadius: 6, align: 'center', fontSize: 16, paddingX: 32, paddingY: 12 };
    case 'divider': return { id, type, padding, color: '#E5E7EB', thickness: 1, width: '100%' };
    case 'spacer': return { id, type, padding: { top: 0, right: 0, bottom: 0, left: 0 }, height: 20 };
    case 'columns': return { id, type, padding: { top: 8, right: 20, bottom: 8, left: 20 }, columns: [[], []] };
  }
}

// ─── Blocks JSON embed (hidden comment in HTML) ─────────────────────
const BLOCKS_MARKER_START = '<!--BLOCKS:';
const BLOCKS_MARKER_END = ':BLOCKS-->';

function embedBlocksInHtml(html: string, blocks: EmailBlock[], emailBg: string, contentBg: string): string {
  const meta = JSON.stringify({ blocks, emailBg, contentBg });
  return html + `\n${BLOCKS_MARKER_START}${btoa(unescape(encodeURIComponent(meta)))}${BLOCKS_MARKER_END}`;
}

function extractBlocksFromHtml(html: string): { blocks: EmailBlock[]; emailBg: string; contentBg: string } | null {
  const startIdx = html.indexOf(BLOCKS_MARKER_START);
  const endIdx = html.indexOf(BLOCKS_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return null;
  try {
    const b64 = html.slice(startIdx + BLOCKS_MARKER_START.length, endIdx);
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch { return null; }
}

// ─── Block to HTML ──────────────────────────────────────────────────
function padStr(p: BlockPadding) {
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

function blockToHtml(block: EmailBlock): string {
  const pad = padStr(block.padding);
  switch (block.type) {
    case 'text':
      return `<tr><td style="padding:${pad};text-align:${block.align};font-size:${block.fontSize}px;font-weight:${block.fontWeight};color:${block.color};font-family:Arial,Helvetica,sans-serif;line-height:1.5;">${block.content.replace(/\n/g, '<br/>')}</td></tr>`;
    case 'image': {
      const img = `<img src="${block.src}" alt="${block.alt}" style="display:block;max-width:100%;width:${block.width};height:auto;border:0;" />`;
      const linked = block.link ? `<a href="${block.link}" target="_blank">${img}</a>` : img;
      return `<tr><td style="padding:${pad};text-align:${block.align};">${linked}</td></tr>`;
    }
    case 'button':
      return `<tr><td style="padding:${pad};text-align:${block.align};"><a href="${block.href}" target="_blank" style="display:inline-block;background-color:${block.bgColor};color:${block.textColor};font-size:${block.fontSize}px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;text-decoration:none;padding:${block.paddingY}px ${block.paddingX}px;border-radius:${block.borderRadius}px;mso-padding-alt:0;">${block.text}</a></td></tr>`;
    case 'divider':
      return `<tr><td style="padding:${pad};"><table role="presentation" width="${block.width}" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-top:${block.thickness}px solid ${block.color};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;
    case 'spacer':
      return `<tr><td style="padding:0;height:${block.height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    case 'columns': {
      const colWidth = Math.floor(100 / block.columns.length);
      const cols = block.columns.map(col => {
        const inner = col.map(b => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blockToHtml(b)}</table>`).join('');
        return `<!--[if mso]><td style="width:${colWidth}%;vertical-align:top;padding:0 4px;"><![endif]--><div class="email-col" style="display:inline-block;width:100%;max-width:${colWidth}%;vertical-align:top;padding:0 4px;box-sizing:border-box;">${inner || '&nbsp;'}</div><!--[if mso]></td><![endif]-->`;
      }).join('');
      return `<tr><td style="padding:${pad};"><!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><![endif]-->${cols}<!--[if mso]></tr></table><![endif]--></td></tr>`;
    }
  }
}

function blocksToHtml(blocks: EmailBlock[], bgColor = '#F9FAFB', contentBg = '#FFFFFF', contentWidth = 600): string {
  const rows = blocks.map(blockToHtml).join('\n');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Email</title>
<style>
@media only screen and (max-width: 620px) {
  .email-container { width: 100% !important; min-width: 100% !important; }
  .email-col { display: block !important; width: 100% !important; max-width: 100% !important; }
  td { padding-left: 16px !important; padding-right: 16px !important; }
}
</style>
<!--[if mso]><style>table,td{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${bgColor};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${bgColor};">
<tr><td align="center" style="padding:24px 0;">
<table role="presentation" class="email-container" width="${contentWidth}" cellpadding="0" cellspacing="0" style="background-color:${contentBg};border-radius:8px;max-width:${contentWidth}px;width:100%;">
${rows}
</table>
</td></tr></table>
</body></html>`;
}

// ─── Block palette items ────────────────────────────────────────────
const BLOCK_TYPES: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: 'Texto', icon: Type },
  { type: 'image', label: 'Imagem', icon: ImageIcon },
  { type: 'button', label: 'Botão', icon: MousePointer2 },
  { type: 'divider', label: 'Divisor', icon: Minus },
  { type: 'spacer', label: 'Espaço', icon: Space },
  { type: 'columns', label: 'Colunas', icon: Columns2 },
];

// ─── Padding editor ─────────────────────────────────────────────────
function PaddingEditor({ padding, onChange }: { padding: BlockPadding; onChange: (p: BlockPadding) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-muted-foreground uppercase">Espaçamento interno</label>
      <div className="grid grid-cols-2 gap-1.5">
        {(['top', 'right', 'bottom', 'left'] as const).map(side => (
          <div key={side} className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-3 shrink-0">{side === 'top' ? '↑' : side === 'right' ? '→' : side === 'bottom' ? '↓' : '←'}</span>
            <Input
              type="number"
              value={padding[side]}
              onChange={e => onChange({ ...padding, [side]: Math.max(0, Number(e.target.value)) })}
              className="h-7 text-[10px] w-full"
              min={0}
              max={100}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings panels ────────────────────────────────────────────────
function TextSettings({ block, onChange }: { block: TextBlock; onChange: (b: TextBlock) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase">Conteúdo</label>
        <textarea
          value={block.content}
          onChange={e => onChange({ ...block, content: e.target.value })}
          className="w-full min-h-[80px] mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Tamanho</label>
          <Input type="number" value={block.fontSize} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Peso</label>
          <Select value={block.fontWeight} onValueChange={v => onChange({ ...block, fontWeight: v as any })}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Cor</label>
          <div className="flex items-center gap-1 mt-1">
            <input type="color" value={block.color} onChange={e => onChange({ ...block, color: e.target.value })} className="h-8 w-8 rounded border border-input cursor-pointer" />
          </div>
        </div>
      </div>
      <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
      <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
    </div>
  );
}

function ImageSettings({ block, onChange }: { block: ImageBlock; onChange: (b: ImageBlock) => void }) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useGallery();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    setUploading(true);
    try {
      const gf = await uploadFile(file);
      if (gf) {
        onChange({ ...block, src: gf.url });
        toast.success('Imagem enviada e salva na galeria');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveToGallery = async () => {
    if (!block.src) { toast.error('Nenhuma imagem para salvar'); return; }
    try {
      setUploading(true);
      const response = await fetch(block.src);
      const blob = await response.blob();
      const ext = block.src.split('.').pop()?.split('?')[0] || 'png';
      const file = new File([blob], `email-image-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
      const gf = await uploadFile(file);
      if (gf) toast.success('Imagem salva na galeria');
    } catch {
      toast.error('Erro ao salvar na galeria');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Image preview */}
      {block.src && (
        <div className="rounded-md border border-border overflow-hidden bg-muted/30">
          <img src={block.src} alt={block.alt} className="w-full max-h-40 object-contain" />
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-3 w-3" /> Upload
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={() => setGalleryOpen(true)}>
          <FolderOpen className="h-3 w-3" /> Galeria
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={() => setShowUrlInput(!showUrlInput)}>
          <Link className="h-3 w-3" /> URL
        </Button>
      </div>

      {/* Save to gallery */}
      {block.src && (
        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 w-full" onClick={handleSaveToGallery} disabled={uploading}>
          <Save className="h-3 w-3" /> Salvar na galeria
        </Button>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      <GalleryPicker
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSelect={(file) => onChange({ ...block, src: file.url })}
        accept="image/*"
      />

      {/* URL input (togglable) */}
      {showUrlInput && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">URL da Imagem</label>
          <Input value={block.src} onChange={e => onChange({ ...block, src: e.target.value })} placeholder="https://..." className="h-8 text-xs mt-1" />
        </div>
      )}

      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase">Texto alternativo</label>
        <Input value={block.alt} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder="Descrição" className="h-8 text-xs mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Largura</label>
          <Input value={block.width} onChange={e => onChange({ ...block, width: e.target.value })} placeholder="100%" className="h-8 text-xs mt-1" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Link</label>
          <Input value={block.link} onChange={e => onChange({ ...block, link: e.target.value })} placeholder="https://..." className="h-8 text-xs mt-1" />
        </div>
      </div>
      <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
      <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
    </div>
  );
}

function ButtonSettings({ block, onChange, variables, trackedParams, allInputElements }: {
  block: ButtonBlock;
  onChange: (b: ButtonBlock) => void;
  variables?: Props['variables'];
  trackedParams?: Props['trackedParams'];
  allInputElements?: Props['allInputElements'];
}) {
  const LINK_MODES: { value: ButtonLinkMode; label: string; desc: string }[] = [
    { value: 'custom', label: 'Link personalizado', desc: 'URL fixa ou com variáveis {{…}}' },
    { value: 'variable', label: 'Variável de link', desc: 'Usa o valor de uma variável como URL' },
    { value: 'pass_all_params', label: 'Repassar todos os parâmetros', desc: 'Anexa todos os parâmetros GET recebidos ao link' },
    { value: 'pass_utms', label: 'Repassar UTMs', desc: 'Anexa apenas utm_source, utm_medium, utm_campaign, etc.' },
    { value: 'pass_variables', label: 'Repassar variáveis', desc: 'Anexa variáveis como parâmetros no link' },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase">Texto do botão</label>
        <Input value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} className="h-8 text-xs mt-1" />
      </div>

      {/* Link mode */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase">Tipo de link</label>
        <Select value={block.linkMode || 'custom'} onValueChange={v => onChange({ ...block, linkMode: v as ButtonLinkMode })}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LINK_MODES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                <div>
                  <span className="font-medium">{m.label}</span>
                  <span className="text-muted-foreground ml-1.5 text-[10px]">— {m.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Link value */}
      {(block.linkMode === 'custom' || !block.linkMode) && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">URL</label>
          <Input value={block.href} onChange={e => onChange({ ...block, href: e.target.value })} placeholder="https://... ou {{variavel}}" className="h-8 text-xs mt-1" />
          <p className="text-[9px] text-muted-foreground mt-0.5">Use {'{{nome_variavel}}'} para valores dinâmicos</p>
        </div>
      )}

      {block.linkMode === 'variable' && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Variável</label>
          <Select value={block.href} onValueChange={v => onChange({ ...block, href: v })}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Selecionar variável…" /></SelectTrigger>
            <SelectContent>
              {(variables || []).map(v => (
                <SelectItem key={v.id} value={`{{${v.name}}}`} className="text-xs">{v.name}</SelectItem>
              ))}
              {(allInputElements || []).flatMap(g => g.elements.map(el => (
                <SelectItem key={el.elementId} value={`{{${el.elementId}}}`} className="text-xs">{g.pageTitle} › {el.elementLabel}</SelectItem>
              )))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(block.linkMode === 'pass_all_params' || block.linkMode === 'pass_utms' || block.linkMode === 'pass_variables') && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">URL base</label>
          <Input value={block.href} onChange={e => onChange({ ...block, href: e.target.value })} placeholder="https://destino.com" className="h-8 text-xs mt-1" />
          <p className="text-[9px] text-muted-foreground mt-0.5">
            {block.linkMode === 'pass_all_params' && 'Todos os parâmetros GET serão anexados automaticamente'}
            {block.linkMode === 'pass_utms' && 'Apenas utm_source, utm_medium, utm_campaign, utm_term e utm_content'}
            {block.linkMode === 'pass_variables' && 'Todas as variáveis serão passadas como ?var1=valor&var2=valor'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Cor do fundo</label>
          <div className="flex items-center gap-1 mt-1">
            <input type="color" value={block.bgColor} onChange={e => onChange({ ...block, bgColor: e.target.value })} className="h-8 w-8 rounded border border-input cursor-pointer" />
            <Input value={block.bgColor} onChange={e => onChange({ ...block, bgColor: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Cor do texto</label>
          <div className="flex items-center gap-1 mt-1">
            <input type="color" value={block.textColor} onChange={e => onChange({ ...block, textColor: e.target.value })} className="h-8 w-8 rounded border border-input cursor-pointer" />
            <Input value={block.textColor} onChange={e => onChange({ ...block, textColor: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Raio</label>
          <Input type="number" value={block.borderRadius} onChange={e => onChange({ ...block, borderRadius: Number(e.target.value) })} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Pad. H</label>
          <Input type="number" value={block.paddingX} onChange={e => onChange({ ...block, paddingX: Number(e.target.value) })} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Pad. V</label>
          <Input type="number" value={block.paddingY} onChange={e => onChange({ ...block, paddingY: Number(e.target.value) })} className="h-8 text-xs mt-1" />
        </div>
      </div>
      <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
      <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
    </div>
  );
}

function DividerSettings({ block, onChange }: { block: DividerBlock; onChange: (b: DividerBlock) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Cor</label>
          <div className="flex items-center gap-1 mt-1">
            <input type="color" value={block.color} onChange={e => onChange({ ...block, color: e.target.value })} className="h-8 w-8 rounded border border-input cursor-pointer" />
            <Input value={block.color} onChange={e => onChange({ ...block, color: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Espessura</label>
          <Input type="number" value={block.thickness} onChange={e => onChange({ ...block, thickness: Number(e.target.value) })} className="h-8 text-xs mt-1" />
        </div>
      </div>
      <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
    </div>
  );
}

function SpacerSettings({ block, onChange }: { block: SpacerBlock; onChange: (b: SpacerBlock) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase">Altura (px)</label>
        <Input type="number" value={block.height} onChange={e => onChange({ ...block, height: Number(e.target.value) })} className="h-8 text-xs mt-1 w-24" />
      </div>
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: 'left' | 'center' | 'right') => void }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground uppercase">Alinhamento</label>
      <div className="flex gap-1 mt-1">
        {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([v, Icon]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cn('p-1.5 rounded border transition-colors', value === v ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Block preview ──────────────────────────────────────────────────
function BlockPreview({ block }: { block: EmailBlock }) {
  const pad = block.padding;
  const padStyle = { paddingTop: pad.top, paddingRight: pad.right, paddingBottom: pad.bottom, paddingLeft: pad.left };

  switch (block.type) {
    case 'text':
      return (
        <div style={{ ...padStyle, textAlign: block.align, fontSize: block.fontSize, fontWeight: block.fontWeight, color: block.color, lineHeight: 1.5, fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {block.content.split('\n').map((line, i) => <span key={i}>{line}{i < block.content.split('\n').length - 1 && <br />}</span>)}
        </div>
      );
    case 'image':
      return (
        <div style={{ ...padStyle, textAlign: block.align }}>
          {block.src ? (
            <img src={block.src} alt={block.alt} style={{ maxWidth: '100%', width: block.width, height: 'auto', display: 'inline-block' }} />
          ) : (
            <div className="flex items-center justify-center h-24 bg-muted/50 rounded border border-dashed border-border">
              <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
            </div>
          )}
        </div>
      );
    case 'button':
      return (
        <div style={{ ...padStyle, textAlign: block.align }}>
          <span style={{
            display: 'inline-block', backgroundColor: block.bgColor, color: block.textColor,
            fontSize: block.fontSize, fontWeight: 'bold', padding: `${block.paddingY}px ${block.paddingX}px`,
            borderRadius: block.borderRadius, fontFamily: 'Arial, Helvetica, sans-serif', textDecoration: 'none',
          }}>
            {block.text}
          </span>
        </div>
      );
    case 'divider':
      return (
        <div style={padStyle}>
          <hr style={{ border: 'none', borderTop: `${block.thickness}px solid ${block.color}`, width: block.width, margin: '0 auto' }} />
        </div>
      );
    case 'spacer':
      return <div style={{ height: block.height }} />;
    case 'columns':
      return (
        <div style={{ ...padStyle, display: 'flex', gap: 8 }}>
          {block.columns.map((col, ci) => (
            <div key={ci} style={{ flex: 1, minWidth: 0 }}>
              {col.length === 0 ? (
                <div className="h-16 rounded border border-dashed border-border flex flex-col items-center justify-center text-[10px] text-muted-foreground gap-1">
                  <span>Coluna {ci + 1}</span>
                  <span className="text-[9px] opacity-60">Selecione para adicionar</span>
                </div>
              ) : (
                col.map(b => <BlockPreview key={b.id} block={b} />)
              )}
            </div>
          ))}
        </div>
      );
  }
}

// ─── Column block types (no nested columns) ────────────────────────
const COL_BLOCK_TYPES: { type: BlockType; label: string; icon: typeof Type }[] = BLOCK_TYPES.filter(b => b.type !== 'columns');

// ─── Columns settings ───────────────────────────────────────────────
function ColumnsSettings({ block, onChange }: { block: ColumnsBlock; onChange: (b: ColumnsBlock) => void }) {
  const addToColumn = (colIndex: number, type: BlockType) => {
    const newBlock = createBlock(type);
    const newColumns = block.columns.map((col, ci) =>
      ci === colIndex ? [...col, newBlock] : col
    );
    onChange({ ...block, columns: newColumns });
  };

  const removeFromColumn = (colIndex: number, blockId: string) => {
    const newColumns = block.columns.map((col, ci) =>
      ci === colIndex ? col.filter(b => b.id !== blockId) : col
    );
    onChange({ ...block, columns: newColumns });
  };

  const moveInColumn = (colIndex: number, blockId: string, dir: -1 | 1) => {
    const newColumns = block.columns.map((col, ci) => {
      if (ci !== colIndex) return col;
      const idx = col.findIndex(b => b.id === blockId);
      if (idx < 0) return col;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= col.length) return col;
      const arr = [...col];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
    onChange({ ...block, columns: newColumns });
  };

  const addColumn = () => {
    if (block.columns.length >= 4) return;
    onChange({ ...block, columns: [...block.columns, []] });
  };

  const removeColumn = (ci: number) => {
    if (block.columns.length <= 1) return;
    onChange({ ...block, columns: block.columns.filter((_, i) => i !== ci) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase">Colunas ({block.columns.length})</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={addColumn} disabled={block.columns.length >= 4}>
            <Plus className="h-3 w-3 mr-0.5" /> Coluna
          </Button>
        </div>
      </div>

      {block.columns.map((col, ci) => (
        <div key={ci} className="space-y-1.5 rounded-md border border-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold">Coluna {ci + 1}</span>
            {block.columns.length > 1 && (
              <button onClick={() => removeColumn(ci)} className="text-destructive hover:text-destructive/80">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Existing blocks in column */}
          {col.map((b, bi) => (
            <div key={b.id} className="flex items-center gap-1 rounded bg-muted/50 px-1.5 py-1 text-[10px]">
              <span className="flex-1 truncate">{BLOCK_LABELS[b.type]}: {b.type === 'text' ? (b as TextBlock).content.slice(0, 20) : b.type === 'button' ? (b as ButtonBlock).text : ''}</span>
              <button onClick={() => moveInColumn(ci, b.id, -1)} className="p-0.5 hover:bg-muted rounded" disabled={bi === 0}><ChevronUp className="h-2.5 w-2.5" /></button>
              <button onClick={() => moveInColumn(ci, b.id, 1)} className="p-0.5 hover:bg-muted rounded" disabled={bi === col.length - 1}><ChevronDown className="h-2.5 w-2.5" /></button>
              <button onClick={() => removeFromColumn(ci, b.id)} className="p-0.5 hover:bg-muted rounded text-destructive"><Trash2 className="h-2.5 w-2.5" /></button>
            </div>
          ))}

          {/* Add block buttons */}
          <div className="flex flex-wrap gap-1 pt-1">
            {COL_BLOCK_TYPES.map(bt => (
              <button
                key={bt.type}
                onClick={() => addToColumn(ci, bt.type)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-[9px]"
              >
                <bt.icon className="h-2.5 w-2.5" />
                {bt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
    </div>
  );
}

// ─── Settings dispatcher ────────────────────────────────────────────
function BlockSettingsDispatch({ block, onChange, variables, trackedParams, allInputElements }: {
  block: EmailBlock;
  onChange: (b: EmailBlock) => void;
  variables?: Props['variables'];
  trackedParams?: Props['trackedParams'];
  allInputElements?: Props['allInputElements'];
}) {
  switch (block.type) {
    case 'text': return <TextSettings block={block} onChange={onChange} />;
    case 'image': return <ImageSettings block={block} onChange={onChange} />;
    case 'button': return <ButtonSettings block={block} onChange={onChange} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />;
    case 'divider': return <DividerSettings block={block} onChange={onChange} />;
    case 'spacer': return <SpacerSettings block={block} onChange={onChange} />;
    case 'columns': return <ColumnsSettings block={block} onChange={onChange as any} />;
  }
}

const BLOCK_LABELS: Record<BlockType, string> = {
  text: 'Texto', image: 'Imagem', button: 'Botão', divider: 'Divisor', spacer: 'Espaço', columns: 'Colunas',
};

// ─── Sortable block wrapper ─────────────────────────────────────────
function SortableBlock({ block, isSelected, isDragOverlay, onSelect, onRemove, onAddAfter }: {
  block: EmailBlock;
  isSelected: boolean;
  isDragOverlay: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onAddAfter: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        'relative group cursor-pointer transition-all',
        isSelected ? 'ring-2 ring-primary/40 ring-inset' : 'hover:ring-1 hover:ring-primary/20 hover:ring-inset',
        isDragging && 'z-0',
      )}
    >
      <BlockPreview block={block} />
      {/* Drag handle + actions */}
      <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded bg-background/90 border border-border shadow-sm cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </div>
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 rounded-md border border-border shadow-sm p-0.5">
        <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-0.5 rounded hover:bg-muted text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onAddAfter(); }}
          className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (html: string) => void;
  variables?: { id: string; name: string }[];
  trackedParams?: { key: string; enabled: boolean }[];
  allInputElements?: { pageId: string; pageTitle: string; elements: { elementId: string; elementLabel: string }[] }[];
}

export default function EmailBuilderDialog({ open, onClose, value, onChange, variables, trackedParams, allInputElements }: Props) {
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => {
    const restored = extractBlocksFromHtml(value);
    if (restored) return restored.blocks;
    return [createBlock('text'), createBlock('divider'), createBlock('button')];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'editor' | 'preview' | 'code'>('editor');
  const [emailBg, setEmailBg] = useState(() => {
    const restored = extractBlocksFromHtml(value);
    return restored?.emailBg || '#F9FAFB';
  });
  const [contentBg, setContentBg] = useState(() => {
    const restored = extractBlocksFromHtml(value);
    return restored?.contentBg || '#FFFFFF';
  });

  const selectedBlock = useMemo(() => blocks.find(b => b.id === selectedId) || null, [blocks, selectedId]);
  const activeBlock = useMemo(() => blocks.find(b => b.id === activeId) || null, [blocks, activeId]);

  const html = useMemo(() => blocksToHtml(blocks, emailBg, contentBg), [blocks, emailBg, contentBg]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const updateBlock = useCallback((updated: EmailBlock) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
  }, []);

  const addBlock = useCallback((type: BlockType, index?: number) => {
    const block = createBlock(type);
    setBlocks(prev => {
      const arr = [...prev];
      arr.splice(index ?? arr.length, 0, block);
      return arr;
    });
    setSelectedId(block.id);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks(prev => {
      const oldIndex = prev.findIndex(b => b.id === active.id);
      const newIndex = prev.findIndex(b => b.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleSave = useCallback(() => {
    const fullHtml = embedBlocksInHtml(html, blocks, emailBg, contentBg);
    onChange(fullHtml);
    onClose();
  }, [html, blocks, emailBg, contentBg, onChange, onClose]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0 gap-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Editor de E-mail</h2>
            <div className="flex border border-border rounded-md">
              {([['editor', 'Editor'], ['preview', 'Preview'], ['code', 'HTML']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={cn('px-3 py-1 text-xs transition-colors', previewMode === mode ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Salvar HTML</Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {previewMode === 'editor' && (
            <>
              {/* Block palette */}
              <div className="w-56 border-r border-border flex-shrink-0 overflow-y-auto p-3 space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Blocos</span>
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  {BLOCK_TYPES.map(bt => (
                    <button
                      key={bt.type}
                      onClick={() => addBlock(bt.type)}
                      className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-center"
                    >
                      <bt.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[10px] font-medium">{bt.label}</span>
                    </button>
                  ))}
                </div>

                <div className="pt-4 space-y-3">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estilo Global</span>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Fundo do e-mail</label>
                    <div className="flex items-center gap-1 mt-1">
                      <input type="color" value={emailBg} onChange={e => setEmailBg(e.target.value)} className="h-7 w-7 rounded border border-input cursor-pointer" />
                      <Input value={emailBg} onChange={e => setEmailBg(e.target.value)} className="h-7 text-[10px] flex-1" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Fundo do conteúdo</label>
                    <div className="flex items-center gap-1 mt-1">
                      <input type="color" value={contentBg} onChange={e => setContentBg(e.target.value)} className="h-7 w-7 rounded border border-input cursor-pointer" />
                      <Input value={contentBg} onChange={e => setContentBg(e.target.value)} className="h-7 text-[10px] flex-1" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Canvas */}
              <div className="flex-1 overflow-y-auto" style={{ backgroundColor: emailBg }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  <div className="max-w-[600px] mx-auto my-6 rounded-lg shadow-sm" style={{ backgroundColor: contentBg }}>
                    {blocks.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Plus className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">Clique em um bloco à esquerda para adicionar</p>
                      </div>
                    )}
                    <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                      {blocks.map((block, idx) => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          isSelected={selectedId === block.id}
                          isDragOverlay={false}
                          onSelect={() => setSelectedId(block.id)}
                          onRemove={() => removeBlock(block.id)}
                          onAddAfter={() => addBlock('text', idx + 1)}
                        />
                      ))}
                    </SortableContext>
                  </div>
                  <DragOverlay dropAnimation={null}>
                    {activeBlock && (
                      <div className="opacity-80 shadow-lg rounded-lg overflow-hidden" style={{ backgroundColor: contentBg, maxWidth: 600 }}>
                        <BlockPreview block={activeBlock} />
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              </div>

              {/* Settings panel */}
              <div className="w-64 border-l border-border flex-shrink-0 overflow-y-auto p-3">
                {selectedBlock ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold">{BLOCK_LABELS[selectedBlock.type]}</span>
                      <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <BlockSettingsDispatch block={selectedBlock} onChange={updateBlock} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <p className="text-xs">Selecione um bloco para editar</p>
                  </div>
                )}
              </div>
            </>
          )}

          {previewMode === 'preview' && (
            <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
              <div className="max-w-[650px] mx-auto rounded-lg shadow-lg overflow-hidden border border-border">
                <iframe
                  srcDoc={html}
                  className="w-full border-0"
                  style={{ height: '600px' }}
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          )}

          {previewMode === 'code' && (
            <div className="flex-1 overflow-y-auto p-4">
              <textarea
                value={html}
                readOnly
                className="w-full h-full rounded-md border border-input bg-muted/30 px-3 py-2 text-xs font-mono resize-none focus-visible:outline-none"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
