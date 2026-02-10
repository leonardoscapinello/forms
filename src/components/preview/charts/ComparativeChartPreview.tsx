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

/** Badge colors for dataset labels */
const BADGE_COLORS = [
  '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#64748b',
];

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
                const badgeColor = BADGE_COLORS[di % BADGE_COLORS.length];
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

function CircularView({ datasets, style }: { datasets: ComparativeDataset[]; style?: ChartStyle }) {
  // Each dataset becomes a pie ring
  const dur = style?.animated !== false ? 400 : 0;
  const total = datasets.reduce((sum, ds) => {
    return sum + ds.points.reduce((s, p) => s + (parseFloat(p.value) || 0), 0);
  }, 0) || 1;

  const data = datasets.map(ds => ({
    name: ds.name,
    value: ds.points.reduce((s, p) => s + (parseFloat(p.value) || 0), 0),
    color: ds.color,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={115}
            innerRadius={50}
            dataKey="value"
            animationDuration={dur}
            animationEasing="ease-out"
            strokeWidth={3}
            stroke="hsl(var(--card))"
            label={style?.showLabels !== false ? ({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%` : false}
            labelLine={style?.showLabels !== false ? { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 } : false}
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
          {style?.showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </PieChart>
      </ResponsiveContainer>
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
      return <CircularView datasets={datasets} style={style} />;
    case 'cartesian':
    default:
      return <CartesianView datasets={datasets} labels={labels} style={style} />;
  }
}
