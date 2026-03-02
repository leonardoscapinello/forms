import { useState, useCallback, useMemo, useRef, useEffect } from 'react'; /* rebuild */
import {
  Trash2, ChevronUp, ChevronDown, Plus, X,
  AlignLeft, AlignCenter, AlignRight, ArrowLeft, ArrowRight,
  LayoutTemplate, Settings2, ChevronRight, Eye, Code2,
  Type, Image, MousePointerClick, Minus, Space, Columns,
  FileText, Sparkles, Palette, Grip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ColorPickerField, ImageSourcePicker } from '@/components/editor/shared';
import VariableInput from '@/components/editor/shared/VariableInput';
import { VariableHighlightOverlay } from '@/components/editor/shared/VariableHighlightOverlay';
import type { ElementLookup } from '@/components/editor/shared/VariableHighlightOverlay';
import { toast } from 'sonner';

import {
  type BlockType, type ElementType, type EmailBlock, type BlockPadding,
  type TextBlock, type ImageBlock, type ButtonBlock, type ButtonLinkMode,
  type DividerBlock, type SpacerBlock, type ColumnsBlock,
  createElement, createStructure, createBlock, uid,
  blocksToHtml, embedBlocksInHtml, extractBlocksFromHtml,
  ELEMENT_TYPES, STRUCTURE_PRESETS, BLOCK_LABELS,
} from './emailBlockTypes';
import { EMAIL_TEMPLATES, type EmailTemplate } from './emailTemplates';

// ─── Icons map ──────────────────────────────────────────────────────
const BLOCK_ICONS: Record<string, React.ElementType> = {
  text: Type, image: Image, button: MousePointerClick,
  divider: Minus, spacer: Space, columns: Columns,
};

// ─── Micro-components ───────────────────────────────────────────────

function SettingsSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors border-b border-border/30"
      >
        {title}
        <ChevronRight className={cn('h-3 w-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && <div className="py-3 space-y-3">{children}</div>}
    </div>
  );
}

function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function InlineRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

function PaddingEditor({ padding, onChange }: { padding: BlockPadding; onChange: (p: BlockPadding) => void }) {
  const sides = [
    { key: 'top' as const, label: '↑' },
    { key: 'right' as const, label: '→' },
    { key: 'bottom' as const, label: '↓' },
    { key: 'left' as const, label: '←' },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {sides.map(({ key, label }) => (
        <div key={key} className="min-w-0 text-center">
          <span className="text-[9px] text-muted-foreground block mb-0.5">{label}</span>
          <Input
            type="number"
            value={padding[key]}
            onChange={e => onChange({ ...padding, [key]: Math.max(0, Number(e.target.value)) })}
            className="h-7 text-[11px] text-center px-1"
            min={0} max={100}
          />
        </div>
      ))}
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: 'left' | 'center' | 'right') => void }) {
  return (
    <div className="inline-flex gap-px bg-muted/60 rounded-lg p-0.5">
      {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([v, Icon]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'flex items-center justify-center w-9 h-8 rounded-md transition-all',
            value === v
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

// ─── Settings panels ────────────────────────────────────────────────

function TextSettings({ block, onChange, variables, trackedParams, allInputElements }: {
  block: TextBlock; onChange: (b: TextBlock) => void;
  variables?: Props['variables']; trackedParams?: Props['trackedParams']; allInputElements?: Props['allInputElements'];
}) {
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Estilo">
        <InlineRow>
          <FieldRow label="Tamanho">
            <Input type="number" value={block.fontSize} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Peso">
            <Select value={block.fontWeight} onValueChange={v => onChange({ ...block, fontWeight: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Negrito</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </InlineRow>
        <InlineRow>
          <ColorPickerField label="Cor" value={block.color} onChange={c => onChange({ ...block, color: c || '#000000' })} allowTransparent={false} />
          <FieldRow label="Alinhamento">
            <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
          </FieldRow>
        </InlineRow>
      </SettingsSection>
      <SettingsSection title="Espaçamento" defaultOpen={false}>
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
    </div>
  );
}

function ImageSettings({ block, onChange, variables, trackedParams, allInputElements }: {
  block: ImageBlock; onChange: (b: ImageBlock) => void;
  variables?: Props['variables']; trackedParams?: Props['trackedParams']; allInputElements?: Props['allInputElements'];
}) {
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Imagem">
        <ImageSourcePicker value={block.src} onChange={url => onChange({ ...block, src: url })} accept="image/*" alt={block.alt}
          showPreview={!!block.src && !block.src.includes('{{')} hideSaveToGallery />
        <FieldRow label="Ou use uma variável">
          <VariableInput value={block.src} onChange={val => onChange({ ...block, src: val })} placeholder="{{variavel_imagem}}"
            variables={variables as any} trackedParams={trackedParams as any} allInputElements={allInputElements as any} />
        </FieldRow>
      </SettingsSection>
      <SettingsSection title="Configurações">
        <FieldRow label="Texto alternativo">
          <Input value={block.alt} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder="Descrição" className="h-8 text-xs" />
        </FieldRow>
        <InlineRow>
          <FieldRow label="Largura">
            <Input value={block.width} onChange={e => onChange({ ...block, width: e.target.value })} placeholder="100%" className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Link ao clicar">
            <VariableInput value={block.link} onChange={val => onChange({ ...block, link: val })} placeholder="https://..."
              variables={variables as any} trackedParams={trackedParams as any} allInputElements={allInputElements as any} />
          </FieldRow>
        </InlineRow>
        <FieldRow label="Alinhamento">
          <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
        </FieldRow>
      </SettingsSection>
      <SettingsSection title="Espaçamento" defaultOpen={false}>
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
    </div>
  );
}

function ButtonSettings({ block, onChange, variables, trackedParams, allInputElements }: {
  block: ButtonBlock; onChange: (b: ButtonBlock) => void;
  variables?: Props['variables']; trackedParams?: Props['trackedParams']; allInputElements?: Props['allInputElements'];
}) {
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Conteúdo">
        <FieldRow label="Texto do botão">
          <VariableInput value={block.text} onChange={val => onChange({ ...block, text: val })} placeholder="Clique aqui"
            variables={variables as any} trackedParams={trackedParams as any} allInputElements={allInputElements as any} />
        </FieldRow>
        <FieldRow label="Link de destino">
          <Select value={block.linkMode || 'custom'} onValueChange={v => onChange({ ...block, linkMode: v as ButtonLinkMode })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom" className="text-xs">Link personalizado</SelectItem>
              <SelectItem value="variable" className="text-xs">Variável</SelectItem>
              <SelectItem value="pass_all_params" className="text-xs">Repassar parâmetros</SelectItem>
              <SelectItem value="pass_utms" className="text-xs">Repassar UTMs</SelectItem>
              <SelectItem value="pass_variables" className="text-xs">Repassar variáveis</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
        {(block.linkMode === 'custom' || !block.linkMode) && (
          <FieldRow label="URL">
            <VariableInput value={block.href} onChange={val => onChange({ ...block, href: val })} placeholder="https://..."
              variables={variables as any} trackedParams={trackedParams as any} allInputElements={allInputElements as any} />
          </FieldRow>
        )}
        {block.linkMode === 'variable' && (
          <FieldRow label="Variável">
            <Select value={block.href} onValueChange={v => onChange({ ...block, href: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
              <SelectContent>
                {(variables || []).map(v => (
                  <SelectItem key={v.id} value={`{{${v.name}}}`} className="text-xs">{v.name}</SelectItem>
                ))}
                {(allInputElements || []).flatMap(g => g.elements.map(el => (
                  <SelectItem key={el.elementId} value={`{{${el.elementId}}}`} className="text-xs">{g.pageTitle} › {el.elementLabel}</SelectItem>
                )))}
              </SelectContent>
            </Select>
          </FieldRow>
        )}
        {(block.linkMode === 'pass_all_params' || block.linkMode === 'pass_utms' || block.linkMode === 'pass_variables') && (
          <FieldRow label="URL base">
            <Input value={block.href} onChange={e => onChange({ ...block, href: e.target.value })} placeholder="https://destino.com" className="h-8 text-xs" />
          </FieldRow>
        )}
      </SettingsSection>
      <SettingsSection title="Aparência">
        <InlineRow>
          <ColorPickerField label="Fundo" value={block.bgColor} onChange={c => onChange({ ...block, bgColor: c || '#4F46E5' })} allowTransparent={false} />
          <ColorPickerField label="Texto" value={block.textColor} onChange={c => onChange({ ...block, textColor: c || '#FFFFFF' })} allowTransparent={false} />
        </InlineRow>
        <div className="grid grid-cols-3 gap-1.5">
          <FieldRow label="Borda">
            <Input type="number" value={block.borderRadius} onChange={e => onChange({ ...block, borderRadius: Number(e.target.value) })} className="h-8 text-xs text-center px-1" />
          </FieldRow>
          <FieldRow label="Pad. H">
            <Input type="number" value={block.paddingX} onChange={e => onChange({ ...block, paddingX: Number(e.target.value) })} className="h-8 text-xs text-center px-1" />
          </FieldRow>
          <FieldRow label="Pad. V">
            <Input type="number" value={block.paddingY} onChange={e => onChange({ ...block, paddingY: Number(e.target.value) })} className="h-8 text-xs text-center px-1" />
          </FieldRow>
        </div>
        <FieldRow label="Alinhamento">
          <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
        </FieldRow>
      </SettingsSection>
      <SettingsSection title="Espaçamento" defaultOpen={false}>
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
    </div>
  );
}

function DividerSettings({ block, onChange }: { block: DividerBlock; onChange: (b: DividerBlock) => void }) {
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Aparência">
        <InlineRow>
          <ColorPickerField label="Cor" value={block.color} onChange={c => onChange({ ...block, color: c || '#E5E7EB' })} allowTransparent={false} />
          <FieldRow label="Espessura">
            <Input type="number" value={block.thickness} onChange={e => onChange({ ...block, thickness: Number(e.target.value) })} className="h-8 text-xs" />
          </FieldRow>
        </InlineRow>
      </SettingsSection>
      <SettingsSection title="Espaçamento" defaultOpen={false}>
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
    </div>
  );
}

function SpacerSettings({ block, onChange }: { block: SpacerBlock; onChange: (b: SpacerBlock) => void }) {
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Configuração">
        <FieldRow label="Altura (px)">
          <Input type="number" value={block.height} onChange={e => onChange({ ...block, height: Number(e.target.value) })} className="h-8 text-xs w-24" />
        </FieldRow>
      </SettingsSection>
    </div>
  );
}

function StructureSettings({ block, onChange }: { block: ColumnsBlock; onChange: (b: ColumnsBlock) => void }) {
  const setColCount = (n: number) => {
    const current = block.columns;
    if (n > current.length) {
      onChange({ ...block, columns: [...current, ...Array(n - current.length).fill(null).map(() => [] as EmailBlock[])] });
    } else if (n < current.length) {
      const kept = current.slice(0, n);
      const overflow = current.slice(n).flat();
      kept[kept.length - 1] = [...kept[kept.length - 1], ...overflow];
      onChange({ ...block, columns: kept });
    }
  };
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Colunas">
        <div className="inline-flex gap-px bg-muted/60 rounded-lg p-0.5">
          {[1, 2, 3, 4].map(n => (
            <button key={n} onClick={() => setColCount(n)}
              className={cn('w-9 h-8 rounded-md text-xs font-medium transition-all',
                block.columns.length === n ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}>{n}</button>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="Espaçamento">
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
    </div>
  );
}

function BlockSettingsDispatch({ block, onChange, variables, trackedParams, allInputElements }: {
  block: EmailBlock; onChange: (b: EmailBlock) => void;
  variables?: Props['variables']; trackedParams?: Props['trackedParams']; allInputElements?: Props['allInputElements'];
}) {
  switch (block.type) {
    case 'text': return <TextSettings block={block} onChange={onChange} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />;
    case 'image': return <ImageSettings block={block} onChange={onChange} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />;
    case 'button': return <ButtonSettings block={block} onChange={onChange} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />;
    case 'divider': return <DividerSettings block={block} onChange={onChange} />;
    case 'spacer': return <SpacerSettings block={block} onChange={onChange} />;
    case 'columns': return <StructureSettings block={block} onChange={onChange as any} />;
  }
}

// ─── Element preview ────────────────────────────────────────────────
function ElementPreview({ block, elementLookup, onUpdateBlock, onSelect, variables, trackedParams, allInputElements }: {
  block: EmailBlock; elementLookup?: Record<string, string>; onUpdateBlock?: (b: EmailBlock) => void;
  onSelect?: () => void;
  variables?: Props['variables']; trackedParams?: Props['trackedParams']; allInputElements?: Props['allInputElements'];
}) {
  const pad = block.padding;
  const ps = { paddingTop: pad.top, paddingRight: pad.right, paddingBottom: pad.bottom, paddingLeft: pad.left };
  switch (block.type) {
    case 'text':
      return (
        <div style={{ ...ps, textAlign: block.align, fontSize: block.fontSize, fontWeight: block.fontWeight, color: block.color, lineHeight: 1.5, fontFamily: 'Arial, Helvetica, sans-serif' }}
          onClick={e => e.stopPropagation()} onFocus={() => onSelect?.()}>
          <VariableInput
            as="textarea"
            value={block.content}
            onChange={val => onUpdateBlock?.({ ...block, content: val } as EmailBlock)}
            variables={variables as any}
            trackedParams={trackedParams as any}
            allInputElements={allInputElements as any}
            placeholder="Digite seu texto..."
            rows={1}
            hidePickerButton
            className="!border-none !ring-0 !shadow-none !bg-transparent !p-0 !min-h-0 !rounded-none !text-inherit !font-inherit !leading-inherit"
          />
        </div>
      );
    case 'image': {
      const isVariable = block.src && /\{\{.*?\}\}/.test(block.src);
      const hasRealSrc = block.src && !isVariable;
      return (
        <div style={{ ...ps, textAlign: block.align }}>
          {hasRealSrc ? (
            <img src={block.src} alt={block.alt} style={{ maxWidth: '100%', width: block.width, height: 'auto', display: 'inline-block' }} />
          ) : (
            <div className="flex items-center justify-center h-24 bg-muted/20 rounded-lg border border-dashed border-border/50" style={{ width: block.width || '100%', margin: block.align === 'center' ? '0 auto' : block.align === 'right' ? '0 0 0 auto' : undefined }}>
              <div className="text-center">
                <Image className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1.5" />
                <span className="text-muted-foreground/50 text-[10px]">
                  {isVariable ? '📎 Imagem dinâmica' : 'Clique para configurar'}
                </span>
                {isVariable && (
                  <span className="block text-[9px] text-primary/50 mt-0.5 font-mono truncate max-w-[160px] mx-auto">
                    {block.src!.replace(/\{\{field:([^}]+)\}\}/g, (_, id) => {
                      const label = elementLookup?.[id];
                      return label ? `{{${label}}}` : `{{campo}}`;
                    })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }
    case 'button':
      return (
        <div style={{ ...ps, textAlign: block.align }}>
          <span style={{
            display: 'inline-block', backgroundColor: block.bgColor, color: block.textColor,
            fontSize: block.fontSize, fontWeight: 'bold', padding: `${block.paddingY}px ${block.paddingX}px`,
            borderRadius: block.borderRadius, fontFamily: 'Arial, Helvetica, sans-serif', textDecoration: 'none',
          }}>{block.text}</span>
        </div>
      );
    case 'divider':
      return <div style={ps}><hr style={{ border: 'none', borderTop: `${block.thickness}px solid ${block.color}`, width: block.width, margin: '0 auto' }} /></div>;
    case 'spacer':
      return (
        <div style={{ height: block.height }} className="relative group/spacer">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center opacity-0 group-hover/spacer:opacity-100 transition-opacity">
            <span className="text-[9px] text-muted-foreground/40 bg-background/80 px-2 rounded">{block.height}px</span>
          </div>
        </div>
      );
    default: return null;
  }
}

// ─── Column zone ────────────────────────────────────────────────────
function ColumnZone({
  elements, colIdx, structureId, selectedId,
  onSelectElement, onDropElement, onRemoveElement, onMoveElement, onMoveToColumn, totalCols, elementLookup, onUpdateElement,
  variables, trackedParams, allInputElements,
}: {
  elements: EmailBlock[]; colIdx: number; structureId: string; selectedId: string | null;
  onSelectElement: (id: string) => void;
  onDropElement: (structureId: string, colIdx: number, type: ElementType, insertIdx?: number) => void;
  onRemoveElement: (structureId: string, colIdx: number, elementId: string) => void;
  onMoveElement: (structureId: string, colIdx: number, elementId: string, dir: -1 | 1) => void;
  onMoveToColumn: (structureId: string, fromCol: number, toCol: number, elementId: string) => void;
  totalCols: number;
  elementLookup?: ElementLookup;
  onUpdateElement?: (b: EmailBlock) => void;
  variables?: Props['variables']; trackedParams?: Props['trackedParams']; allInputElements?: Props['allInputElements'];
}) {
  const [dragOver, setDragOver] = useState(false);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    const type = e.dataTransfer.types.includes('application/email-element-type');
    const move = e.dataTransfer.types.includes('application/email-element-move');
    if (!type && !move) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = move ? 'move' : 'copy';
    setDragOver(true);
    const children = Array.from((e.currentTarget as HTMLElement).querySelectorAll('[data-el-idx]'));
    let idx = elements.length;
    for (const child of children) {
      const cr = child.getBoundingClientRect();
      if (e.clientY < cr.top + cr.height / 2) { idx = parseInt(child.getAttribute('data-el-idx') || '0'); break; }
    }
    setDropIdx(idx);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false); setDropIdx(null);
    const newType = e.dataTransfer.getData('application/email-element-type') as ElementType;
    if (newType) { onDropElement(structureId, colIdx, newType, dropIdx ?? undefined); return; }
    const moveData = e.dataTransfer.getData('application/email-element-move');
    if (moveData) {
      try {
        const { structureId: sid, colIdx: sc, elementId } = JSON.parse(moveData);
        if (sid === structureId && sc === colIdx) return;
        onMoveToColumn(sid, sc, colIdx, elementId);
      } catch {}
    }
  };

  return (
    <div
      className={cn('min-h-[40px] transition-colors relative',
        dragOver ? 'bg-primary/5 rounded-md' : '',
      )}
      onDragOver={handleDragOver}
      onDragLeave={() => { setDragOver(false); setDropIdx(null); }}
      onDrop={handleDrop}
    >
      {elements.length === 0 && !dragOver && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full py-6 text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors flex items-center justify-center gap-1.5 text-[10px]">
              <Plus className="h-3.5 w-3.5" />
              <span>Adicionar elemento</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-36">
            {ELEMENT_TYPES.map(et => (
              <DropdownMenuItem key={et.type} className="text-xs gap-2" onClick={() => onDropElement(structureId, colIdx, et.type)}>
                <et.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {et.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {elements.map((el, elIdx) => (
        <div key={el.id} data-el-idx={elIdx}>
          {dragOver && dropIdx === elIdx && <div className="h-0.5 bg-primary rounded-full mx-2 my-0.5" />}
          <div
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('application/email-element-move', JSON.stringify({ structureId, colIdx, elementId: el.id }));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={e => { e.stopPropagation(); onSelectElement(el.id); }}
            className={cn(
              'relative group/el cursor-pointer transition-all rounded-md',
              selectedId === el.id
                ? 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
                : 'hover:ring-1 hover:ring-primary/15 hover:ring-offset-1 hover:ring-offset-background'
            )}
          >
            <ElementPreview block={el} elementLookup={elementLookup} onUpdateBlock={onUpdateElement} onSelect={() => onSelectElement(el.id)} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />

            {/* Floating mini toolbar */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 opacity-0 group-hover/el:opacity-100 transition-all
              bg-foreground text-background rounded-full px-1 py-0.5 shadow-lg z-20 scale-90 group-hover/el:scale-100">
              {elIdx > 0 && (
                <button onClick={e => { e.stopPropagation(); onMoveElement(structureId, colIdx, el.id, -1); }} className="p-0.5 rounded-full hover:bg-background/20">
                  <ChevronUp className="h-3 w-3" />
                </button>
              )}
              {elIdx < elements.length - 1 && (
                <button onClick={e => { e.stopPropagation(); onMoveElement(structureId, colIdx, el.id, 1); }} className="p-0.5 rounded-full hover:bg-background/20">
                  <ChevronDown className="h-3 w-3" />
                </button>
              )}
              {colIdx > 0 && (
                <button onClick={e => { e.stopPropagation(); onMoveToColumn(structureId, colIdx, colIdx - 1, el.id); }} className="p-0.5 rounded-full hover:bg-background/20">
                  <ArrowLeft className="h-3 w-3" />
                </button>
              )}
              {colIdx < totalCols - 1 && (
                <button onClick={e => { e.stopPropagation(); onMoveToColumn(structureId, colIdx, colIdx + 1, el.id); }} className="p-0.5 rounded-full hover:bg-background/20">
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
              <div className="w-px h-3 bg-background/20 mx-0.5" />
              <button onClick={e => { e.stopPropagation(); onRemoveElement(structureId, colIdx, el.id); }} className="p-0.5 rounded-full hover:bg-destructive/80">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {dragOver && dropIdx === elements.length && <div className="h-0.5 bg-primary rounded-full mx-2 my-0.5" />}

      {/* Subtle add button at bottom */}
      {elements.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full py-1.5 text-muted-foreground/25 hover:text-muted-foreground/50 transition-colors flex items-center justify-center gap-1 text-[9px]">
              <Plus className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-36">
            {ELEMENT_TYPES.map(et => (
              <DropdownMenuItem key={et.type} className="text-xs gap-2" onClick={() => onDropElement(structureId, colIdx, et.type)}>
                <et.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {et.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ─── Structure row ──────────────────────────────────────────────────
function StructureRow({
  structure, isSelected, selectedElementId,
  onSelect, onRemove, onMoveRow, rowIndex, totalRows,
  onSelectElement, onDropElement, onRemoveElement, onMoveElement, onMoveToColumn, elementLookup, onUpdateElement,
  variables, trackedParams, allInputElements,
}: {
  structure: ColumnsBlock; isSelected: boolean; selectedElementId: string | null;
  onSelect: () => void; onRemove: () => void; onMoveRow: (dir: -1 | 1) => void;
  rowIndex: number; totalRows: number;
  onSelectElement: (id: string) => void;
  onDropElement: (structureId: string, colIdx: number, type: ElementType, insertIdx?: number) => void;
  onRemoveElement: (structureId: string, colIdx: number, elementId: string) => void;
  onMoveElement: (structureId: string, colIdx: number, elementId: string, dir: -1 | 1) => void;
  onMoveToColumn: (structureId: string, fromCol: number, toCol: number, elementId: string) => void;
  elementLookup?: ElementLookup;
  onUpdateElement?: (b: EmailBlock) => void;
  variables?: Props['variables']; trackedParams?: Props['trackedParams']; allInputElements?: Props['allInputElements'];
}) {
  const pad = structure.padding;
  const ps = { paddingTop: pad.top, paddingRight: pad.right, paddingBottom: pad.bottom, paddingLeft: pad.left };

  return (
    <div
      onClick={e => { e.stopPropagation(); onSelect(); }}
      className={cn(
        'relative group/row transition-all rounded-md border border-dashed',
        isSelected ? 'border-primary/40 ring-2 ring-primary/20 ring-offset-2 ring-offset-background' : 'border-border/40 hover:border-border/70 hover:ring-1 hover:ring-border/50',
      )}
    >
      {/* Floating row controls — appears on the left edge */}
      <div className="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover/row:opacity-100 transition-all z-10">
        {rowIndex > 0 && (
          <button onClick={e => { e.stopPropagation(); onMoveRow(-1); }}
            className="p-1 rounded-full bg-foreground text-background shadow-md hover:scale-110 transition-transform">
            <ChevronUp className="h-3 w-3" />
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded-full bg-destructive text-destructive-foreground shadow-md hover:scale-110 transition-transform">
          <Trash2 className="h-3 w-3" />
        </button>
        {rowIndex < totalRows - 1 && (
          <button onClick={e => { e.stopPropagation(); onMoveRow(1); }}
            className="p-1 rounded-full bg-foreground text-background shadow-md hover:scale-110 transition-transform">
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>

      <div style={ps}>
        <div className="flex" style={{ gap: 0 }}>
          {structure.columns.map((col, ci) => (
            <div key={ci} className="flex-1 min-w-0" style={{ borderRight: ci < structure.columns.length - 1 ? '1px dashed var(--border)' : 'none' }}>
              <ColumnZone
                elements={col} colIdx={ci} structureId={structure.id}
                selectedId={selectedElementId} onSelectElement={onSelectElement}
                onDropElement={onDropElement} onRemoveElement={onRemoveElement}
                onMoveElement={onMoveElement} onMoveToColumn={onMoveToColumn}
                totalCols={structure.columns.length}
                elementLookup={elementLookup}
                onUpdateElement={onUpdateElement}
                variables={variables} trackedParams={trackedParams} allInputElements={allInputElements}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Floating "Add" button between rows ─────────────────────────────
function AddRowButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center justify-center py-1 group/add">
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium
          text-muted-foreground/0 group-hover/add:text-muted-foreground
          bg-transparent group-hover/add:bg-muted/60
          border border-transparent group-hover/add:border-border/40
          transition-all duration-200 hover:!text-primary hover:!border-primary/30 hover:!bg-primary/5"
      >
        <Plus className="h-3 w-3" />
        <span>Adicionar seção</span>
      </button>
    </div>
  );
}

// ─── Template picker ────────────────────────────────────────────────
function TemplatePicker({ onSelect, onBlank }: { onSelect: (t: EmailTemplate) => void; onBlank: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-5">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Como quer começar?</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Escolha um modelo pronto para personalizar ou comece com uma página em branco
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <button onClick={onBlank}
            className="group flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-border/60
              hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 text-center">
            <div className="h-12 w-12 rounded-2xl bg-muted/80 flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
              <FileText className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <span className="text-sm font-semibold block text-foreground">Em branco</span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">Começar do zero</span>
            </div>
          </button>

          {EMAIL_TEMPLATES.map(tpl => (
            <button key={tpl.id} onClick={() => onSelect(tpl)}
              className="group flex flex-col items-center gap-3 p-8 rounded-2xl border border-border/60
                hover:border-primary/40 hover:bg-primary/5 hover:shadow-lg transition-all duration-200 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted/80 flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
                <tpl.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <span className="text-sm font-semibold block text-foreground">{tpl.label}</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block leading-tight">{tpl.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Floating bottom toolbar ────────────────────────────────────────
function FloatingToolbar({ onAddStructure }: {
  onAddStructure: (cols: number, elementType?: ElementType | number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="sticky bottom-4 left-1/2 -translate-x-1/2 z-30 w-fit mx-auto">
      {!expanded ? (
        <button onClick={() => setExpanded(true)}
          className="rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95"
          style={{ background: '#0C0E17', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Plus className="h-4 w-4" />
          <span className="text-xs font-semibold tracking-wide">Adicionar</span>
        </button>
      ) : (
        <div className="rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: '#0C0E17', border: '1px solid rgba(255,255,255,0.08)', width: 420 }}>
          
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Adicionar seção
            </span>
            <button onClick={() => setExpanded(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Sections grid */}
          <div className="px-5 pb-3">
            <div className="grid grid-cols-4 gap-2">
              {STRUCTURE_PRESETS.map(sp => (
                <button key={sp.cols} onClick={() => { onAddStructure(sp.cols); setExpanded(false); }}
                  className="flex flex-col items-center gap-2 py-3 rounded-xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}>
                  <sp.icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{sp.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-5" style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {/* Elements grid */}
          <div className="px-5 pt-3 pb-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Seção com elemento
            </span>
            <div className="grid grid-cols-5 gap-2">
              {ELEMENT_TYPES.map(et => (
                <button key={et.type}
                  onClick={() => { onAddStructure(1, et.type); setExpanded(false); }}
                  className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}>
                  <et.icon className="h-4 w-4" />
                  <span className="text-[9px] font-medium leading-tight text-center">{et.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
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
  const hasExistingContent = useMemo(() => !!extractBlocksFromHtml(value), [value]);
  const [step, setStep] = useState<'template' | 'editor'>(() => hasExistingContent ? 'editor' : 'template');

  const [blocks, setBlocks] = useState<ColumnsBlock[]>(() => {
    const restored = extractBlocksFromHtml(value);
    if (restored) {
      return restored.blocks.map(b => {
        if (b.type === 'columns') return b as ColumnsBlock;
        const s = createStructure(1); s.columns[0] = [b]; return s;
      });
    }
    const s = createStructure(1); s.columns[0] = [createElement('text')]; return [s];
  });

  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'editor' | 'preview' | 'code'>('editor');
  const [emailBg, setEmailBg] = useState(() => extractBlocksFromHtml(value)?.emailBg || '#F9FAFB');
  const [contentBg, setContentBg] = useState(() => extractBlocksFromHtml(value)?.contentBg || '#FFFFFF');
  const [contentPadding, setContentPadding] = useState<BlockPadding>(() => extractBlocksFromHtml(value)?.contentPadding || { top: 24, right: 0, bottom: 24, left: 0 });
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Build elementLookup for friendly variable labels
  const elementLookup = useMemo<ElementLookup>(() => {
    const map: ElementLookup = {};
    if (allInputElements) {
      for (const page of allInputElements) {
        for (const el of page.elements) {
          map[el.elementId] = el.elementLabel;
        }
      }
    }
    return map;
  }, [allInputElements]);

  // Track initial value to detect unsaved changes
  const initialValueRef = useRef(value);
  useEffect(() => { if (open) initialValueRef.current = value; }, [open]);

  const handleAttemptClose = useCallback(() => {
    const currentFull = embedBlocksInHtml(blocksToHtml(blocks as EmailBlock[], emailBg, contentBg, 600, contentPadding), blocks as EmailBlock[], emailBg, contentBg, contentPadding);
    if (currentFull !== initialValueRef.current) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [blocks, emailBg, contentBg, contentPadding, onClose]);

  const handleDiscard = useCallback(() => {
    setShowUnsavedDialog(false);
    onClose();
  }, [onClose]);

  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null;
    for (const s of blocks) for (const col of s.columns) { const f = col.find(e => e.id === selectedElementId); if (f) return f; }
    return null;
  }, [blocks, selectedElementId]);

  const selectedStructure = useMemo(() => blocks.find(s => s.id === selectedStructureId) || null, [blocks, selectedStructureId]);
  const settingsTarget = selectedElement || selectedStructure;

  const html = useMemo(() => blocksToHtml(blocks as EmailBlock[], emailBg, contentBg, 600, contentPadding), [blocks, emailBg, contentBg, contentPadding]);

  // ── Operations ──
  const addStructure = useCallback((colCount: number, indexOrElementType?: number | ElementType) => {
    const s = createStructure(colCount);
    const index = typeof indexOrElementType === 'number' ? indexOrElementType : undefined;
    const elementType = typeof indexOrElementType === 'string' ? indexOrElementType as ElementType : undefined;
    if (elementType) {
      s.columns[0] = [createElement(elementType)];
    }
    setBlocks(prev => { const arr = [...prev]; arr.splice(index ?? arr.length, 0, s); return arr; });
    setSelectedStructureId(s.id); setSelectedElementId(null);
  }, []);

  const removeStructure = useCallback((id: string) => {
    setBlocks(prev => prev.filter(s => s.id !== id));
    if (selectedStructureId === id) setSelectedStructureId(null);
    setSelectedElementId(null);
  }, [selectedStructureId]);

  const moveRow = useCallback((id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(s => s.id === id); if (idx < 0) return prev;
      const ni = idx + dir; if (ni < 0 || ni >= prev.length) return prev;
      const arr = [...prev]; [arr[idx], arr[ni]] = [arr[ni], arr[idx]]; return arr;
    });
  }, []);

  const updateStructure = useCallback((u: ColumnsBlock) => {
    setBlocks(prev => prev.map(s => s.id === u.id ? u : s));
  }, []);

  const dropElement = useCallback((structureId: string, colIdx: number, type: ElementType, insertIdx?: number) => {
    const el = createElement(type);
    setBlocks(prev => prev.map(s => {
      if (s.id !== structureId) return s;
      return { ...s, columns: s.columns.map((col, ci) => {
        if (ci !== colIdx) return col;
        const arr = [...col]; arr.splice(insertIdx ?? arr.length, 0, el); return arr;
      })};
    }));
    setSelectedElementId(el.id); setSelectedStructureId(null);
  }, []);

  const removeElement = useCallback((structureId: string, colIdx: number, elementId: string) => {
    setBlocks(prev => prev.map(s => {
      if (s.id !== structureId) return s;
      return { ...s, columns: s.columns.map((col, ci) => ci === colIdx ? col.filter(e => e.id !== elementId) : col) };
    }));
    if (selectedElementId === elementId) setSelectedElementId(null);
  }, [selectedElementId]);

  const moveElement = useCallback((structureId: string, colIdx: number, elementId: string, dir: -1 | 1) => {
    setBlocks(prev => prev.map(s => {
      if (s.id !== structureId) return s;
      return { ...s, columns: s.columns.map((col, ci) => {
        if (ci !== colIdx) return col;
        const idx = col.findIndex(e => e.id === elementId); if (idx < 0) return col;
        const ni = idx + dir; if (ni < 0 || ni >= col.length) return col;
        const arr = [...col]; [arr[idx], arr[ni]] = [arr[ni], arr[idx]]; return arr;
      })};
    }));
  }, []);

  const moveToColumn = useCallback((structureId: string, fromCol: number, toCol: number, elementId: string) => {
    setBlocks(prev => prev.map(s => {
      if (s.id !== structureId) return s;
      const el = s.columns[fromCol]?.find(e => e.id === elementId); if (!el) return s;
      return { ...s, columns: s.columns.map((col, ci) => {
        if (ci === fromCol) return col.filter(e => e.id !== elementId);
        if (ci === toCol) return [...col, el];
        return col;
      })};
    }));
  }, []);

  const updateElement = useCallback((u: EmailBlock) => {
    setBlocks(prev => prev.map(s => ({ ...s, columns: s.columns.map(col => col.map(e => e.id === u.id ? u : e)) })));
  }, []);

  const applyTemplate = useCallback((tpl: EmailTemplate) => {
    const cloned = JSON.parse(JSON.stringify(tpl.blocks)) as ColumnsBlock[];
    const reassign = (b: EmailBlock): EmailBlock => {
      const nb = { ...b, id: uid() };
      if (nb.type === 'columns') (nb as ColumnsBlock).columns = (nb as ColumnsBlock).columns.map(col => col.map(reassign));
      return nb;
    };
    setBlocks(cloned.map(s => reassign(s) as ColumnsBlock));
    setEmailBg(tpl.emailBg); setContentBg(tpl.contentBg); setContentPadding({ top: 24, right: 0, bottom: 24, left: 0 });
    setSelectedStructureId(null); setSelectedElementId(null); setStep('editor');
    toast.success(`Template "${tpl.label}" aplicado`);
  }, []);

  const handleBlankStart = useCallback(() => {
    const s = createStructure(1); s.columns[0] = [createElement('text')];
    setBlocks([s]); setEmailBg('#F9FAFB'); setContentBg('#FFFFFF'); setContentPadding({ top: 24, right: 0, bottom: 24, left: 0 }); setStep('editor');
  }, []);

  const handleSave = useCallback(() => {
    onChange(embedBlocksInHtml(html, blocks as EmailBlock[], emailBg, contentBg, contentPadding));
    initialValueRef.current = embedBlocksInHtml(html, blocks as EmailBlock[], emailBg, contentBg, contentPadding);
    onClose();
  }, [html, blocks, emailBg, contentBg, contentPadding, onChange, onClose]);

  // Close settings when clicking canvas
  const clearSelection = useCallback(() => {
    setSelectedStructureId(null); setSelectedElementId(null); setShowStylePanel(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleAttemptClose(); }}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden [&>button.absolute]:hidden">
        {/* ─── Top bar ─── */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border/50 flex-shrink-0 bg-background">
          <div className="flex items-center gap-3 min-w-0">
            {step === 'editor' && !hasExistingContent && (
              <button onClick={() => setStep('template')}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mr-1">
                <LayoutTemplate className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Templates</span>
              </button>
            )}
            <span className="text-sm font-semibold text-foreground">
              {step === 'template' ? 'Escolher modelo' : 'Editor de E-mail'}
            </span>

            {step === 'editor' && (
              <>
                <div className="h-4 w-px bg-border/50 mx-1" />
                <div className="inline-flex bg-muted/50 rounded-lg p-0.5">
                  {([['editor', 'Editar', null], ['preview', 'Preview', Eye], ['code', 'HTML', Code2]] as const).map(([mode, label, Icon]) => (
                    <button key={mode} onClick={() => setPreviewMode(mode)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all',
                        previewMode === mode ? 'bg-background shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                      )}>
                      {Icon && <Icon className="h-3 w-3" />}
                      {label}
                    </button>
                  ))}
                </div>
                <div className="h-4 w-px bg-border/50 mx-1" />
                <button onClick={() => setShowStylePanel(p => !p)}
                  className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-all',
                    showStylePanel ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}>
                  <Palette className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Estilo</span>
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleAttemptClose} className="text-xs h-8 text-muted-foreground">Cancelar</Button>
            {step === 'editor' && (
              <Button size="sm" onClick={handleSave} className="text-xs h-8 px-5">Salvar</Button>
            )}
          </div>
        </div>

        {/* ─── Template step ─── */}
        {step === 'template' && <TemplatePicker onSelect={applyTemplate} onBlank={handleBlankStart} />}

        {/* ─── Editor step ─── */}
        {step === 'editor' && (
          <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
            {previewMode === 'editor' && (
              <>
                {/* Canvas */}
                <div className="flex-1 overflow-y-auto min-w-0 relative" style={{ backgroundColor: emailBg }}
                  onClick={clearSelection}>
                  <div className="w-full max-w-[600px] mx-auto my-8 rounded-xl shadow-sm relative box-border"
                    style={{ backgroundColor: contentBg, padding: `${contentPadding.top}px ${contentPadding.right}px ${contentPadding.bottom}px ${contentPadding.left}px` }}>
                    
                    {blocks.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                          <Plus className="h-8 w-8 opacity-30" />
                        </div>
                        <p className="text-sm font-medium mb-1">Comece seu e-mail</p>
                        <p className="text-xs text-muted-foreground/60">Clique em "Adicionar" abaixo ou arraste um elemento</p>
                      </div>
                    )}

                    {blocks.map((structure, rowIdx) => (
                      <div key={structure.id}>
                        {rowIdx > 0 && (
                          <AddRowButton onClick={() => addStructure(1, rowIdx)} />
                        )}
                        <StructureRow
                          structure={structure}
                          isSelected={selectedStructureId === structure.id && !selectedElementId}
                          selectedElementId={selectedElementId}
                          onSelect={() => { setSelectedStructureId(structure.id); setSelectedElementId(null); }}
                          onRemove={() => removeStructure(structure.id)}
                          onMoveRow={dir => moveRow(structure.id, dir)}
                          rowIndex={rowIdx} totalRows={blocks.length}
                          onSelectElement={id => { setSelectedElementId(id); setSelectedStructureId(null); }}
                          onDropElement={dropElement} onRemoveElement={removeElement}
                          onMoveElement={moveElement} onMoveToColumn={moveToColumn}
                          elementLookup={elementLookup}
                          onUpdateElement={updateElement}
                          variables={variables} trackedParams={trackedParams} allInputElements={allInputElements}
                        />
                      </div>
                    ))}

                    {blocks.length > 0 && <AddRowButton onClick={() => addStructure(1)} />}
                  </div>

                  {/* Floating bottom toolbar */}
                  <FloatingToolbar onAddStructure={addStructure} />
                </div>

                {/* Style panel (colors) — slides in */}
                {showStylePanel && (
                  <div className="w-56 border-l border-border/50 flex-shrink-0 overflow-y-auto bg-background p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Estilo do e-mail</span>
                      <button onClick={() => setShowStylePanel(false)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <ColorPickerField label="Fundo externo" value={emailBg} onChange={c => setEmailBg(c || '#F9FAFB')} allowTransparent={false} />
                    <ColorPickerField label="Fundo do conteúdo" value={contentBg} onChange={c => setContentBg(c || '#FFFFFF')} allowTransparent={false} />
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Espaçamento do bloco</span>
                      <PaddingEditor padding={contentPadding} onChange={setContentPadding} />
                    </div>
                  </div>
                )}

                {/* Settings panel — appears when element selected */}
                {settingsTarget && (
                  <div className="w-72 border-l border-border/50 flex-shrink-0 overflow-y-auto overflow-x-hidden min-w-0 bg-background">
                    {/* Panel header */}
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 sticky top-0 bg-background z-10">
                      {(() => {
                        const Icon = BLOCK_ICONS[settingsTarget.type] || Type;
                        return (
                          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                          </div>
                        );
                      })()}
                      <span className="text-xs font-semibold truncate flex-1">{BLOCK_LABELS[settingsTarget.type]}</span>
                      <button onClick={clearSelection}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="px-4 pb-4">
                      <BlockSettingsDispatch
                        block={settingsTarget}
                        onChange={b => { if (b.type === 'columns') updateStructure(b as ColumnsBlock); else updateElement(b); }}
                        variables={variables} trackedParams={trackedParams} allInputElements={allInputElements}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {previewMode === 'preview' && (
              <div className="flex-1 overflow-y-auto p-6 min-w-0" style={{ backgroundColor: '#f0f0f0' }}>
                <div className="max-w-[650px] mx-auto rounded-xl shadow-xl overflow-hidden border border-border/30">
                  <iframe srcDoc={html} className="w-full border-0" style={{ height: '600px' }} title="Email Preview" sandbox="allow-same-origin" />
                </div>
              </div>
            )}

            {previewMode === 'code' && (
              <div className="flex-1 overflow-y-auto p-4 min-w-0">
                <textarea value={html} readOnly
                  className="w-full h-full rounded-xl border border-input bg-muted/20 px-4 py-3 text-xs font-mono resize-none focus-visible:outline-none" />
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Unsaved changes confirmation */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent className="max-w-sm">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Alterações não salvas</h3>
              <p className="text-xs text-muted-foreground mt-1">Você tem alterações que não foram salvas. O que deseja fazer?</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="text-xs" onClick={handleDiscard}>Descartar</Button>
              <Button size="sm" className="text-xs" onClick={() => { setShowUnsavedDialog(false); handleSave(); }}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
