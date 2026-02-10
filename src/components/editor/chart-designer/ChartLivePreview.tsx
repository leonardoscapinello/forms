import { ChartType, GraphicDataItem, ChartStyle } from '@/types/form';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart, Legend,
} from 'recharts';

const FALLBACK_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e',
  '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
  '#8b5cf6', '#a855f7',
];

function getColor(item: GraphicDataItem, index: number) {
  return item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/** Build a unique gradient ID */
function gradId(item: GraphicDataItem, index: number) {
  const c1 = getColor(item, index).replace('#', '');
  const c2 = (item.gradientTo || '').replace('#', '');
  return `grad-${c1}-${c2}-${index}`;
}

/** Returns fill value: url(#gradId) for gradient, solid color otherwise */
function getFill(item: GraphicDataItem, index: number) {
  if (item.colorMode === 'gradient' && item.gradientTo) {
    return `url(#${gradId(item, index)})`;
  }
  return getColor(item, index);
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 12,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: '8px 12px',
  },
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
};

/** Custom legend with always-visible tooltips */
function CustomLegend({ items }: { items: GraphicDataItem[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center mt-4">
      {items.map((item, i) => (
        <div key={item.id} className="flex items-start gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
            style={{
              background: item.colorMode === 'gradient' && item.gradientTo
                ? `linear-gradient(135deg, ${getColor(item, i)}, ${item.gradientTo})`
                : getColor(item, i),
            }}
          />
          <div className="min-w-0">
            <span className="text-xs font-medium text-foreground">{item.label}</span>
            {item.tooltip && (
              <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{item.tooltip}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Generate SVG gradient defs for items that use gradient mode */
function GradientDefs({ items }: { items: GraphicDataItem[] }) {
  return (
    <defs>
      {items.map((item, i) => {
        if (item.colorMode !== 'gradient' || !item.gradientTo) return null;
        return (
          <linearGradient key={gradId(item, i)} id={gradId(item, i)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={getColor(item, i)} stopOpacity={1} />
            <stop offset="100%" stopColor={item.gradientTo} stopOpacity={1} />
          </linearGradient>
        );
      })}
    </defs>
  );
}

// ─── Custom label that shows tooltip text above the bar ──────
function TooltipLabel({ x, y, width, value, index, items }: any) {
  const item = items[index];
  if (!item) return null;
  const tooltip = item.tooltip;
  const suffix = item.suffix || '';
  const cx = x + width / 2;

  return (
    <g>
      <text x={cx} y={y - (tooltip ? 16 : 6)} textAnchor="middle" fontSize={10} fontWeight={600} fill="hsl(var(--foreground))">
        {value}{suffix}
      </text>
      {tooltip && (
        <text x={cx} y={y - 4} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
          {tooltip}
        </text>
      )}
    </g>
  );
}

function HorizontalTooltipLabel({ x, y, width, height, value, index, items }: any) {
  const item = items[index];
  if (!item) return null;
  const tooltip = item.tooltip;
  const suffix = item.suffix || '';
  const cy = y + height / 2;

  return (
    <g>
      <text x={x + width + 6} y={cy - (tooltip ? 4 : 0)} dominantBaseline="middle" fontSize={10} fontWeight={600} fill="hsl(var(--foreground))">
        {value}{suffix}
      </text>
      {tooltip && (
        <text x={x + width + 6} y={cy + 10} dominantBaseline="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
          {tooltip}
        </text>
      )}
    </g>
  );
}

// ─── Column chart (vertical bars) ───────────────────
function ColumnChart({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({ name: item.label, value: parseFloat(item.value) || 0, fill: getFill(item, i) }));
  const dur = style.animated !== false ? 400 : 0;
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 30, right: 20, left: 10, bottom: 20 }}>
          <GradientDefs items={items} />
          {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />}
          <XAxis dataKey="name" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
          <YAxis tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={dur} animationEasing="ease-out"
            label={style.showValues !== false ? (props: any) => <TooltipLabel {...props} items={items} /> : false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {style.showLegend && <CustomLegend items={items} />}
    </div>
  );
}

// ─── Bar chart (horizontal bars) ────────────────────
function HorizontalBarChart({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({ name: item.label, value: parseFloat(item.value) || 0, fill: getFill(item, i) }));
  const dur = style.animated !== false ? 400 : 0;
  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(300, items.length * 50)}>
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 60, left: 60, bottom: 10 }}>
          <GradientDefs items={items} />
          {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} opacity={0.5} />}
          <XAxis type="number" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} width={55} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} animationDuration={dur} animationEasing="ease-out"
            label={style.showValues !== false ? (props: any) => <HorizontalTooltipLabel {...props} items={items} /> : false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {style.showLegend && <CustomLegend items={items} />}
    </div>
  );
}

// ─── Line chart ─────────────────────────────────────
function LineChart({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map(item => ({ name: item.label, value: parseFloat(item.value) || 0 }));
  const color = items[0]?.color || FALLBACK_COLORS[0];
  const hasGradient = items[0]?.colorMode === 'gradient' && items[0]?.gradientTo;
  const gradientColor = hasGradient ? items[0].gradientTo! : color;
  const areaFillId = `lineAreaFill-${color.replace('#', '')}`;
  const strokeGradId = `lineStrokeGrad-${color.replace('#', '')}`;
  const dur = style.animated !== false ? 400 : 0;
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
          <defs>
            {/* Area fill: horizontal gradient with vivid colors */}
            <linearGradient id={areaFillId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={hasGradient ? 0.7 : 0.25} />
              <stop offset="100%" stopColor={hasGradient ? gradientColor : color} stopOpacity={hasGradient ? 0.7 : 0} />
            </linearGradient>
            {/* Stroke: horizontal gradient */}
            {hasGradient && (
              <linearGradient id={strokeGradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor={gradientColor} />
              </linearGradient>
            )}
          </defs>
          {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />}
          <XAxis dataKey="name" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
          <YAxis tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey="value"
            stroke={hasGradient ? `url(#${strokeGradId})` : color}
            strokeWidth={3}
            fill={`url(#${areaFillId})`}
            dot={{ fill: color, strokeWidth: 3, stroke: 'hsl(var(--card))', r: 5 }}
            activeDot={{ r: 8, strokeWidth: 3, className: 'drop-shadow-md' }}
            animationDuration={dur} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
      {style.showLegend && <CustomLegend items={items} />}
    </div>
  );
}

// ─── Pie / Donut chart ──────────────────────────────
function PieDonutChart({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({ name: item.label, value: parseFloat(item.value) || 0, fill: getFill(item, i) }));
  const dur = style.animated !== false ? 400 : 0;
  const ir = style.innerRadius ?? 45;
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <GradientDefs items={items} />
          <Pie
            data={data} cx="50%" cy="50%" outerRadius={115} innerRadius={ir} dataKey="value"
            animationDuration={dur} animationEasing="ease-out" strokeWidth={3} stroke="hsl(var(--card))"
            label={style.showLabels !== false ? ({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%` : false}
            labelLine={style.showLabels !== false ? { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 } : false}
            paddingAngle={2}
          >
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} className="drop-shadow-sm" />)}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      {style.showLegend && <CustomLegend items={items} />}
    </div>
  );
}

// ─── Main component ─────────────────────────────────
interface Props {
  chartType: ChartType;
  items: GraphicDataItem[];
  style: ChartStyle;
}

export default function ChartLivePreview({ chartType, items, style }: Props) {
  if (!items.length) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        Adicione dados para visualizar
      </div>
    );
  }

  switch (chartType) {
    case 'line':
    case 'area':
      return <LineChart items={items} style={style} />;
    case 'pie':
      return <PieDonutChart items={items} style={style} />;
    case 'bar':
      return <HorizontalBarChart items={items} style={style} />;
    case 'column':
    default:
      return <ColumnChart items={items} style={style} />;
  }
}
