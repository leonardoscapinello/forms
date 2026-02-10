import { useCallback, useState } from 'react';
import { GraphicDataItem } from '@/types/form';
import { Reorder, useDragControls, motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Trash2, Plus, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e',
  '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444',
  '#ec4899', '#a855f7', '#8b5cf6', '#64748b', '#0f172a',
];

interface DataItemProps {
  item: GraphicDataItem;
  index: number;
  onUpdate: (id: string, patch: Partial<GraphicDataItem>) => void;
  onRemove: (id: string) => void;
}

function DataItemRow({ item, index, onUpdate, onRemove }: DataItemProps) {
  const controls = useDragControls();
  const [expanded, setExpanded] = useState(false);
  const colorMode = item.colorMode || 'solid';

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="select-none"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="group rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-200 hover:shadow-sm overflow-hidden">
        {/* Main row */}
        <div className="flex items-center gap-2 p-2.5">
          <button
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Color dot */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="w-5 h-5 rounded-full border-2 border-card shadow-sm flex-shrink-0 hover:scale-110 transition-transform"
                style={{
                  background: colorMode === 'gradient' && item.gradientTo
                    ? `linear-gradient(135deg, ${item.color || PRESET_COLORS[index % PRESET_COLORS.length]}, ${item.gradientTo})`
                    : item.color || PRESET_COLORS[index % PRESET_COLORS.length],
                }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 z-[300]" side="left">
              <div className="space-y-3">
                {/* Color mode toggle */}
                <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => onUpdate(item.id, { colorMode: 'solid' })}
                    className={`flex-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      colorMode === 'solid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Sólido
                  </button>
                  <button
                    onClick={() => onUpdate(item.id, { colorMode: 'gradient' })}
                    className={`flex-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      colorMode === 'gradient' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Degradê
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {colorMode === 'gradient' ? 'Cor inicial' : 'Cor'}
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${
                          item.color === c ? 'ring-2 ring-primary ring-offset-2' : ''
                        }`}
                        style={{ backgroundColor: c }}
                        onClick={() => onUpdate(item.id, { color: c })}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={item.color || PRESET_COLORS[index % PRESET_COLORS.length]}
                      onChange={e => onUpdate(item.id, { color: e.target.value })}
                      className="w-full h-8 rounded cursor-pointer border border-border"
                    />
                  </div>
                </div>

                {colorMode === 'gradient' && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Cor final</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${
                            item.gradientTo === c ? 'ring-2 ring-primary ring-offset-2' : ''
                          }`}
                          style={{ backgroundColor: c }}
                          onClick={() => onUpdate(item.id, { gradientTo: c })}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={item.gradientTo || '#10b981'}
                        onChange={e => onUpdate(item.id, { gradientTo: e.target.value })}
                        className="w-full h-8 rounded cursor-pointer border border-border"
                      />
                    </div>
                    {/* Gradient preview */}
                    <div
                      className="w-full h-6 rounded-lg border border-border"
                      style={{
                        background: `linear-gradient(90deg, ${item.color || PRESET_COLORS[index % PRESET_COLORS.length]}, ${item.gradientTo || '#10b981'})`,
                      }}
                    />
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Label */}
          <Input
            value={item.label}
            onChange={e => onUpdate(item.id, { label: e.target.value })}
            className="text-xs h-7 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
            placeholder="Label"
          />

          {/* Value */}
          <Input
            value={item.value}
            onChange={e => onUpdate(item.id, { value: e.target.value })}
            className="text-xs h-7 w-16 text-right border-0 bg-transparent shadow-none focus-visible:ring-0 px-1 font-mono"
            placeholder="0"
          />

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors ${item.tooltip ? 'text-primary/60' : ''}`}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        {/* Expanded: tooltip */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Tooltip da legenda
                  </Label>
                  <Textarea
                    value={item.tooltip || ''}
                    onChange={e => onUpdate(item.id, { tooltip: e.target.value })}
                    placeholder="Texto que aparece fixo na legenda..."
                    className="text-xs min-h-[50px] resize-none"
                    rows={2}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reorder.Item>
  );
}

interface Props {
  items: GraphicDataItem[];
  onChange: (items: GraphicDataItem[]) => void;
}

export default function DataItemList({ items, onChange }: Props) {
  const handleUpdate = useCallback((id: string, patch: Partial<GraphicDataItem>) => {
    onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  }, [items, onChange]);

  const handleRemove = useCallback((id: string) => {
    onChange(items.filter(i => i.id !== id));
  }, [items, onChange]);

  const handleAdd = useCallback(() => {
    const newItem: GraphicDataItem = {
      id: crypto.randomUUID(),
      label: `Item ${items.length + 1}`,
      value: String(Math.floor(Math.random() * 80) + 20),
      color: PRESET_COLORS[items.length % PRESET_COLORS.length],
    };
    onChange([...items, newItem]);
  }, [items, onChange]);

  return (
    <div className="space-y-2">
      <Reorder.Group axis="y" values={items} onReorder={onChange} className="space-y-1.5">
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <DataItemRow
              key={item.id}
              item={item}
              index={i}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>

      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs border-dashed hover:border-primary hover:text-primary transition-colors"
          onClick={handleAdd}
        >
          <Plus className="mr-1.5 h-3 w-3" />
          Adicionar dado
        </Button>
      </motion.div>
    </div>
  );
}
