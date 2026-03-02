import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, RotateCw, Shuffle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ColorPickerField from './ColorPickerField';

export interface GradientStop {
  color: string;
  position: number; // 0-100
  opacity: number;  // 0-100
}

export interface GradientConfig {
  type: 'linear' | 'radial' | 'conic';
  angle: number;
  radialShape: 'circle' | 'ellipse';
  radialSize: string;
  stops: GradientStop[];
}

const GRADIENT_PRESETS = [
  { label: 'Azul suave', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Rosa quente', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Verde menta', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { label: 'Pôr-do-sol', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { label: 'Escuro', value: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 100%)' },
  { label: 'Neutro', value: 'linear-gradient(180deg, #fdfcfb 0%, #e2d1c3 100%)' },
  { label: 'Oceano', value: 'linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)' },
  { label: 'Lavanda', value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
  { label: 'Fogo', value: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
  { label: 'Aurora', value: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' },
  { label: 'Noite', value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
  { label: 'Floresta', value: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
];

const DEFAULT_CONFIG: GradientConfig = {
  type: 'linear',
  angle: 135,
  radialShape: 'circle',
  radialSize: 'farthest-corner',
  stops: [
    { color: '#667eea', position: 0, opacity: 100 },
    { color: '#764ba2', position: 100, opacity: 100 },
  ],
};

function hexToRgba(hex: string, opacity: number): string {
  if (!hex || !hex.startsWith('#')) return hex || 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

function parseColorToHexOpacity(raw: string): { color: string; opacity: number } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('#')) return { color: trimmed, opacity: 100 };
  const rgbaMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    return { color: `#${r}${g}${b}`, opacity: Math.round(a * 100) };
  }
  return { color: '#888888', opacity: 100 };
}

function parseCssToConfig(css: string): GradientConfig | null {
  if (!css) return null;
  try {
    let type: GradientConfig['type'] = 'linear';
    let radialShape: 'circle' | 'ellipse' = 'circle';
    let radialSize = 'farthest-corner';
    let angle = 135;

    if (css.startsWith('radial-gradient')) type = 'radial';
    else if (css.startsWith('conic-gradient')) type = 'conic';

    const innerMatch = css.match(/\((.+)\)$/s);
    if (!innerMatch) return null;
    const inner = innerMatch[1];
    let stopsStr = inner;

    if (type === 'linear') {
      const dirMatch = inner.match(/^(\d+)deg\s*,\s*/);
      if (dirMatch) { angle = parseInt(dirMatch[1]); stopsStr = inner.slice(dirMatch[0].length); }
    } else if (type === 'conic') {
      const dirMatch = inner.match(/^from\s+(\d+)deg\s*,\s*/);
      if (dirMatch) { angle = parseInt(dirMatch[1]); stopsStr = inner.slice(dirMatch[0].length); }
    } else if (type === 'radial') {
      const dirMatch = inner.match(/^(circle|ellipse)\s+([\w-]+)\s*,\s*/);
      if (dirMatch) { radialShape = dirMatch[1] as any; radialSize = dirMatch[2]; stopsStr = inner.slice(dirMatch[0].length); }
    }

    const stops: GradientStop[] = [];
    const stopRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+)%/g;
    let match;
    while ((match = stopRegex.exec(stopsStr)) !== null) {
      const { color, opacity } = parseColorToHexOpacity(match[1]);
      stops.push({ color, position: parseInt(match[2]), opacity });
    }
    if (stops.length < 2) return null;
    return { type, angle, radialShape, radialSize, stops };
  } catch { return null; }
}

function configToCss(config: GradientConfig): string {
  const stopsStr = [...config.stops]
    .sort((a, b) => a.position - b.position)
    .map(s => `${hexToRgba(s.color, s.opacity)} ${s.position}%`)
    .join(', ');
  switch (config.type) {
    case 'radial': return `radial-gradient(${config.radialShape} ${config.radialSize}, ${stopsStr})`;
    case 'conic': return `conic-gradient(from ${config.angle}deg, ${stopsStr})`;
    default: return `linear-gradient(${config.angle}deg, ${stopsStr})`;
  }
}

// ─── Angle Wheel (Figma-style) ─────────────────────────────
function AngleWheel({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const getAngleFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return angle;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let deg = Math.round(Math.atan2(dy, dx) * (180 / Math.PI) + 90);
    if (deg < 0) deg += 360;
    // Snap to 15° increments when close
    const snapped = Math.round(deg / 15) * 15;
    if (Math.abs(deg - snapped) < 4) deg = snapped;
    return deg % 360;
  }, [angle]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    wheelRef.current?.setPointerCapture(e.pointerId);
    onChange(getAngleFromEvent(e));
  }, [getAngleFromEvent, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    onChange(getAngleFromEvent(e));
  }, [getAngleFromEvent, onChange]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const rad = (angle - 90) * (Math.PI / 180);
  const r = 16;
  const hx = 20 + r * Math.cos(rad);
  const hy = 20 + r * Math.sin(rad);

  return (
    <div className="flex items-center gap-2">
      <div
        ref={wheelRef}
        className="relative w-10 h-10 rounded-full border-2 border-border bg-muted/30 cursor-pointer touch-none shrink-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 -translate-x-1/2 -translate-y-1/2" />
        {/* Direction indicator */}
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/30"
          style={{
            left: hx - 5,
            top: hy - 5,
          }}
        />
        {/* Line from center to handle */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 40 40">
          <line x1="20" y1="20" x2={hx} y2={hy} stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={angle}
          onChange={e => {
            let v = parseInt(e.target.value) || 0;
            if (v < 0) v += 360;
            if (v >= 360) v %= 360;
            onChange(v);
          }}
          className="w-12 h-7 text-xs text-center rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
        />
        <span className="text-[10px] text-muted-foreground">°</span>
      </div>
    </div>
  );
}

// ─── Interactive Gradient Bar with draggable stops ─────────
function GradientBar({
  stops,
  selectedIndex,
  onSelect,
  onStopMove,
  onAddStop,
  cssPreview,
}: {
  stops: GradientStop[];
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  onStopMove: (i: number, position: number) => void;
  onAddStop: (position: number) => void;
  cssPreview: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);

  const getPosition = useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 50;
    const pct = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
    return pct;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    dragIndex.current = index;
    onSelect(index);
    barRef.current?.setPointerCapture(e.pointerId);
  }, [onSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIndex.current === null) return;
    onStopMove(dragIndex.current, getPosition(e.clientX));
  }, [getPosition, onStopMove]);

  const handlePointerUp = useCallback(() => {
    dragIndex.current = null;
  }, []);

  const handleBarClick = useCallback((e: React.MouseEvent) => {
    // Only add if clicking on the bar itself, not a handle
    if ((e.target as HTMLElement).dataset.handle) return;
    onAddStop(getPosition(e.clientX));
  }, [getPosition, onAddStop]);

  // Checkerboard for transparent colors
  const checkerboard = `repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px`;

  return (
    <div className="space-y-1">
      <div
        ref={barRef}
        className="relative h-7 rounded-lg cursor-crosshair touch-none group"
        style={{ background: checkerboard }}
        onClick={handleBarClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Gradient fill */}
        <div className="absolute inset-0 rounded-lg" style={{ background: cssPreview }} />
        {/* Border overlay */}
        <div className="absolute inset-0 rounded-lg border border-border/60" />

        {/* Stop handles */}
        {stops.map((stop, i) => {
          const isSelected = selectedIndex === i;
          return (
            <div
              key={i}
              data-handle="true"
              className={`absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-shadow ${
                isSelected ? 'z-20' : 'z-10'
              }`}
              style={{ left: `calc(${stop.position}% - 7px)` }}
              onPointerDown={e => handlePointerDown(e, i)}
            >
              <div
                data-handle="true"
                className={`w-[14px] h-[14px] rounded-full border-[2.5px] shadow-md transition-all ${
                  isSelected
                    ? 'border-primary scale-110 shadow-primary/25'
                    : 'border-background hover:border-primary/60 hover:scale-105'
                }`}
                style={{ backgroundColor: stop.color }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/60 text-center">Clique na barra para adicionar · arraste para mover</p>
    </div>
  );
}

// ─── Stop Row (inline, compact) ────────────────────────────
function StopRow({
  stop,
  index,
  isSelected,
  canDelete,
  onSelect,
  onUpdate,
  onDelete,
}: {
  stop: GradientStop;
  index: number;
  isSelected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<GradientStop>) => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary/5 ring-1 ring-primary/20'
          : 'hover:bg-muted/40'
      }`}
    >
      {/* Color picker inline */}
      <div className="shrink-0" onClick={e => e.stopPropagation()}>
        <ColorPickerField
          value={stop.color}
          onChange={v => onUpdate({ color: v || '#000000' })}
          defaultColor="#000000"
          allowTransparent={false}
        />
      </div>

      {/* Position input */}
      <div className="flex items-center gap-0.5 shrink-0">
        <input
          type="number"
          value={stop.position}
          onChange={e => onUpdate({ position: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
          onClick={e => e.stopPropagation()}
          className="w-10 h-6 text-[11px] text-center rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
        />
        <span className="text-[9px] text-muted-foreground">%</span>
      </div>

      {/* Opacity */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        <div
          className="w-3 h-3 rounded-sm border border-border/50 shrink-0"
          style={{ opacity: stop.opacity / 100, backgroundColor: stop.color }}
        />
        <Slider
          value={[stop.opacity]}
          onValueChange={([v]) => onUpdate({ opacity: v })}
          min={0} max={100} step={1}
          className="flex-1"
        />
        <span className="text-[9px] text-muted-foreground w-6 text-right tabular-nums">{stop.opacity}%</span>
      </div>

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ opacity: isSelected ? 1 : undefined }}
        disabled={!canDelete}
        onClick={e => { e.stopPropagation(); onDelete(); }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </motion.div>
  );
}

// ─── Type Selector (pill buttons) ──────────────────────────
const TYPES: { value: GradientConfig['type']; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
  { value: 'conic', label: 'Cônico' },
];

function TypeSelector({ value, onChange }: { value: GradientConfig['type']; onChange: (v: GradientConfig['type']) => void }) {
  return (
    <div className="flex p-0.5 rounded-lg bg-muted/50 border border-border/50">
      {TYPES.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`flex-1 text-[11px] font-medium px-2 py-1 rounded-md transition-all ${
            value === t.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
interface Props {
  value: string;
  onChange: (css: string) => void;
}

export default function GradientEditor({ value, onChange }: Props) {
  const [config, setConfig] = useState<GradientConfig>(() => parseCssToConfig(value) || DEFAULT_CONFIG);
  const [mode, setMode] = useState<'presets' | 'custom'>(() => {
    if (!value) return 'presets';
    if (GRADIENT_PRESETS.some(p => p.value === value)) return 'presets';
    return 'custom';
  });
  const [selectedStop, setSelectedStop] = useState<number | null>(0);

  const updateConfig = useCallback((patch: Partial<GradientConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      onChange(configToCss(next));
      return next;
    });
  }, [onChange]);

  const updateStop = useCallback((index: number, patch: Partial<GradientStop>) => {
    setConfig(prev => {
      const stops = prev.stops.map((s, i) => i === index ? { ...s, ...patch } : s);
      const next = { ...prev, stops };
      onChange(configToCss(next));
      return next;
    });
  }, [onChange]);

  const addStopAtPosition = useCallback((position: number) => {
    setConfig(prev => {
      // Interpolate color at position
      const sorted = [...prev.stops].sort((a, b) => a.position - b.position);
      let color = '#888888';
      for (let i = 0; i < sorted.length - 1; i++) {
        if (position >= sorted[i].position && position <= sorted[i + 1].position) {
          color = sorted[i].color; // simple: take left color
          break;
        }
      }
      const newIndex = prev.stops.length;
      const stops = [...prev.stops, { color, position, opacity: 100 }];
      const next = { ...prev, stops };
      onChange(configToCss(next));
      setSelectedStop(newIndex);
      return next;
    });
  }, [onChange]);

  const addStop = useCallback(() => {
    setConfig(prev => {
      const sorted = [...prev.stops].sort((a, b) => a.position - b.position);
      let maxGap = 0, insertPos = 50;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].position - sorted[i].position;
        if (gap > maxGap) { maxGap = gap; insertPos = Math.round(sorted[i].position + gap / 2); }
      }
      const newIndex = prev.stops.length;
      const stops = [...prev.stops, { color: '#888888', position: insertPos, opacity: 100 }];
      const next = { ...prev, stops };
      onChange(configToCss(next));
      setSelectedStop(newIndex);
      return next;
    });
  }, [onChange]);

  const removeStop = useCallback((index: number) => {
    setConfig(prev => {
      if (prev.stops.length <= 2) return prev;
      const stops = prev.stops.filter((_, i) => i !== index);
      const next = { ...prev, stops };
      onChange(configToCss(next));
      if (selectedStop === index) setSelectedStop(null);
      else if (selectedStop !== null && selectedStop > index) setSelectedStop(selectedStop - 1);
      return next;
    });
  }, [onChange, selectedStop]);

  const reverseStops = useCallback(() => {
    setConfig(prev => {
      const stops = prev.stops.map(s => ({ ...s, position: 100 - s.position }));
      const next = { ...prev, stops };
      onChange(configToCss(next));
      return next;
    });
  }, [onChange]);

  const cssPreview = useMemo(() => configToCss(config), [config]);

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex p-0.5 rounded-lg bg-muted/50 border border-border/50">
        <button
          onClick={() => setMode('presets')}
          className={`flex-1 text-[11px] font-medium px-2 py-1.5 rounded-md transition-all ${
            mode === 'presets' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Predefinidos
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`flex-1 text-[11px] font-medium px-2 py-1.5 rounded-md transition-all ${
            mode === 'custom' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Personalizado
        </button>
      </div>

      {/* Presets grid */}
      {mode === 'presets' && (
        <div className="grid grid-cols-3 gap-1.5">
          {GRADIENT_PRESETS.map(preset => (
            <button
              key={preset.label}
              className={`group/preset relative h-10 rounded-lg border-2 transition-all overflow-hidden ${
                value === preset.value
                  ? 'border-primary ring-1 ring-primary/30 scale-[1.02]'
                  : 'border-transparent hover:border-primary/30 hover:scale-[1.02]'
              }`}
              style={{ background: preset.value }}
              onClick={() => {
                onChange(preset.value);
                setConfig(parseCssToConfig(preset.value) || DEFAULT_CONFIG);
              }}
              title={preset.label}
            >
              <span className="absolute inset-x-0 bottom-0 text-[8px] font-medium text-white/90 bg-black/30 backdrop-blur-sm px-1 py-0.5 opacity-0 group-hover/preset:opacity-100 transition-opacity text-center">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Custom editor */}
      {mode === 'custom' && (
        <div className="space-y-4">
          {/* Preview + Gradient Bar */}
          <div className="space-y-2">
            <div className="h-16 rounded-xl border border-border/60 shadow-inner" style={{ background: cssPreview }} />
            <GradientBar
              stops={config.stops}
              selectedIndex={selectedStop}
              onSelect={setSelectedStop}
              onStopMove={(i, pos) => updateStop(i, { position: pos })}
              onAddStop={addStopAtPosition}
              cssPreview={cssPreview}
            />
          </div>

          {/* Type + Direction row */}
          <div className="space-y-3">
            <TypeSelector value={config.type} onChange={v => updateConfig({ type: v })} />

            <div className="flex items-center justify-between gap-3">
              {/* Angle wheel for linear/conic */}
              {(config.type === 'linear' || config.type === 'conic') && (
                <AngleWheel angle={config.angle} onChange={a => updateConfig({ angle: a })} />
              )}

              {/* Radial shape for radial */}
              {config.type === 'radial' && (
                <div className="flex gap-2 flex-1">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Forma</Label>
                    <Select value={config.radialShape} onValueChange={v => updateConfig({ radialShape: v as any })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="circle" className="text-xs">Círculo</SelectItem>
                        <SelectItem value="ellipse" className="text-xs">Elipse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Tamanho</Label>
                    <Select value={config.radialSize} onValueChange={v => updateConfig({ radialSize: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closest-side" className="text-xs">Pequena</SelectItem>
                        <SelectItem value="closest-corner" className="text-xs">Média</SelectItem>
                        <SelectItem value="farthest-side" className="text-xs">Grande</SelectItem>
                        <SelectItem value="farthest-corner" className="text-xs">Máxima</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={reverseStops}
                  title="Inverter direção"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={addStop}
                  title="Adicionar cor"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Color stops list */}
          <div className="space-y-1 group">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Cores ({config.stops.length})
            </Label>
            <AnimatePresence mode="popLayout">
              {config.stops.map((stop, i) => (
                <StopRow
                  key={i}
                  stop={stop}
                  index={i}
                  isSelected={selectedStop === i}
                  canDelete={config.stops.length > 2}
                  onSelect={() => setSelectedStop(i)}
                  onUpdate={patch => updateStop(i, patch)}
                  onDelete={() => removeStop(i)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
