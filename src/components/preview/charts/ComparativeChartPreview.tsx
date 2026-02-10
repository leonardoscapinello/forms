import { ComparativeDataset, ComparativeChartMode } from '@/types/pageElements';
import { ChartStyle } from '@/types/form';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

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

interface Props {
  datasets: ComparativeDataset[];
  labels: string[];
  mode: ComparativeChartMode;
  style?: ChartStyle;
}

function buildCartesianData(datasets: ComparativeDataset[], labels: string[]) {
  return labels.map((label, i) => {
    const entry: Record<string, any> = { name: label };
    datasets.forEach(ds => {
      entry[ds.name] = parseFloat(ds.points[i]?.value || '0') || 0;
    });
    return entry;
  });
}

/** Badge gradient palettes per dataset index */
const BADGE_GRADIENTS = [
  ['#f59e0b', '#ef4444'],   // amber → red
  ['#22c55e', '#3b82f6'],   // green → blue
  ['#a855f7', '#ec4899'],   // purple → pink
  ['#06b6d4', '#f59e0b'],   // cyan → amber
  ['#ef4444', '#a855f7'],   // red → purple
];

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const ca = parse(a), cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function CartesianView({ datasets, labels, style }: Omit<Props, 'mode'>) {
  const data = buildCartesianData(datasets, labels);
  const dur = style?.animated !== false ? 400 : 0;

  // Compute max value for Y axis
  const allValues = datasets.flatMap(ds => ds.points.map(p => parseFloat(p.value) || 0));
  const maxVal = Math.max(...allValues, 1);
  const niceMax = Math.ceil(maxVal / 25) * 25 || 100;

  // No longer need badgeIndex — badges are per-point via point.tooltip

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 40, right: 20, left: 5, bottom: 5 }}>
          <defs>
            <filter id="cmpBadgeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.12" />
            </filter>
            {datasets.map((ds, di) => (
              <linearGradient key={`area-${ds.id}`} id={`cmp-area-${ds.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ds.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {style?.showGrid !== false && (
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          )}
          <XAxis
            dataKey="name"
            tick={style?.showLabels !== false ? { fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 } : false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
          />
          <YAxis
            tick={style?.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false}
            axisLine={false}
            tickLine={false}
            width={30}
            domain={[0, niceMax]}
            ticks={Array.from({ length: 5 }, (_, i) => Math.round((niceMax / 4) * i))}
          />
          <Tooltip {...tooltipStyle} />
          {datasets.map((ds, di) => (
            <Area
              key={ds.id}
              type="monotone"
              dataKey={ds.name}
              stroke={ds.color}
              strokeWidth={3}
              fill={`url(#cmp-area-${ds.id})`}
              dot={(props: any) => {
                const { cx, cy, index } = props;
                const point = ds.points[index];
                const grad = BADGE_GRADIENTS[di % BADGE_GRADIENTS.length];
                const t = labels.length > 1 ? index / (labels.length - 1) : 0;
                const badgeColor = lerpColor(grad[0], grad[1], t);
                const tipText = point?.tooltip || '';
                const showBadge = !!tipText;
                const badgeW = Math.max(tipText.length * 7 + 16, 50);
                const badgeH = 26;

                return (
                  <g key={`${ds.id}-${index}`}>
                    {/* Outer glow */}
                    <circle cx={cx} cy={cy} r={8} fill={ds.color} opacity={0.15} />
                    {/* Dot */}
                    <circle cx={cx} cy={cy} r={5} fill={ds.color} stroke="white" strokeWidth={3} />
                    {/* Floating badge — shown on every point that has a tooltip */}
                    {showBadge && (
                      <g>
                        <rect
                          x={cx - badgeW / 2}
                          y={cy - badgeH - 14}
                          width={badgeW}
                          height={badgeH}
                          rx={badgeH / 2}
                          fill={badgeColor}
                          filter="url(#cmpBadgeShadow)"
                        />
                        <text
                          x={cx}
                          y={cy - badgeH / 2 - 14 + 1}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={11}
                          fontWeight={700}
                          fill="white"
                        >
                          {tipText}
                        </text>
                      </g>
                    )}
                  </g>
                );
              }}
              activeDot={{ r: 8, strokeWidth: 3, stroke: 'white', fill: ds.color }}
              animationDuration={dur}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarView({ datasets, labels, style }: Omit<Props, 'mode'>) {
  const data = buildCartesianData(datasets, labels);
  const dur = style?.animated !== false ? 400 : 0;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 30, right: 10, left: -20, bottom: 5 }}>
          {style?.showGrid !== false && (
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
          )}
          <XAxis
            dataKey="name"
            tick={style?.showLabels !== false ? { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } : false}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
          <Tooltip {...tooltipStyle} />
          {datasets.map(ds => (
            <Bar
              key={ds.id}
              dataKey={ds.name}
              fill={ds.color}
              radius={[6, 6, 0, 0]}
              animationDuration={dur}
              animationEasing="ease-out"
            />
          ))}
          {style?.showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Point-level colors for segments */
const SEGMENT_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#ec4899'];

function CircularView({ datasets, labels, style }: { datasets: ComparativeDataset[]; labels: string[]; style?: ChartStyle }) {
  const dur = style?.animated !== false ? 400 : 0;

  // Each dataset becomes a concentric ring; each point = a colored segment + gray remainder
  // We'll build pie data where each ring has colored segments proportional to value, and one gray "remaining" segment
  const maxPerRing = 100; // Assume percentage-based; use sum if values exceed 100

  const rings = datasets.map((ds, di) => {
    const points = ds.points.map((p, pi) => ({
      name: p.label || labels[pi] || `#${pi + 1}`,
      value: parseFloat(p.value) || 0,
      color: SEGMENT_COLORS[pi % SEGMENT_COLORS.length],
    }));
    const total = points.reduce((s, p) => s + p.value, 0);
    const cappedTotal = Math.min(total, maxPerRing);
    const remaining = Math.max(0, maxPerRing - cappedTotal);
    const data = [
      ...points.map(p => ({ ...p, value: Math.max(0, p.value) })),
      ...(remaining > 0 ? [{ name: 'remaining', value: remaining, color: '#d1d5db' }] : []),
    ];
    return { ds, data, di };
  });

  const outerBase = 115;
  const ringWidth = 28;
  const ringGap = 6;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          {rings.map((ring, ri) => {
            const outer = outerBase - ri * (ringWidth + ringGap);
            const inner = outer - ringWidth;
            return (
              <Pie
                key={ring.ds.id}
                data={ring.data}
                cx="50%"
                cy="50%"
                outerRadius={outer}
                innerRadius={Math.max(inner, 10)}
                dataKey="value"
                animationDuration={dur}
                animationEasing="ease-out"
                strokeWidth={2}
                stroke="hsl(var(--card))"
                startAngle={90}
                endAngle={-270}
                paddingAngle={1}
                label={false}
                labelLine={false}
              >
                {ring.data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            );
          })}
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>

      {/* Custom legend grid */}
      <div className="flex flex-col gap-2 mt-2 px-2">
        {datasets.map((ds, di) => (
          <div key={ds.id} className="flex items-center gap-4 flex-wrap">
            {ds.points.map((pt, pi) => (
              <div key={pt.id} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: di === 0 ? SEGMENT_COLORS[pi % SEGMENT_COLORS.length] : '#9ca3af' }}
                />
                <span className="text-xs text-muted-foreground">{labels[pi] || pt.label}</span>
                <span className="text-xs font-semibold">{pt.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparativeChartPreview({ datasets, labels, mode, style }: Props) {
  if (!datasets?.length) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        Adicione conjuntos de dados para visualizar
      </div>
    );
  }

  switch (mode) {
    case 'bar':
      return <BarView datasets={datasets} labels={labels} style={style} />;
    case 'circular':
      return <CircularView datasets={datasets} labels={labels} style={style} />;
    case 'cartesian':
    default:
      return <CartesianView datasets={datasets} labels={labels} style={style} />;
  }
}
