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

function CartesianView({ datasets, labels, style }: Omit<Props, 'mode'>) {
  const data = buildCartesianData(datasets, labels);
  const dur = style?.animated !== false ? 400 : 0;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 30, right: 10, left: -20, bottom: 5 }}>
          <defs>
            {datasets.map(ds => (
              <linearGradient key={ds.id} id={`cmp-area-${ds.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={ds.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {style?.showGrid !== false && (
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
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
            <Area
              key={ds.id}
              type="monotone"
              dataKey={ds.name}
              stroke={ds.color}
              strokeWidth={3}
              fill={`url(#cmp-area-${ds.id})`}
              dot={{ r: 5, fill: ds.color, stroke: 'hsl(var(--card))', strokeWidth: 3 }}
              activeDot={{ r: 8, strokeWidth: 3 }}
              animationDuration={dur}
              animationEasing="ease-out"
            />
          ))}
          {style?.showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
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
