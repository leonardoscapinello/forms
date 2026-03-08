import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Plus, Trash2, Type, ImageIcon, Square, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  ImageGenNodeData, ImageGenLayer, ImageGenTextLayer, ImageGenImageLayer, ImageGenShapeLayer,
  FormVariable, FormVariableType,
} from '@/types/form';
import type { InputElementGroup } from '../VariableAssignPanel';
import VariableSelect from '../shared/VariableSelect';
import VariableInput from '../shared/VariableInput';
import { ImageSourcePicker } from '../shared';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nodeData: ImageGenNodeData;
  onChange: (patch: Partial<ImageGenNodeData>) => void;
  variables?: FormVariable[];
  allInputElements?: InputElementGroup[];
  onCreateVariable?: (variable: FormVariable) => void;
}

function createTextLayer(): ImageGenTextLayer {
  return { id: crypto.randomUUID(), type: 'text', content: '', x: 50, y: 50, fontSize: 32, fontColor: '#FFFFFF', fontWeight: 'bold', textAlign: 'center', maxWidth: 80 };
}

function createImageLayer(): ImageGenImageLayer {
  return { id: crypto.randomUUID(), type: 'image', src: '', x: 10, y: 10, width: 20, height: 20, borderRadius: 0, opacity: 100 };
}

function createShapeLayer(): ImageGenShapeLayer {
  return { id: crypto.randomUUID(), type: 'shape', shapeType: 'rectangle', x: 10, y: 10, width: 30, height: 10, fillColor: '#000000', borderRadius: 8, opacity: 80 };
}

const LAYER_ICON: Record<string, React.ElementType> = { text: Type, image: ImageIcon, shape: Square };
const LAYER_LABEL: Record<string, string> = { text: 'Texto', image: 'Imagem', shape: 'Forma' };

export default function ImageGenConfigDialog({ open, onOpenChange, nodeData, onChange, variables = [], allInputElements = [], onCreateVariable }: Props) {
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const layers = nodeData.layers || [];

  const updateLayers = useCallback((newLayers: ImageGenLayer[]) => {
    onChange({ layers: newLayers });
  }, [onChange]);

  const addLayer = (type: 'text' | 'image' | 'shape') => {
    const layer = type === 'text' ? createTextLayer() : type === 'image' ? createImageLayer() : createShapeLayer();
    updateLayers([...layers, layer]);
    setExpandedLayerId(layer.id);
  };

  const updateLayer = (id: string, patch: Partial<ImageGenLayer>) => {
    updateLayers(layers.map(l => l.id === id ? { ...l, ...patch } as ImageGenLayer : l));
  };

  const removeLayer = (id: string) => {
    updateLayers(layers.filter(l => l.id !== id));
    if (expandedLayerId === id) setExpandedLayerId(null);
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= layers.length) return;
    const newLayers = [...layers];
    [newLayers[idx], newLayers[newIdx]] = [newLayers[newIdx], newLayers[idx]];
    updateLayers(newLayers);
  };

  const varInputProps = { variables, allInputElements };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-node-imagegen-accent" />
            Configurar Imagem Dinâmica
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* ─── Background Image ─── */}
          <section className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Imagem de Fundo</Label>
            <ImageSourcePicker
              value={nodeData.backgroundImage || ''}
              onChange={url => onChange({ backgroundImage: url })}
              pathPrefix="imagegen"
              placeholder="URL da imagem de fundo..."
              compact
            />
          </section>

          {/* ─── Output dimensions ─── */}
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Largura (px)</Label>
              <Input
                type="number"
                value={nodeData.outputWidth || 1200}
                onChange={e => onChange({ outputWidth: Number(e.target.value) || 1200 })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura (px)</Label>
              <Input
                type="number"
                value={nodeData.outputHeight || 630}
                onChange={e => onChange({ outputHeight: Number(e.target.value) || 630 })}
                className="h-8 text-xs"
              />
            </div>
          </section>

          {/* ─── Layers ─── */}
          <section className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Camadas ({layers.length})</Label>

            {layers.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg py-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">Nenhuma camada adicionada</p>
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addLayer('text')}>
                    <Type className="h-3 w-3" /> Texto
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addLayer('image')}>
                    <ImageIcon className="h-3 w-3" /> Imagem
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addLayer('shape')}>
                    <Square className="h-3 w-3" /> Forma
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {layers.map((layer, idx) => {
                  const Icon = LAYER_ICON[layer.type];
                  const isExpanded = expandedLayerId === layer.id;
                  return (
                    <div key={layer.id} className="border border-border rounded-lg bg-muted/20 overflow-hidden">
                      {/* Layer header */}
                      <div
                        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                        <Icon className="h-3 w-3 text-node-imagegen-accent flex-shrink-0" />
                        <span className="text-xs font-medium flex-1 truncate">
                          {LAYER_LABEL[layer.type]}
                          {layer.type === 'text' && (layer as ImageGenTextLayer).content
                            ? `: ${(layer as ImageGenTextLayer).content.slice(0, 25)}${(layer as ImageGenTextLayer).content.length > 25 ? '...' : ''}`
                            : ''}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1); }} disabled={idx === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground">
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1); }} disabled={idx === layers.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground">
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Layer settings */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/50">
                          {/* ── Text layer ── */}
                          {layer.type === 'text' && (() => {
                            const t = layer as ImageGenTextLayer;
                            return (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Conteúdo</Label>
                                  <VariableInput
                                    value={t.content}
                                    onChange={v => updateLayer(layer.id, { content: v })}
                                    placeholder="Texto ou {{variável}}..."
                                    {...varInputProps}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Posição X (%)</Label>
                                    <Slider value={[t.x]} onValueChange={([v]) => updateLayer(layer.id, { x: v })} min={0} max={100} step={1} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Posição Y (%)</Label>
                                    <Slider value={[t.y]} onValueChange={([v]) => updateLayer(layer.id, { y: v })} min={0} max={100} step={1} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Tamanho</Label>
                                    <Input type="number" value={t.fontSize} onChange={e => updateLayer(layer.id, { fontSize: Number(e.target.value) || 16 })} className="h-7 text-xs" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Cor</Label>
                                    <div className="flex items-center gap-1">
                                      <input type="color" value={t.fontColor} onChange={e => updateLayer(layer.id, { fontColor: e.target.value })} className="h-7 w-7 rounded border border-border cursor-pointer" />
                                      <Input value={t.fontColor} onChange={e => updateLayer(layer.id, { fontColor: e.target.value })} className="h-7 text-xs font-mono flex-1" />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Peso</Label>
                                    <Select value={t.fontWeight || 'normal'} onValueChange={v => updateLayer(layer.id, { fontWeight: v })}>
                                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                                        <SelectItem value="bold" className="text-xs">Bold</SelectItem>
                                        <SelectItem value="900" className="text-xs">Black</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Alinhamento</Label>
                                    <Select value={t.textAlign || 'center'} onValueChange={v => updateLayer(layer.id, { textAlign: v as any })}>
                                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="left" className="text-xs">Esquerda</SelectItem>
                                        <SelectItem value="center" className="text-xs">Centro</SelectItem>
                                        <SelectItem value="right" className="text-xs">Direita</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Largura máx. (%)</Label>
                                    <Slider value={[t.maxWidth || 80]} onValueChange={([v]) => updateLayer(layer.id, { maxWidth: v })} min={10} max={100} step={1} />
                                  </div>
                                </div>
                              </>
                            );
                          })()}

                          {/* ── Image layer ── */}
                          {layer.type === 'image' && (() => {
                            const img = layer as ImageGenImageLayer;
                            return (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Fonte da imagem</Label>
                                  <VariableInput
                                    value={img.src}
                                    onChange={v => updateLayer(layer.id, { src: v })}
                                    placeholder="URL ou {{variável}}..."
                                    {...varInputProps}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">X (%)</Label>
                                    <Slider value={[img.x]} onValueChange={([v]) => updateLayer(layer.id, { x: v })} min={0} max={100} step={1} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Y (%)</Label>
                                    <Slider value={[img.y]} onValueChange={([v]) => updateLayer(layer.id, { y: v })} min={0} max={100} step={1} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Largura (%)</Label>
                                    <Slider value={[img.width]} onValueChange={([v]) => updateLayer(layer.id, { width: v })} min={1} max={100} step={1} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Altura (%)</Label>
                                    <Slider value={[img.height]} onValueChange={([v]) => updateLayer(layer.id, { height: v })} min={1} max={100} step={1} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Borda arredondada</Label>
                                    <Slider value={[img.borderRadius || 0]} onValueChange={([v]) => updateLayer(layer.id, { borderRadius: v })} min={0} max={50} step={1} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Opacidade (%)</Label>
                                    <Slider value={[img.opacity ?? 100]} onValueChange={([v]) => updateLayer(layer.id, { opacity: v })} min={0} max={100} step={1} />
                                  </div>
                                </div>
                              </>
                            );
                          })()}

                          {/* ── Shape layer ── */}
                          {layer.type === 'shape' && (() => {
                            const s = layer as ImageGenShapeLayer;
                            return (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Tipo</Label>
                                  <Select value={s.shapeType} onValueChange={v => updateLayer(layer.id, { shapeType: v as any })}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="rectangle" className="text-xs">Retângulo</SelectItem>
                                      <SelectItem value="circle" className="text-xs">Círculo</SelectItem>
                                      <SelectItem value="badge" className="text-xs">Badge</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">X (%)</Label>
                                    <Slider value={[s.x]} onValueChange={([v]) => updateLayer(layer.id, { x: v })} min={0} max={100} step={1} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Y (%)</Label>
                                    <Slider value={[s.y]} onValueChange={([v]) => updateLayer(layer.id, { y: v })} min={0} max={100} step={1} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Largura (%)</Label>
                                    <Slider value={[s.width]} onValueChange={([v]) => updateLayer(layer.id, { width: v })} min={1} max={100} step={1} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Altura (%)</Label>
                                    <Slider value={[s.height]} onValueChange={([v]) => updateLayer(layer.id, { height: v })} min={1} max={100} step={1} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Cor de preenchimento</Label>
                                    <div className="flex items-center gap-1">
                                      <input type="color" value={s.fillColor} onChange={e => updateLayer(layer.id, { fillColor: e.target.value })} className="h-7 w-7 rounded border border-border cursor-pointer" />
                                      <Input value={s.fillColor} onChange={e => updateLayer(layer.id, { fillColor: e.target.value })} className="h-7 text-xs font-mono flex-1" />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Opacidade (%)</Label>
                                    <Slider value={[s.opacity ?? 100]} onValueChange={([v]) => updateLayer(layer.id, { opacity: v })} min={0} max={100} step={1} />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Borda arredondada</Label>
                                  <Slider value={[s.borderRadius || 0]} onValueChange={([v]) => updateLayer(layer.id, { borderRadius: v })} min={0} max={50} step={1} />
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add layer buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1 border-dashed" onClick={() => addLayer('text')}>
                    <Type className="h-3 w-3" /> Texto
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1 border-dashed" onClick={() => addLayer('image')}>
                    <ImageIcon className="h-3 w-3" /> Imagem
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1 border-dashed" onClick={() => addLayer('shape')}>
                    <Square className="h-3 w-3" /> Forma
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* ─── Output variable ─── */}
          <section className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salvar URL da imagem em</Label>
            <VariableSelect
              value={nodeData.outputVariableId || ''}
              variables={variables}
              onValueChange={val => onChange({ outputVariableId: val })}
              onCreateVariable={onCreateVariable}
              placeholder="Selecionar variável..."
              accentClass="text-node-imagegen-accent"
            />
            <p className="text-[10px] text-muted-foreground">
              A URL da imagem gerada será armazenada nesta variável para uso em elementos posteriores.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
