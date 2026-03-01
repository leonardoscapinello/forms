import { useState, useCallback, useMemo } from 'react';
import {
  Trash2, GripVertical, ChevronUp, ChevronDown, Plus, X,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ColorPickerField, ImageSourcePicker } from '@/components/editor/shared';
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

import {
  type BlockType, type EmailBlock, type BlockPadding,
  type TextBlock, type ImageBlock, type ButtonBlock, type ButtonLinkMode,
  type DividerBlock, type SpacerBlock, type ColumnsBlock,
  createBlock, blocksToHtml, embedBlocksInHtml, extractBlocksFromHtml,
  BLOCK_TYPES, COL_BLOCK_TYPES, BLOCK_LABELS,
} from './emailBlockTypes';

// ─── Shared micro-components ────────────────────────────────────────

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
          <ColorPickerField label="Cor" value={block.color} onChange={c => onChange({ ...block, color: c || '#000000' })} allowTransparent={false} />
        </div>
      </div>
      <AlignButtons value={block.align} onChange={v => onChange({ ...block, align: v })} />
      <PaddingEditor padding={block.padding} onChange={p => onChange({ ...block, padding: p })} />
    </div>
  );
}

function ImageSettings({ block, onChange }: { block: ImageBlock; onChange: (b: ImageBlock) => void }) {
  return (
    <div className="space-y-3">
      <ImageSourcePicker
        value={block.src}
        onChange={url => onChange({ ...block, src: url })}
        accept="image/*"
        alt={block.alt}
      />
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
        <ColorPickerField label="Cor do fundo" value={block.bgColor} onChange={c => onChange({ ...block, bgColor: c || '#4F46E5' })} allowTransparent={false} />
        <ColorPickerField label="Cor do texto" value={block.textColor} onChange={c => onChange({ ...block, textColor: c || '#FFFFFF' })} allowTransparent={false} />
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
        <ColorPickerField label="Cor" value={block.color} onChange={c => onChange({ ...block, color: c || '#E5E7EB' })} allowTransparent={false} />
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

          {col.map((b, bi) => (
            <div key={b.id} className="flex items-center gap-1 rounded bg-muted/50 px-1.5 py-1 text-[10px]">
              <span className="flex-1 truncate">{BLOCK_LABELS[b.type]}: {b.type === 'text' ? (b as TextBlock).content.slice(0, 20) : b.type === 'button' ? (b as ButtonBlock).text : ''}</span>
              <button onClick={() => moveInColumn(ci, b.id, -1)} className="p-0.5 hover:bg-muted rounded" disabled={bi === 0}><ChevronUp className="h-2.5 w-2.5" /></button>
              <button onClick={() => moveInColumn(ci, b.id, 1)} className="p-0.5 hover:bg-muted rounded" disabled={bi === col.length - 1}><ChevronDown className="h-2.5 w-2.5" /></button>
              <button onClick={() => removeFromColumn(ci, b.id)} className="p-0.5 hover:bg-muted rounded text-destructive"><Trash2 className="h-2.5 w-2.5" /></button>
            </div>
          ))}

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
                  <ColorPickerField label="Fundo do e-mail" value={emailBg} onChange={c => setEmailBg(c || '#F9FAFB')} allowTransparent={false} />
                  <ColorPickerField label="Fundo do conteúdo" value={contentBg} onChange={c => setContentBg(c || '#FFFFFF')} allowTransparent={false} />
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
