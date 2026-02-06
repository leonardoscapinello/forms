import { GraphicDataItem } from '@/types/form';

export default function LineChart({ items }: { items: GraphicDataItem[] }) {
  if (items.length < 2) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Adicione pelo menos 2 pontos para o gráfico de linha.
      </div>
    );
  }

  const vals = items.map(i => parseFloat(i.value) || 0);
  const maxVal = Math.max(...vals, 1);
  const minVal = Math.min(...vals, 0);
  const range = maxVal - minVal || 1;

  const w = 320, h = 140, px = 35, py = 20;
  const points = vals.map((v, i) => ({
    x: px + (i / (vals.length - 1)) * (w - 2 * px),
    y: py + (1 - (v - minVal) / range) * (h - 2 * py),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  // Area fill
  const areaD = `${pathD} L${points[points.length - 1].x},${h - py} L${points[0].x},${h - py} Z`;

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 200 }}>
      <defs>
        <linearGradient id="line-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {ticks.map(f => {
        const y = py + (1 - f) * (h - 2 * py);
        return (
          <g key={f}>
            <line x1={px} x2={w - px} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth="0.5" />
            <text x={px - 4} y={y + 3} textAnchor="end" className="text-[7px] fill-muted-foreground">
              {Math.round(minVal + range * f)}
            </text>
          </g>
        );
      })}

      {/* Area */}
      <path d={areaD} fill="url(#line-area-grad)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots & labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />
          <text x={p.x} y={h - 4} textAnchor="middle" className="text-[7px] fill-muted-foreground">
            {items[i].label.length > 6 ? items[i].label.slice(0, 5) + '…' : items[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
}
