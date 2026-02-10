import { ChartType, GraphicDataItem, ChartStyle } from '@/types/form';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart, Legend, RadarChart, Radar as RechartsRadar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Treemap as RechartsTreemap,
  RadialBarChart, RadialBar as RechartsRadialBar, FunnelChart, Funnel, LabelList,
} from 'recharts';

const FALLBACK_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e',
  '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
  '#8b5cf6', '#a855f7',
];

function getColor(item: GraphicDataItem, index: number) {
  return item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
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

// ─── Bar (horizontal) ───────────────────────────────
function RechartsBarH({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({ name: item.label, value: parseFloat(item.value) || 0, fill: getColor(item, i) }));
  const dur = style.animated !== false ? 400 : 0;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} opacity={0.5} />}
        <XAxis type="number" tick={style.showLabels !== false ? { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
        <YAxis dataKey="name" type="category" tick={style.showLabels !== false ? { fontSize: 11, fill: 'hsl(var(--foreground))' } : false} width={55} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
        {style.showLegend && <Legend />}
        <Bar dataKey="value" radius={[0, 8, 8, 0]} animationDuration={dur} animationEasing="ease-out"
          label={style.showValues !== false ? { position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Column (vertical) ──────────────────────────────
function RechartsColumn({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({ name: item.label, value: parseFloat(item.value) || 0, fill: getColor(item, i) }));
  const dur = style.animated !== false ? 400 : 0;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
        {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />}
        <XAxis dataKey="name" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
        <YAxis tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
        {style.showLegend && <Legend />}
        <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={dur} animationEasing="ease-out"
          label={style.showValues !== false ? { position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 } : false}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Pie / Donut ────────────────────────────────────
function RechartsPie({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({ name: item.label, value: parseFloat(item.value) || 0, fill: getColor(item, i) }));
  const dur = style.animated !== false ? 400 : 0;
  const ir = style.innerRadius ?? 45;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
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
        {style.showLegend && <Legend iconType="circle" iconSize={8} />}
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Line ───────────────────────────────────────────
function RechartsLine({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map(item => ({ name: item.label, value: parseFloat(item.value) || 0 }));
  const color = items[0]?.color || FALLBACK_COLORS[0];
  const dur = style.animated !== false ? 400 : 0;
  const gradId = `lineGrad-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />}
        <XAxis dataKey="name" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
        <YAxis tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        {style.showLegend && <Legend />}
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={3} fill={`url(#${gradId})`}
          dot={{ fill: color, strokeWidth: 3, stroke: 'hsl(var(--card))', r: 5 }}
          activeDot={{ r: 8, strokeWidth: 3, className: 'drop-shadow-md' }}
          animationDuration={dur} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Area (filled, stacked look — visually distinct from line) ────
function RechartsArea({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({ name: item.label, value: parseFloat(item.value) || 0, fill: getColor(item, i) }));
  const dur = style.animated !== false ? 400 : 0;
  // Use multiple stacked areas with different colors for each segment
  const color1 = getColor(items[0], 0);
  const color2 = items.length > 1 ? getColor(items[Math.floor(items.length / 2)], Math.floor(items.length / 2)) : color1;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
        <defs>
          <linearGradient id="areaGradFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color1} stopOpacity={0.6} />
            <stop offset="50%" stopColor={color2} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color1} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />}
        <XAxis dataKey="name" tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
        <YAxis tick={style.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        {style.showLegend && <Legend />}
        <Area type="natural" dataKey="value" stroke={color1} strokeWidth={2}
          fill="url(#areaGradFill)" fillOpacity={1}
          dot={false}
          activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))', fill: color1 }}
          animationDuration={dur} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Radar ──────────────────────────────────────────
function RechartsRadarChart({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map(item => ({ subject: item.label, value: parseFloat(item.value) || 0 }));
  const color = items[0]?.color || FALLBACK_COLORS[0];
  const dur = style.animated !== false ? 400 : 0;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
        <PolarGrid stroke="hsl(var(--border))" opacity={0.6} />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
        {style.showLabels !== false && <PolarRadiusAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />}
        <RechartsRadar name="Valor" dataKey="value" stroke={color} fill={color} fillOpacity={0.2}
          strokeWidth={2.5} animationDuration={dur} animationEasing="ease-out"
          dot={{ fill: color, strokeWidth: 2, stroke: 'hsl(var(--card))', r: 4 }} />
        <Tooltip {...tooltipStyle} />
        {style.showLegend && <Legend />}
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Funnel ─────────────────────────────────────────
function RechartsFunnel({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({
    name: item.label,
    value: parseFloat(item.value) || 0,
    fill: getColor(item, i),
  }));
  const dur = style.animated !== false ? 400 : 0;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <FunnelChart>
        <Tooltip {...tooltipStyle} />
        <Funnel dataKey="value" data={data} animationDuration={dur} animationEasing="ease-out">
          {style.showLabels !== false && <LabelList position="right" fill="hsl(var(--foreground))" fontSize={11} fontWeight={500} />}
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

// ─── Waterfall ──────────────────────────────────────
function WaterfallChart({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const dur = style.animated !== false ? 400 : 0;
  let cumulative = 0;
  const data = items.map((item, i) => {
    const val = parseFloat(item.value) || 0;
    const start = cumulative;
    cumulative += val;
    return {
      name: item.label,
      start: Math.min(start, cumulative),
      end: Math.max(start, cumulative),
      value: val,
      fill: val >= 0 ? (getColor(item, i)) : '#ef4444',
    };
  });
  // Add total
  data.push({ name: 'Total', start: 0, end: cumulative, value: cumulative, fill: '#6366f1' });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
        {style.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />}
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="start" stackId="a" fill="transparent" animationDuration={0} />
        <Bar dataKey="end" stackId="a" radius={[6, 6, 0, 0]} animationDuration={dur} animationEasing="ease-out"
          label={style.showValues !== false ? { position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 } : false}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Treemap ────────────────────────────────────────
function TreemapChart({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({
    name: item.label,
    size: parseFloat(item.value) || 0,
    fill: getColor(item, i),
  }));
  const dur = style.animated !== false ? 300 : 0;

  const CustomContent = (props: any) => {
    const { x, y, width, height, name, fill } = props;
    if (width < 20 || height < 20) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill} rx={6} ry={6} stroke="hsl(var(--card))" strokeWidth={3} />
        {width > 50 && height > 30 && (
          <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central"
            fill="white" fontSize={Math.min(12, width / 6)} fontWeight={600} className="drop-shadow-sm">
            {name}
          </text>
        )}
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsTreemap
        data={data} dataKey="size" nameKey="name"
        animationDuration={dur} animationEasing="ease-out"
        content={<CustomContent />}
      >
        <Tooltip {...tooltipStyle} />
      </RechartsTreemap>
    </ResponsiveContainer>
  );
}

// ─── Radial Bar ─────────────────────────────────────
function RadialBarPreview({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const data = items.map((item, i) => ({
    name: item.label,
    value: parseFloat(item.value) || 0,
    fill: getColor(item, i),
  })).reverse();
  const dur = style.animated !== false ? 400 : 0;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={data} startAngle={180} endAngle={0}>
        <RechartsRadialBar background={{ fill: 'hsl(var(--muted))' }} dataKey="value"
          animationDuration={dur} animationEasing="ease-out" cornerRadius={8}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </RechartsRadialBar>
        <Tooltip {...tooltipStyle} />
        {style.showLegend !== false && <Legend iconType="circle" iconSize={8} layout="vertical" verticalAlign="middle" align="right" />}
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

// ─── Thermometer ────────────────────────────────────
function ThermometerPreview({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const maxVal = Math.max(...items.map(i => parseFloat(i.value) || 0), 1);
  const animated = style.animated !== false;
  return (
    <div className="flex items-end gap-8 justify-center w-full py-6 min-h-[300px]">
      {items.map((item, i) => {
        const val = parseFloat(item.value) || 0;
        const pct = Math.min((val / maxVal) * 100, 100);
        const color = getColor(item, i);
        return (
          <motion.div key={item.id}
            initial={animated ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            className="flex flex-col items-center gap-2"
          >
            {style.showValues !== false && (
              <span className="text-sm font-bold text-foreground tabular-nums">{item.value}{item.suffix || ''}</span>
            )}
            <div className="relative w-8 rounded-t-full overflow-hidden" style={{ height: 150 }}>
              <div className="absolute inset-0 bg-muted rounded-t-full" />
              <motion.div className="absolute bottom-0 left-0 right-0 rounded-t-full" style={{ backgroundColor: color }}
                initial={animated ? { height: 0 } : { height: `${pct}%` }}
                animate={{ height: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }} />
              <div className="absolute inset-y-0 left-0.5 w-1.5 bg-white/20 rounded-full" />
            </div>
            <div className="w-12 h-12 rounded-full -mt-3 border-4 border-card shadow-lg" style={{ backgroundColor: color }} />
            {style.showLabels !== false && (
              <span className="text-[11px] text-muted-foreground text-center max-w-[70px] truncate">{item.label}</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Speedometer ────────────────────────────────────
function SpeedometerPreview({ items, style }: { items: GraphicDataItem[]; style: ChartStyle }) {
  const animated = style.animated !== false;
  return (
    <div className={`grid gap-6 w-full min-h-[300px] items-center justify-items-center ${
      items.length === 1 ? 'grid-cols-1 max-w-[260px] mx-auto' :
      items.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
    }`}>
      {items.map((item, i) => {
        const val = parseFloat(item.value) || 0;
        const max = parseFloat(item.suffix || '100') || 100;
        const pct = Math.min(Math.max(val / max, 0), 1);
        const color = getColor(item, i);
        const cx = 70, cy = 70, r = 50;
        // Arc goes from left (180°) to right (0°) — top half
        const startAngle = Math.PI; // left
        const valAngle = startAngle - pct * Math.PI; // progress clockwise
        const bgX1 = cx + r * Math.cos(Math.PI); // left point
        const bgX2 = cx + r * Math.cos(0); // right point
        const bgD = `M${bgX1},${cy} A${r},${r} 0 0,1 ${bgX2},${cy}`;
        // Value arc: from left towards right based on pct
        const valEndX = cx + r * Math.cos(valAngle);
        const valEndY = cy - r * Math.sin(valAngle); // subtract because SVG y is inverted for upper half
        const largeArc = pct > 0.5 ? 1 : 0;
        const valD = pct > 0 ? `M${bgX1},${cy} A${r},${r} 0 ${largeArc},0 ${valEndX},${valEndY}` : '';
        // Needle
        const needleLen = r - 10;
        const needleX = cx + needleLen * Math.cos(valAngle);
        const needleY = cy - needleLen * Math.sin(valAngle);

        return (
          <motion.div key={item.id}
            initial={animated ? { opacity: 0, scale: 0.95 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, duration: 0.2 }}
            className="flex flex-col items-center"
          >
            <svg viewBox="0 0 140 90" className="w-full" style={{ maxWidth: 220 }}>
              <defs>
                <filter id={`glow-${i}`}><feGaussianBlur stdDeviation="2" result="coloredBlur" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              {/* Background arc */}
              <path d={bgD} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeLinecap="round" />
              {/* Value arc */}
              {pct > 0 && (
                <path d={valD} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" filter={`url(#glow-${i})`} />
              )}
              {/* Needle */}
              <motion.line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round"
                initial={animated ? { x2: bgX1, y2: cy } : { x2: needleX, y2: needleY }}
                animate={{ x2: needleX, y2: needleY }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }} />
              {/* Center dot */}
              <circle cx={cx} cy={cy} r="5" fill="hsl(var(--foreground))" />
              {/* Value text */}
              {style.showValues !== false && (
                <text x={cx} y={cy - 16} textAnchor="middle" className="text-[14px] font-bold fill-foreground">{item.value}</text>
              )}
              {/* Min/max labels */}
              <text x={cx - r + 4} y={cy + 14} className="text-[7px] fill-muted-foreground">0</text>
              <text x={cx + r - 4} y={cy + 14} textAnchor="end" className="text-[7px] fill-muted-foreground">{max}</text>
            </svg>
            {style.showLabels !== false && (
              <span className="text-xs text-muted-foreground -mt-1">{item.label}</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────
interface Props {
  chartType: ChartType;
  items: GraphicDataItem[];
  style?: ChartStyle;
}

export default function ChartLivePreview({ chartType, items, style = {} }: Props) {
  if (!items?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-10">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl">📊</div>
        <p className="text-xs">Adicione dados para ver o gráfico</p>
      </div>
    );
  }

  const renderers: Record<ChartType, React.FC<{ items: GraphicDataItem[]; style: ChartStyle }>> = {
    bar: RechartsBarH,
    column: RechartsColumn,
    pie: RechartsPie,
    line: RechartsLine,
    area: RechartsArea,
    radar: RechartsRadarChart,
    funnel: RechartsFunnel,
    waterfall: WaterfallChart,
    treemap: TreemapChart,
    radialBar: RadialBarPreview,
    thermometer: ThermometerPreview,
    speedometer: SpeedometerPreview,
  };

  const Renderer = renderers[chartType];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${chartType}-${items.length}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="w-full"
      >
        <Renderer items={items} style={style} />
      </motion.div>
    </AnimatePresence>
  );
}
