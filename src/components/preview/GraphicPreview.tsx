import { GraphicVariant, ChartType, GraphicDataItem } from '@/types/form';

interface Props {
  variant: GraphicVariant;
  chartType?: ChartType;
  items: GraphicDataItem[];
  title?: string;
  description?: string;
}

const PALETTE = [
  'hsl(var(--primary))',
  'hsl(220 70% 55%)',
  'hsl(150 60% 45%)',
  'hsl(35 90% 55%)',
  'hsl(350 70% 55%)',
  'hsl(270 60% 55%)',
  'hsl(180 50% 45%)',
  'hsl(45 80% 50%)',
];

function getColor(item: GraphicDataItem, index: number) {
  return item.color || PALETTE[index % PALETTE.length];
}

/** Bar chart */
function BarChart({ items }: { items: GraphicDataItem[] }) {
  const maxVal = Math.max(...items.map(i => parseFloat(i.value) || 0), 1);

  return (
    <div className="space-y-3 w-full">
      {items.map((item, i) => {
        const val = parseFloat(item.value) || 0;
        const pct = (val / maxVal) * 100;
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-foreground font-medium">{item.label}</span>
              <span className="text-muted-foreground">{item.value}{item.suffix}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, backgroundColor: getColor(item, i) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Pie chart (SVG) */
function PieChart({ items }: { items: GraphicDataItem[] }) {
  const total = items.reduce((s, i) => s + (parseFloat(i.value) || 0), 0) || 1;
  let cumAngle = -90;

  const slices = items.map((item, i) => {
    const val = parseFloat(item.value) || 0;
    const angle = (val / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);

    const d = items.length === 1
      ? `M50,50 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0`
      : `M50,50 L${x1},${y1} A40,40 0 ${largeArc},1 ${x2},${y2} Z`;

    return { d, color: getColor(item, i), label: item.label, pct: Math.round((val / total) * 100) };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-32 h-32 flex-shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} className="transition-all duration-500" />
        ))}
      </svg>
      <div className="space-y-1.5">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-foreground">{s.label}</span>
            <span className="text-muted-foreground">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Line chart (SVG) */
function LineChart({ items }: { items: GraphicDataItem[] }) {
  if (items.length < 2) return <BarChart items={items} />;

  const vals = items.map(i => parseFloat(i.value) || 0);
  const maxVal = Math.max(...vals, 1);
  const minVal = Math.min(...vals, 0);
  const range = maxVal - minVal || 1;

  const w = 300, h = 120, px = 30, py = 15;
  const points = vals.map((v, i) => ({
    x: px + (i / (vals.length - 1)) * (w - 2 * px),
    y: py + (1 - (v - minVal) / range) * (h - 2 * py),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 180 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={px} x2={w - px} y1={py + f * (h - 2 * py)} y2={py + f * (h - 2 * py)}
            stroke="hsl(var(--border))" strokeWidth="0.5" />
        ))}
        {/* Line */}
        <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots + labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="hsl(var(--primary))" />
            <text x={p.x} y={h - 2} textAnchor="middle" className="text-[8px] fill-muted-foreground">{items[i].label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Timeline */
function Timeline({ items }: { items: GraphicDataItem[] }) {
  return (
    <div className="relative pl-6 space-y-6 w-full">
      {/* Vertical line */}
      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
      {items.map((item, i) => (
        <div key={item.id} className="relative">
          <div className="absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-primary bg-card flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{item.value}</p>
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Steps / Progress */
function Steps({ items }: { items: GraphicDataItem[] }) {
  return (
    <div className="space-y-4 w-full">
      {items.map((item, i) => (
        <div key={item.id} className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg">
            {item.icon || (i + 1)}
          </div>
          <div className="pt-1">
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** KPI cards */
function KpiCards({ items }: { items: GraphicDataItem[] }) {
  return (
    <div className={`grid gap-4 w-full ${items.length <= 2 ? 'grid-cols-2' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {items.map((item, i) => (
        <div key={item.id} className="rounded-xl border border-border bg-card p-4 text-center space-y-1">
          {item.icon && <span className="text-2xl">{item.icon}</span>}
          <p className="text-2xl font-bold text-foreground">
            {item.value}{item.suffix}
          </p>
          <p className="text-xs text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function GraphicPreview({ variant, chartType = 'bar', items, title, description }: Props) {
  if (!items?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum dado configurado
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-lg">
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {variant === 'chart' && chartType === 'bar' && <BarChart items={items} />}
      {variant === 'chart' && chartType === 'pie' && <PieChart items={items} />}
      {variant === 'chart' && chartType === 'line' && <LineChart items={items} />}
      {variant === 'timeline' && <Timeline items={items} />}
      {variant === 'steps' && <Steps items={items} />}
      {variant === 'kpis' && <KpiCards items={items} />}
    </div>
  );
}
