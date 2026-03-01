import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Trash2, GripVertical, ChevronUp, ChevronDown, Plus, X,
  AlignLeft, AlignCenter, AlignRight, ArrowLeft, ArrowRight,
  LayoutTemplate, PanelLeft, Settings2, ChevronRight,
  Type, Image, MousePointerClick, Minus, Space, Columns,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ColorPickerField, ImageSourcePicker } from '@/components/editor/shared';
import VariableInput from '@/components/editor/shared/VariableInput';
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

// ─── Shared micro-components ────────────────────────────────────────

const BLOCK_ICONS: Record<string, React.ElementType> = {
  text: Type, image: Image, button: MousePointerClick,
  divider: Minus, spacer: Space, columns: Columns,
};

function SettingsSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {title}
        <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
      </button>
      {open && <div className="pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="text-[10px] font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function InlineRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function PaddingEditor({ padding, onChange }: { padding: BlockPadding; onChange: (p: BlockPadding) => void }) {
  const sides = [
    { key: 'top' as const, icon: '↑' },
    { key: 'right' as const, icon: '→' },
    { key: 'bottom' as const, icon: '↓' },
    { key: 'left' as const, icon: '←' },
  ];
  return (
    <div className="grid grid-cols-4 gap-1">
      {sides.map(({ key, icon }) => (
        <div key={key} className="min-w-0">
          <span className="text-[8px] text-muted-foreground text-center block mb-0.5">{icon}</span>
          <Input
            type="number"
            value={padding[key]}
            onChange={e => onChange({ ...padding, [key]: Math.max(0, Number(e.target.value)) })}
            className="h-7 text-[10px] text-center px-1"
            min={0} max={100}
          />
        </div>
      ))}
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: 'left' | 'center' | 'right') => void }) {
  return (
    <div className="flex gap-0.5 bg-muted/50 rounded-md p-0.5">
      {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([v, Icon]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'flex-1 flex items-center justify-center py-1.5 rounded text-xs transition-all',
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
  block: TextBlock;
  onChange: (b: TextBlock) => void;
  variables?: Props['variables'];
  trackedParams?: Props['trackedParams'];
  allInputElements?: Props['allInputElements'];
}) {
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Conteúdo">
        <VariableInput
          as="textarea"
          value={block.content}
          onChange={val => onChange({ ...block, content: val })}
          placeholder="Seu texto aqui..."
          rows={3}
          variables={variables as any}
          trackedParams={trackedParams as any}
          allInputElements={allInputElements as any}
        />
      </SettingsSection>

      <SettingsSection title="Tipografia">
        <InlineRow>
          <FieldRow label="Tamanho">
            <Input type="number" value={block.fontSize} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })} className="h-7 text-xs" />
          </FieldRow>
          <FieldRow label="Peso">
            <Select value={block.fontWeight} onValueChange={v => onChange({ ...block, fontWeight: v as any })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </InlineRow>
        <ColorPickerField label="Cor" value={block.color} onChange={c => onChange({ ...block, color: c || '#000000' })} allowTransparent={false} />
      </SettingsSection>

      <SettingsSection title="Alinhamento">
        <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
      </SettingsSection>

      <SettingsSection title="Espaçamento" defaultOpen={false}>
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
    </div>
  );
}

function ImageSettings({ block, onChange, variables, trackedParams, allInputElements }: {
  block: ImageBlock;
  onChange: (b: ImageBlock) => void;
  variables?: Props['variables'];
  trackedParams?: Props['trackedParams'];
  allInputElements?: Props['allInputElements'];
}) {
  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Imagem">
        <ImageSourcePicker value={block.src} onChange={url => onChange({ ...block, src: url })} accept="image/*" alt={block.alt} showPreview={!!block.src && !block.src.includes('{{')} hideSaveToGallery />
        <FieldRow label="URL (variável)">
          <VariableInput
            value={block.src}
            onChange={val => onChange({ ...block, src: val })}
            placeholder="https://... ou {{variavel}}"
            variables={variables as any}
            trackedParams={trackedParams as any}
            allInputElements={allInputElements as any}
          />
        </FieldRow>
      </SettingsSection>

      <SettingsSection title="Configurações">
        <FieldRow label="Texto alternativo">
          <Input value={block.alt} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder="Descrição" className="h-7 text-xs" />
        </FieldRow>
        <InlineRow>
          <FieldRow label="Largura">
            <Input value={block.width} onChange={e => onChange({ ...block, width: e.target.value })} placeholder="100%" className="h-7 text-xs" />
          </FieldRow>
          <FieldRow label="Link">
            <VariableInput
              value={block.link}
              onChange={val => onChange({ ...block, link: val })}
              placeholder="https://..."
              variables={variables as any}
              trackedParams={trackedParams as any}
              allInputElements={allInputElements as any}
            />
          </FieldRow>
        </InlineRow>
      </SettingsSection>

      <SettingsSection title="Alinhamento">
        <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
      </SettingsSection>

      <SettingsSection title="Espaçamento" defaultOpen={false}>
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
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
  const LINK_MODES: { value: ButtonLinkMode; label: string }[] = [
    { value: 'custom', label: 'Link personalizado' },
    { value: 'variable', label: 'Variável de link' },
    { value: 'pass_all_params', label: 'Repassar parâmetros' },
    { value: 'pass_utms', label: 'Repassar UTMs' },
    { value: 'pass_variables', label: 'Repassar variáveis' },
  ];

  return (
    <div className="min-w-0 w-full">
      <SettingsSection title="Conteúdo">
        <FieldRow label="Texto do botão">
          <VariableInput
            value={block.text}
            onChange={val => onChange({ ...block, text: val })}
            placeholder="Texto do botão"
            variables={variables as any}
            trackedParams={trackedParams as any}
            allInputElements={allInputElements as any}
          />
        </FieldRow>
      </SettingsSection>

      <SettingsSection title="Link">
        <FieldRow label="Tipo de link">
          <Select value={block.linkMode || 'custom'} onValueChange={v => onChange({ ...block, linkMode: v as ButtonLinkMode })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LINK_MODES.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        {(block.linkMode === 'custom' || !block.linkMode) && (
          <FieldRow label="URL">
            <VariableInput
              value={block.href}
              onChange={val => onChange({ ...block, href: val })}
              placeholder="https://... ou {{variavel}}"
              variables={variables as any}
              trackedParams={trackedParams as any}
              allInputElements={allInputElements as any}
            />
          </FieldRow>
        )}
        {block.linkMode === 'variable' && (
          <FieldRow label="Variável">
            <Select value={block.href} onValueChange={v => onChange({ ...block, href: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
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
            <Input value={block.href} onChange={e => onChange({ ...block, href: e.target.value })} placeholder="https://destino.com" className="h-7 text-xs" />
          </FieldRow>
        )}
      </SettingsSection>

      <SettingsSection title="Aparência">
        <InlineRow>
          <ColorPickerField label="Fundo" value={block.bgColor} onChange={c => onChange({ ...block, bgColor: c || '#4F46E5' })} allowTransparent={false} />
          <ColorPickerField label="Texto" value={block.textColor} onChange={c => onChange({ ...block, textColor: c || '#FFFFFF' })} allowTransparent={false} />
        </InlineRow>
        <div className="grid grid-cols-3 gap-1.5">
          <FieldRow label="Raio">
            <Input type="number" value={block.borderRadius} onChange={e => onChange({ ...block, borderRadius: Number(e.target.value) })} className="h-7 text-xs text-center px-1" />
          </FieldRow>
          <FieldRow label="Pad. H">
            <Input type="number" value={block.paddingX} onChange={e => onChange({ ...block, paddingX: Number(e.target.value) })} className="h-7 text-xs text-center px-1" />
          </FieldRow>
          <FieldRow label="Pad. V">
            <Input type="number" value={block.paddingY} onChange={e => onChange({ ...block, paddingY: Number(e.target.value) })} className="h-7 text-xs text-center px-1" />
          </FieldRow>
        </div>
      </SettingsSection>

      <SettingsSection title="Alinhamento">
        <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
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
            <Input type="number" value={block.thickness} onChange={e => onChange({ ...block, thickness: Number(e.target.value) })} className="h-7 text-xs" />
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
          <Input type="number" value={block.height} onChange={e => onChange({ ...block, height: Number(e.target.value) })} className="h-7 text-xs w-20" />
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
        <div className="flex gap-0.5 bg-muted/50 rounded-md p-0.5">
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setColCount(n)}
              className={cn(
                'flex-1 py-1.5 rounded text-xs font-medium transition-all',
                block.columns.length === n
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="Espaçamento" defaultOpen={false}>
        <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
      </SettingsSection>
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
    case 'text': return <TextSettings block={block} onChange={onChange} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />;
    case 'image': return <ImageSettings block={block} onChange={onChange} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />;
    case 'button': return <ButtonSettings block={block} onChange={onChange} variables={variables} trackedParams={trackedParams} allInputElements={allInputElements} />;
    case 'divider': return <DividerSettings block={block} onChange={onChange} />;
    case 'spacer': return <SpacerSettings block={block} onChange={onChange} />;
    case 'columns': return <StructureSettings block={block} onChange={onChange as any} />;
  }
}

// ─── Element preview (inside columns) ───────────────────────────────
function ElementPreview({ block }: { block: EmailBlock }) {
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
            <div className="flex items-center justify-center h-16 bg-muted/50 rounded border border-dashed border-border">
              <span className="text-muted-foreground/40 text-xs">Imagem</span>
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
    default:
      return null;
  }
}

// ─── Column drop zone ───────────────────────────────────────────────
function ColumnZone({
  elements,
  colIdx,
  structureId,
  selectedId,
  onSelectElement,
  onDropElement,
  onRemoveElement,
  onMoveElement,
  onMoveToColumn,
  totalCols,
}: {
  elements: EmailBlock[];
  colIdx: number;
  structureId: string;
  selectedId: string | null;
  onSelectElement: (id: string) => void;
  onDropElement: (structureId: string, colIdx: number, type: ElementType, insertIdx?: number) => void;
  onRemoveElement: (structureId: string, colIdx: number, elementId: string) => void;
  onMoveElement: (structureId: string, colIdx: number, elementId: string, dir: -1 | 1) => void;
  onMoveToColumn: (structureId: string, fromCol: number, toCol: number, elementId: string) => void;
  totalCols: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    const type = e.dataTransfer.types.includes('application/email-element-type');
    const move = e.dataTransfer.types.includes('application/email-element-move');
    if (!type && !move) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = move ? 'move' : 'copy';
    setDragOver(true);

    // Calculate drop index
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const children = Array.from((e.currentTarget as HTMLElement).querySelectorAll('[data-el-idx]'));
    let idx = elements.length;
    for (const child of children) {
      const cr = child.getBoundingClientRect();
      if (e.clientY < cr.top + cr.height / 2) {
        idx = parseInt(child.getAttribute('data-el-idx') || '0');
        break;
      }
    }
    setDropIdx(idx);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setDropIdx(null);

    // New element from palette
    const newType = e.dataTransfer.getData('application/email-element-type') as ElementType;
    if (newType) {
      onDropElement(structureId, colIdx, newType, dropIdx ?? undefined);
      return;
    }

    // Move element between columns
    const moveData = e.dataTransfer.getData('application/email-element-move');
    if (moveData) {
      try {
        const { structureId: srcStructId, colIdx: srcCol, elementId } = JSON.parse(moveData);
        if (srcStructId === structureId && srcCol === colIdx) return; // same column
        onMoveToColumn(srcStructId, srcCol, colIdx, elementId);
      } catch { /* ignore */ }
    }
  };

  return (
    <div
      className={cn(
        'min-h-[40px] transition-colors relative',
        dragOver ? 'bg-primary/5' : '',
        elements.length === 0 && 'border border-dashed border-border/40 rounded flex items-center justify-center'
      )}
      onDragOver={handleDragOver}
      onDragLeave={() => { setDragOver(false); setDropIdx(null); }}
      onDrop={handleDrop}
    >
      {elements.length === 0 && !dragOver && (
        <span className="text-[9px] text-muted-foreground/50 py-3">Arraste um elemento aqui</span>
      )}

      {elements.map((el, elIdx) => (
        <div key={el.id} data-el-idx={elIdx}>
          {/* Drop indicator */}
          {dragOver && dropIdx === elIdx && (
            <div className="h-0.5 bg-primary rounded-full mx-1" />
          )}
          <div
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('application/email-element-move', JSON.stringify({ structureId, colIdx, elementId: el.id }));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={e => { e.stopPropagation(); onSelectElement(el.id); }}
            className={cn(
              'relative group/el cursor-pointer transition-all',
              selectedId === el.id ? 'ring-2 ring-primary/40 ring-inset rounded-sm' : 'hover:ring-1 hover:ring-primary/20 hover:ring-inset rounded-sm'
            )}
          >
            <ElementPreview block={el} />

            {/* Controls overlay */}
            <div className="absolute top-0 right-0 flex items-center gap-px opacity-0 group-hover/el:opacity-100 transition-opacity bg-background/90 rounded-bl border-l border-b border-border shadow-sm p-0.5 z-10">
              {colIdx > 0 && (
                <button onClick={e => { e.stopPropagation(); onMoveToColumn(structureId, colIdx, colIdx - 1, el.id); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Mover para coluna anterior">
                  <ArrowLeft className="h-2.5 w-2.5" />
                </button>
              )}
              {colIdx < totalCols - 1 && (
                <button onClick={e => { e.stopPropagation(); onMoveToColumn(structureId, colIdx, colIdx + 1, el.id); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Mover para próxima coluna">
                  <ArrowRight className="h-2.5 w-2.5" />
                </button>
              )}
              {elIdx > 0 && (
                <button onClick={e => { e.stopPropagation(); onMoveElement(structureId, colIdx, el.id, -1); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
                  <ChevronUp className="h-2.5 w-2.5" />
                </button>
              )}
              {elIdx < elements.length - 1 && (
                <button onClick={e => { e.stopPropagation(); onMoveElement(structureId, colIdx, el.id, 1); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); onRemoveElement(structureId, colIdx, el.id); }} className="p-0.5 rounded hover:bg-muted text-destructive">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Drop indicator at end */}
      {dragOver && dropIdx === elements.length && (
        <div className="h-0.5 bg-primary rounded-full mx-1" />
      )}
    </div>
  );
}

// ─── Structure row (top-level) ──────────────────────────────────────
function StructureRow({
  structure,
  isSelected,
  selectedElementId,
  onSelect,
  onRemove,
  onMoveRow,
  rowIndex,
  totalRows,
  onSelectElement,
  onDropElement,
  onRemoveElement,
  onMoveElement,
  onMoveToColumn,
}: {
  structure: ColumnsBlock;
  isSelected: boolean;
  selectedElementId: string | null;
  onSelect: () => void;
  onRemove: () => void;
  onMoveRow: (dir: -1 | 1) => void;
  rowIndex: number;
  totalRows: number;
  onSelectElement: (id: string) => void;
  onDropElement: (structureId: string, colIdx: number, type: ElementType, insertIdx?: number) => void;
  onRemoveElement: (structureId: string, colIdx: number, elementId: string) => void;
  onMoveElement: (structureId: string, colIdx: number, elementId: string, dir: -1 | 1) => void;
  onMoveToColumn: (structureId: string, fromCol: number, toCol: number, elementId: string) => void;
}) {
  const pad = structure.padding;
  const padStyle = { paddingTop: pad.top, paddingRight: pad.right, paddingBottom: pad.bottom, paddingLeft: pad.left };

  return (
    <div
      onClick={e => { e.stopPropagation(); onSelect(); }}
      className={cn(
        'relative group/row transition-all',
        isSelected ? 'ring-2 ring-primary/30 ring-inset' : 'hover:ring-1 hover:ring-border hover:ring-inset',
      )}
    >
      {/* Row controls */}
      <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity z-10">
        {rowIndex > 0 && (
          <button onClick={e => { e.stopPropagation(); onMoveRow(-1); }} className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted text-muted-foreground">
            <ChevronUp className="h-3 w-3" />
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-destructive/10 text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
        {rowIndex < totalRows - 1 && (
          <button onClick={e => { e.stopPropagation(); onMoveRow(1); }} className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted text-muted-foreground">
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>

      <div style={padStyle}>
        <div className="flex" style={{ gap: 0 }}>
          {structure.columns.map((col, ci) => (
            <div key={ci} className="flex-1 min-w-0" style={{ borderRight: ci < structure.columns.length - 1 ? '1px dashed var(--border)' : 'none' }}>
              <ColumnZone
                elements={col}
                colIdx={ci}
                structureId={structure.id}
                selectedId={selectedElementId}
                onSelectElement={onSelectElement}
                onDropElement={onDropElement}
                onRemoveElement={onRemoveElement}
                onMoveElement={onMoveElement}
                onMoveToColumn={onMoveToColumn}
                totalCols={structure.columns.length}
              />
            </div>
          ))}
        </div>
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
  // Migrate old format: wrap non-column blocks in 1-col structures
  const [blocks, setBlocks] = useState<ColumnsBlock[]>(() => {
    const restored = extractBlocksFromHtml(value);
    if (restored) {
      return restored.blocks.map(b => {
        if (b.type === 'columns') return b as ColumnsBlock;
        // Wrap legacy element in 1-col structure
        const s = createStructure(1);
        s.columns[0] = [b];
        return s;
      });
    }
    // Default: one 1-col structure with a text block
    const s = createStructure(1);
    s.columns[0] = [createElement('text')];
    return [s];
  });

  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'editor' | 'preview' | 'code'>('editor');
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [emailBg, setEmailBg] = useState(() => extractBlocksFromHtml(value)?.emailBg || '#F9FAFB');
  const [contentBg, setContentBg] = useState(() => extractBlocksFromHtml(value)?.contentBg || '#FFFFFF');

  // Find selected element across all structures
  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null;
    for (const s of blocks) {
      for (const col of s.columns) {
        const found = col.find(e => e.id === selectedElementId);
        if (found) return found;
      }
    }
    return null;
  }, [blocks, selectedElementId]);

  const selectedStructure = useMemo(() => blocks.find(s => s.id === selectedStructureId) || null, [blocks, selectedStructureId]);

  // The active settings target: element takes priority over structure
  const settingsTarget = selectedElement || selectedStructure;

  // Auto-show right panel when selecting an element
  useEffect(() => {
    if (settingsTarget) setShowRightPanel(true);
  }, [settingsTarget]);

  const html = useMemo(() => blocksToHtml(blocks as EmailBlock[], emailBg, contentBg), [blocks, emailBg, contentBg]);

  // ── Structure operations ──
  const addStructure = useCallback((colCount: number, index?: number) => {
    const s = createStructure(colCount);
    setBlocks(prev => {
      const arr = [...prev];
      arr.splice(index ?? arr.length, 0, s);
      return arr;
    });
    setSelectedStructureId(s.id);
    setSelectedElementId(null);
  }, []);

  const removeStructure = useCallback((id: string) => {
    setBlocks(prev => prev.filter(s => s.id !== id));
    if (selectedStructureId === id) setSelectedStructureId(null);
    setSelectedElementId(null);
  }, [selectedStructureId]);

  const moveRow = useCallback((id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }, []);

  const updateStructure = useCallback((updated: ColumnsBlock) => {
    setBlocks(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, []);

  // ── Element operations ──
  const dropElement = useCallback((structureId: string, colIdx: number, type: ElementType, insertIdx?: number) => {
    const el = createElement(type);
    setBlocks(prev => prev.map(s => {
      if (s.id !== structureId) return s;
      const newCols = s.columns.map((col, ci) => {
        if (ci !== colIdx) return col;
        const arr = [...col];
        arr.splice(insertIdx ?? arr.length, 0, el);
        return arr;
      });
      return { ...s, columns: newCols };
    }));
    setSelectedElementId(el.id);
    setSelectedStructureId(null);
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
      return {
        ...s,
        columns: s.columns.map((col, ci) => {
          if (ci !== colIdx) return col;
          const idx = col.findIndex(e => e.id === elementId);
          if (idx < 0) return col;
          const newIdx = idx + dir;
          if (newIdx < 0 || newIdx >= col.length) return col;
          const arr = [...col];
          [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
          return arr;
        }),
      };
    }));
  }, []);

  const moveToColumn = useCallback((structureId: string, fromCol: number, toCol: number, elementId: string) => {
    setBlocks(prev => prev.map(s => {
      if (s.id !== structureId) return s;
      const el = s.columns[fromCol]?.find(e => e.id === elementId);
      if (!el) return s;
      return {
        ...s,
        columns: s.columns.map((col, ci) => {
          if (ci === fromCol) return col.filter(e => e.id !== elementId);
          if (ci === toCol) return [...col, el];
          return col;
        }),
      };
    }));
  }, []);

  const updateElement = useCallback((updated: EmailBlock) => {
    setBlocks(prev => prev.map(s => ({
      ...s,
      columns: s.columns.map(col => col.map(e => e.id === updated.id ? updated : e)),
    })));
  }, []);

  const applyTemplate = useCallback((template: EmailTemplate) => {
    // Deep-clone blocks to get fresh IDs
    const cloned = JSON.parse(JSON.stringify(template.blocks)) as ColumnsBlock[];
    // Assign fresh IDs to avoid collisions
    const reassign = (b: EmailBlock): EmailBlock => {
      const nb = { ...b, id: uid() };
      if (nb.type === 'columns') {
        (nb as ColumnsBlock).columns = (nb as ColumnsBlock).columns.map(col => col.map(reassign));
      }
      return nb;
    };
    const fresh = cloned.map(s => reassign(s) as ColumnsBlock);
    setBlocks(fresh);
    setEmailBg(template.emailBg);
    setContentBg(template.contentBg);
    setSelectedStructureId(null);
    setSelectedElementId(null);
    toast.success(`Template "${template.label}" aplicado`);
  }, []);

  const handleSave = useCallback(() => {
    const fullHtml = embedBlocksInHtml(html, blocks as EmailBlock[], emailBg, contentBg);
    onChange(fullHtml);
    onClose();
  }, [html, blocks, emailBg, contentBg, onChange, onClose]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border flex-shrink-0 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h2 className="text-sm font-semibold whitespace-nowrap hidden sm:block">Editor de E-mail</h2>
            <div className="flex border border-border rounded-md">
              {([['editor', 'Editor'], ['preview', 'Preview'], ['code', 'HTML']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={cn('px-2 sm:px-3 py-1 text-xs transition-colors', previewMode === mode ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            {previewMode === 'editor' && (
              <div className="flex items-center gap-1">
                <Button
                  variant={showLeftPanel ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowLeftPanel(p => !p)}
                  title="Painel de elementos"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={showRightPanel ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowRightPanel(p => !p)}
                  title="Painel de configurações"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancelar</Button>
            <Button size="sm" onClick={handleSave} className="text-xs">Salvar</Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
          {previewMode === 'editor' && (
            <>
              {/* Left palette */}
              {showLeftPanel && (
                <div className="w-44 sm:w-52 border-r border-border flex-shrink-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 space-y-4 min-w-0">
                  {/* Structures */}
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estruturas</span>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      {STRUCTURE_PRESETS.map(sp => (
                        <button
                          key={sp.cols}
                          onClick={() => addStructure(sp.cols)}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors"
                        >
                          <sp.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[9px] font-medium">{sp.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Elements (draggable) */}
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Elementos</span>
                    <p className="text-[9px] text-muted-foreground mt-0.5 mb-2">Arraste para dentro de uma estrutura</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ELEMENT_TYPES.map(et => (
                        <div
                          key={et.type}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData('application/email-element-type', et.type);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors cursor-grab active:cursor-grabbing"
                        >
                          <et.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[9px] font-medium">{et.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Templates */}
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Templates</span>
                    <div className="flex flex-col gap-1.5 mt-2">
                      {EMAIL_TEMPLATES.map(tpl => (
                        <button
                          key={tpl.id}
                          onClick={() => applyTemplate(tpl)}
                          className="flex items-center gap-2 p-2 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                        >
                          <tpl.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] font-medium block leading-tight">{tpl.label}</span>
                            <span className="text-[9px] text-muted-foreground block leading-tight truncate">{tpl.description}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Global style */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estilo Global</span>
                    <ColorPickerField label="Fundo do e-mail" value={emailBg} onChange={c => setEmailBg(c || '#F9FAFB')} allowTransparent={false} />
                    <ColorPickerField label="Fundo do conteúdo" value={contentBg} onChange={c => setContentBg(c || '#FFFFFF')} allowTransparent={false} />
                  </div>
                </div>
              )}

              {/* Canvas */}
              <div className="flex-1 overflow-y-auto min-w-0" style={{ backgroundColor: emailBg }}>
                <div
                  className="max-w-[600px] mx-auto my-6 rounded-lg shadow-sm relative"
                  style={{ backgroundColor: contentBg, paddingLeft: 32 }}
                  onClick={() => { setSelectedStructureId(null); setSelectedElementId(null); }}
                >
                  {blocks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Plus className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">Adicione uma estrutura para começar</p>
                    </div>
                  )}

                  {blocks.map((structure, rowIdx) => (
                    <StructureRow
                      key={structure.id}
                      structure={structure}
                      isSelected={selectedStructureId === structure.id && !selectedElementId}
                      selectedElementId={selectedElementId}
                      onSelect={() => { setSelectedStructureId(structure.id); setSelectedElementId(null); }}
                      onRemove={() => removeStructure(structure.id)}
                      onMoveRow={dir => moveRow(structure.id, dir)}
                      rowIndex={rowIdx}
                      totalRows={blocks.length}
                      onSelectElement={id => { setSelectedElementId(id); setSelectedStructureId(null); }}
                      onDropElement={dropElement}
                      onRemoveElement={removeElement}
                      onMoveElement={moveElement}
                      onMoveToColumn={moveToColumn}
                    />
                  ))}
                </div>
              </div>

              {/* Settings panel */}
              {showRightPanel && (
                <div className="w-64 sm:w-72 border-l border-border flex-shrink-0 overflow-y-auto overflow-x-hidden min-w-0">
                  {settingsTarget ? (
                    <div className="w-full min-w-0 max-w-full">
                      {/* Panel header */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30 sticky top-0 z-10">
                        {(() => {
                          const Icon = BLOCK_ICONS[settingsTarget.type] || Type;
                          return <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
                        })()}
                        <span className="text-xs font-semibold truncate flex-1">{BLOCK_LABELS[settingsTarget.type]}</span>
                        <button
                          onClick={() => { setSelectedElementId(null); setSelectedStructureId(null); }}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Panel body */}
                      <div className="px-3 pt-1 pb-3">
                        <BlockSettingsDispatch
                          block={settingsTarget}
                          onChange={b => {
                            if (b.type === 'columns') updateStructure(b as ColumnsBlock);
                            else updateElement(b);
                          }}
                          variables={variables}
                          trackedParams={trackedParams}
                          allInputElements={allInputElements}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
                      <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">Selecione um elemento<br/>para editar</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {previewMode === 'preview' && (
            <div className="flex-1 overflow-y-auto bg-muted/30 p-4 sm:p-6 min-w-0">
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
            <div className="flex-1 overflow-y-auto p-4 min-w-0">
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
