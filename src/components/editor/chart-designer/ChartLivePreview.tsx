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
      <filter id="tooltipCardShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.08" />
      </filter>
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

// ─── Custom label that shows tooltip text above the bar as a card ──────
function TooltipLabel({ x, y, width, value, index, items }: any) {
  const item = items[index];
  if (!item) return null;
  const tooltip = item.tooltip;
  const suffix = item.suffix || '';
  const cx = x + width / 2;

  if (!tooltip) {
    return (
      <text x={cx} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="hsl(var(--foreground))">
        {value}{suffix}
      </text>
    );
  }

  const cardW = Math.max(tooltip.length * 5.5, 40);
  const cardH = 22;
  const cardX = cx - cardW / 2;
  const cardY = y - cardH - 18;

  return (
    <g>
      {/* Value */}
      <text x={cx} y={y - cardH - 22} textAnchor="middle" fontSize={10} fontWeight={600} fill="hsl(var(--foreground))">
        {value}{suffix}
      </text>
      {/* Card badge */}
      <rect x={cardX} y={cardY} width={cardW} height={cardH} rx={6} ry={6}
        fill="white" stroke="hsl(var(--border))" strokeWidth={1}
        filter="url(#tooltipCardShadow)" />
      <text x={cx} y={cardY + cardH / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fontWeight={600} fill="hsl(var(--foreground))" letterSpacing={0.5}
        style={{ textTransform: 'uppercase' }}>
        {tooltip}
      </text>
    </g>
  );
}

function HorizontalTooltipLabel({ x, y, width, height, value, index, items }: any) {
  const item = items[index];
  if (!item) return null;
  const tooltip = item.tooltip;
  const suffix = item.suffix || '';
  const cy = y + height / 2;
  const textX = x + width + 6;

  if (!tooltip) {
    return (
      <text x={textX} y={cy} dominantBaseline="middle" fontSize={10} fontWeight={600} fill="hsl(var(--foreground))">
        {value}{suffix}
      </text>
    );
  }

  const cardW = Math.max(tooltip.length * 5.5, 40);
  const cardH = 18;
  const cardX = textX + String(value).length * 6 + (suffix ? suffix.length * 5 : 0) + 8;
  const cardY = cy - cardH / 2;

  return (
    <g>
      <text x={textX} y={cy} dominantBaseline="middle" fontSize={10} fontWeight={600} fill="hsl(var(--foreground))">
        {value}{suffix}
      </text>
      <rect x={cardX} y={cardY} width={cardW} height={cardH} rx={5} ry={5}
        fill="white" stroke="hsl(var(--border))" strokeWidth={1}
        filter="url(#tooltipCardShadow)" />
      <text x={cardX + cardW / 2} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={7} fontWeight={600} fill="hsl(var(--foreground))" letterSpacing={0.5}
        style={{ textTransform: 'uppercase' }}>
        {tooltip}
      </text>
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
        <BarChart data={data} margin={{ top: 50, right: 20, left: 10, bottom: 20 }}>
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
  const dur = style.animated !== false ? 400 : 0;
  const areaFillId = `lineAreaFill-multi`;
  const strokeGradId = `lineStrokeGrad-multi`;

  // Build gradient stops from each item's color, evenly spaced
  const colorStops = items.map((item, i) => ({
    offset: items.length > 1 ? (i / (items.length - 1)) * 100 : 50,
    color: getColor(item, i),
  }));

  const firstColor = colorStops[0]?.color || FALLBACK_COLORS[0];

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
          <defs>
            {/* Area fill: horizontal gradient using ALL item colors */}
            <linearGradient id={areaFillId} x1="0" y1="0" x2="1" y2="0">
              {colorStops.map((stop, i) => (
                <stop key={i} offset={`${stop.offset}%`} stopColor={stop.color} stopOpacity={0.6} />
              ))}
            </linearGradient>
            {/* Stroke: horizontal gradient using ALL item colors */}
            <linearGradient id={strokeGradId} x1="0" y1="0" x2="1" y2="0">
              {colorStops.map((stop, i) => (
                <stop key={i} offset={`${stop.offset}%`} stopColor={stop.color} stopOpacity={1} />
              ))}
            </linearGradient>
          </defs>
          {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />}
          <XAxis dataKey="name" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
          <YAxis tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey="value"
            stroke={items.length > 1 ? `url(#${strokeGradId})` : firstColor}
            strokeWidth={3}
            fill={`url(#${areaFillId})`}
            dot={({ cx, cy, index }: any) => (
              <circle key={index} cx={cx} cy={cy} r={5} fill={getColor(items[index] || items[0], index)} stroke="hsl(var(--card))" strokeWidth={3} />
            )}
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
