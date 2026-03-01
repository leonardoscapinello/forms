// ─── Email Block Types ──────────────────────────────────────────────

export type ElementType = 'text' | 'image' | 'button' | 'divider' | 'spacer';
export type BlockType = ElementType | 'columns';

export interface BlockPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BaseBlock {
  id: string;
  type: BlockType;
  padding: BlockPadding;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  align: 'left' | 'center' | 'right';
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt: string;
  width: string;
  align: 'left' | 'center' | 'right';
  link: string;
}

export type ButtonLinkMode = 'custom' | 'variable' | 'pass_all_params' | 'pass_utms' | 'pass_variables';

export interface ButtonBlock extends BaseBlock {
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

export interface DividerBlock extends BaseBlock {
  type: 'divider';
  color: string;
  thickness: number;
  width: string;
}

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: number;
}

export interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  columns: EmailBlock[][];
}

export type EmailBlock = TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | ColumnsBlock;

// ─── Defaults ────────────────────────────────────────────────────────
export function uid() { return Math.random().toString(36).slice(2, 10); }

export const DEFAULT_PADDING: BlockPadding = { top: 8, right: 16, bottom: 8, left: 16 };

export function createElement(type: ElementType): EmailBlock {
  const id = uid();
  const padding = { ...DEFAULT_PADDING };
  switch (type) {
    case 'text': return { id, type, padding, content: 'Seu texto aqui...', align: 'left', fontSize: 16, fontWeight: 'normal', color: '#333333' };
    case 'image': return { id, type, padding, src: '', alt: '', width: '100%', align: 'center', link: '' };
    case 'button': return { id, type, padding: { top: 16, right: 16, bottom: 16, left: 16 }, text: 'Clique aqui', href: '#', linkMode: 'custom' as ButtonLinkMode, bgColor: '#4F46E5', textColor: '#FFFFFF', borderRadius: 6, align: 'center', fontSize: 16, paddingX: 32, paddingY: 12 };
    case 'divider': return { id, type, padding, color: '#E5E7EB', thickness: 1, width: '100%' };
    case 'spacer': return { id, type, padding: { top: 0, right: 0, bottom: 0, left: 0 }, height: 20 };
  }
}

export function createStructure(colCount: number): ColumnsBlock {
  const columns: EmailBlock[][] = [];
  for (let i = 0; i < colCount; i++) columns.push([]);
  return {
    id: uid(),
    type: 'columns',
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    columns,
  };
}

// Keep backward compat
export function createBlock(type: BlockType): EmailBlock {
  if (type === 'columns') return createStructure(2);
  return createElement(type as ElementType);
}

// ─── HTML serialization ──────────────────────────────────────────────
function padStr(p: BlockPadding) {
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

export function blockToHtml(block: EmailBlock): string {
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
        return `<!--[if mso]><td style="width:${colWidth}%;vertical-align:top;"><![endif]--><div class="email-col" style="display:inline-block;width:100%;max-width:${colWidth}%;vertical-align:top;box-sizing:border-box;">${inner || '&nbsp;'}</div><!--[if mso]></td><![endif]-->`;
      }).join('');
      return `<tr><td style="padding:${pad};"><!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><![endif]-->${cols}<!--[if mso]></tr></table><![endif]--></td></tr>`;
    }
  }
}

export function blocksToHtml(blocks: EmailBlock[], bgColor = '#F9FAFB', contentBg = '#FFFFFF', contentWidth = 600, contentPadding = { top: 24, right: 0, bottom: 24, left: 0 }): string {
  const rows = blocks.map(blockToHtml).join('\n');
  const outerPad = `${contentPadding.top}px ${contentPadding.right}px ${contentPadding.bottom}px ${contentPadding.left}px`;
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
<tr><td align="center" style="padding:${outerPad};">
<table role="presentation" class="email-container" width="${contentWidth}" cellpadding="0" cellspacing="0" style="background-color:${contentBg};border-radius:8px;max-width:${contentWidth}px;width:100%;">
${rows}
</table>
</td></tr></table>
</body></html>`;
}

// ─── Blocks JSON embed (hidden comment in HTML) ─────────────────────
const BLOCKS_MARKER_START = '<!--BLOCKS:';
const BLOCKS_MARKER_END = ':BLOCKS-->';

export function embedBlocksInHtml(html: string, blocks: EmailBlock[], emailBg: string, contentBg: string, contentPadding?: BlockPadding): string {
  const meta = JSON.stringify({ blocks, emailBg, contentBg, contentPadding });
  return html + `\n${BLOCKS_MARKER_START}${btoa(unescape(encodeURIComponent(meta)))}${BLOCKS_MARKER_END}`;
}

export function extractBlocksFromHtml(html: string): { blocks: EmailBlock[]; emailBg: string; contentBg: string; contentPadding?: BlockPadding } | null {
  const startIdx = html.indexOf(BLOCKS_MARKER_START);
  const endIdx = html.indexOf(BLOCKS_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return null;
  try {
    const b64 = html.slice(startIdx + BLOCKS_MARKER_START.length, endIdx);
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch { return null; }
}

// ─── Constants ──────────────────────────────────────────────────────
import { Type, ImageIcon, MousePointer2, Minus, Space, Columns2, Square, Columns3, Columns4 } from 'lucide-react';

export const ELEMENT_TYPES: { type: ElementType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: 'Texto', icon: Type },
  { type: 'image', label: 'Imagem', icon: ImageIcon },
  { type: 'button', label: 'Botão', icon: MousePointer2 },
  { type: 'divider', label: 'Divisor', icon: Minus },
  { type: 'spacer', label: 'Espaço', icon: Space },
];

export const STRUCTURE_PRESETS: { cols: number; label: string; icon: typeof Square }[] = [
  { cols: 1, label: '1 Coluna', icon: Square },
  { cols: 2, label: '2 Colunas', icon: Columns2 },
  { cols: 3, label: '3 Colunas', icon: Columns3 },
  { cols: 4, label: '4 Colunas', icon: Columns4 },
];

// Keep backward compat
export const BLOCK_TYPES = [...ELEMENT_TYPES.map(e => ({ ...e, type: e.type as BlockType })), { type: 'columns' as BlockType, label: 'Colunas', icon: Columns2 }];
export const COL_BLOCK_TYPES = ELEMENT_TYPES.map(e => ({ ...e, type: e.type as BlockType }));

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: 'Texto', image: 'Imagem', button: 'Botão', divider: 'Divisor', spacer: 'Espaço', columns: 'Estrutura',
};
