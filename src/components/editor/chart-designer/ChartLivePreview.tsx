import { useMemo } from 'react';
import { ChartType, GraphicDataItem } from '@/types/form';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, 
} from 'recharts';

const FALLBACK_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e',
  '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
];

function getColor(item: GraphicDataItem, index: number) {
  return item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function RechartsBar({ items }: { items: GraphicDataItem[] }) {
  const data = items.map((item, i) => ({
    name: item.label,
    value: parseFloat(item.value) || 0,
    fill: getColor(item, i),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} width={55} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={800} animationEasing="ease-out">
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RechartsColumn({ items }: { items: GraphicDataItem[] }) {
  const data = items.map((item, i) => ({
    name: item.label,
    value: parseFloat(item.value) || 0,
    fill: getColor(item, i),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out">
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RechartsPie({ items }: { items: GraphicDataItem[] }) {
  const data = items.map((item, i) => ({
    name: item.label,
    value: parseFloat(item.value) || 0,
    fill: getColor(item, i),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={45}
          dataKey="value"
          animationDuration={800}
          animationEasing="ease-out"
          strokeWidth={2}
          stroke="hsl(var(--card))"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
        >
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RechartsLine({ items }: { items: GraphicDataItem[] }) {
  const data = items.map((item) => ({
    name: item.label,
    value: parseFloat(item.value) || 0,
  }));
  const color = items[0]?.color || FALLBACK_COLORS[0];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={3}
          fill="url(#lineGrad)"
          dot={{ fill: color, strokeWidth: 2, stroke: 'hsl(var(--card))', r: 5 }}
          activeDot={{ r: 7, strokeWidth: 3 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** SVG Thermometer (custom, no recharts) */
function ThermometerPreview({ items }: { items: GraphicDataItem[] }) {
  const maxVal = Math.max(...items.map(i => parseFloat(i.value) || 0), 1);

  return (
    <div className="flex items-end gap-8 justify-center w-full py-6 min-h-[280px]">
      {items.map((item, i) => {
        const val = parseFloat(item.value) || 0;
        const pct = Math.min((val / maxVal) * 100, 100);
        const color = getColor(item, i);

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-sm font-bold text-foreground">{item.value}{item.suffix || ''}</span>
            <div className="relative w-8 rounded-t-full overflow-hidden" style={{ height: 140 }}>
              <div className="absolute inset-0 bg-muted rounded-t-full" />
              <motion.div
                className="absolute bottom-0 left-0 right-0 rounded-t-full"
                style={{ backgroundColor: color }}
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 }}
              />
              <div className="absolute inset-y-0 left-0.5 w-1.5 bg-white/20 rounded-full" />
            </div>
            <div
              className="w-12 h-12 rounded-full -mt-3 border-4 border-card shadow-md"
              style={{ backgroundColor: color }}
            />
            <span className="text-[11px] text-muted-foreground text-center max-w-[70px] truncate">{item.label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** SVG Speedometer (custom) */
function SpeedometerPreview({ items }: { items: GraphicDataItem[] }) {
  return (
    <div className={`grid gap-6 w-full min-h-[280px] items-center ${
      items.length === 1 ? 'grid-cols-1 max-w-[240px] mx-auto' :
      items.length === 2 ? 'grid-cols-2' :
      'grid-cols-2 sm:grid-cols-3'
    }`}>
      {items.map((item, i) => {
        const val = parseFloat(item.value) || 0;
        const max = parseFloat(item.suffix || '100') || 100;
        const pct = Math.min(Math.max(val / max, 0), 1);
        const color = getColor(item, i);

        const cx = 70, cy = 65, r = 50;
        const startAngle = Math.PI;
        const valAngle = startAngle - pct * Math.PI;

        const bgX1 = cx + r * Math.cos(Math.PI);
        const bgY1 = cy + r * Math.sin(Math.PI);
        const bgX2 = cx + r * Math.cos(0);
        const bgD = `M${bgX1},${bgY1} A${r},${r} 0 0,1 ${bgX2},${bgY1}`;

        const valX = cx + r * Math.cos(valAngle);
        const valY = cy + r * Math.sin(valAngle);
        const largeArc = pct > 0.5 ? 1 : 0;
        const valD = pct > 0 ? `M${bgX1},${bgY1} A${r},${r} 0 ${largeArc},1 ${valX},${valY}` : '';

        const needleLen = r - 10;
        const nx = cx + needleLen * Math.cos(valAngle);
        const ny = cy + needleLen * Math.sin(valAngle);

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.12 }}
            className="flex flex-col items-center"
          >
            <svg viewBox="0 0 140 80" className="w-full" style={{ maxWidth: 200 }}>
              <path d={bgD} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeLinecap="round" />
              {pct > 0 && (
                <motion.path
                  d={valD}
                  fill="none"
                  stroke={color}
                  strokeWidth="10"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 }}
                />
              )}
              <motion.line
                x1={cx} y1={cy} x2={nx} y2={ny}
                stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round"
                initial={{ x2: cx + needleLen * Math.cos(Math.PI), y2: cy + needleLen * Math.sin(Math.PI) }}
                animate={{ x2: nx, y2: ny }}
                transition={{ duration: 1, ease: 'easeOut', delay: i * 0.1 }}
              />
              <circle cx={cx} cy={cy} r="5" fill="hsl(var(--foreground))" />
              <text x={cx} y={cy - 10} textAnchor="middle" className="text-[13px] font-bold fill-foreground">
                {item.value}
              </text>
              <text x={cx - r + 4} y={cy + 14} className="text-[7px] fill-muted-foreground">0</text>
              <text x={cx + r - 4} y={cy + 14} textAnchor="end" className="text-[7px] fill-muted-foreground">{max}</text>
            </svg>
            <span className="text-xs text-muted-foreground -mt-1">{item.label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

const CHART_RENDERERS: Record<ChartType, React.FC<{ items: GraphicDataItem[] }>> = {
  bar: RechartsBar,
  column: RechartsColumn,
  pie: RechartsPie,
  line: RechartsLine,
  thermometer: ThermometerPreview,
  speedometer: SpeedometerPreview,
};

interface Props {
  chartType: ChartType;
  items: GraphicDataItem[];
}

export default function ChartLivePreview({ chartType, items }: Props) {
  const Renderer = CHART_RENDERERS[chartType];

  if (!items?.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Adicione dados para ver o gráfico
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={chartType}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="w-full h-full flex items-center justify-center p-4"
      >
        <Renderer items={items} />
      </motion.div>
    </AnimatePresence>
  );
}
