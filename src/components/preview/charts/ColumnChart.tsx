import { GraphicDataItem } from '@/types/form';

const PALETTE = [
  'hsl(var(--primary))',
  'hsl(220 70% 55%)',
  'hsl(150 60% 45%)',
  'hsl(35 90% 55%)',
  'hsl(350 70% 55%)',
  'hsl(270 60% 55%)',
];

function getColor(item: GraphicDataItem, index: number) {
  return item.color || PALETTE[index % PALETTE.length];
}

export default function ColumnChart({ items }: { items: GraphicDataItem[] }) {
  const maxVal = Math.max(...items.map(i => parseFloat(i.value) || 0), 1);
  const barCount = items.length;
  const w = 320;
  const h = 180;
  const px = 35;
  const py = 20;
  const chartW = w - 2 * px;
  const chartH = h - 2 * py;
  const barW = Math.min(40, (chartW / barCount) * 0.6);
  const gap = (chartW - barW * barCount) / (barCount + 1);

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Grid lines */}
      {ticks.map(f => {
        const y = py + chartH * (1 - f);
        return (
          <g key={f}>
            <line x1={px} x2={w - px} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth="0.5" />
            <text x={px - 4} y={y + 3} textAnchor="end" className="text-[7px] fill-muted-foreground">
              {Math.round(maxVal * f)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {items.map((item, i) => {
        const val = parseFloat(item.value) || 0;
        const barH = (val / maxVal) * chartH;
        const x = px + gap + i * (barW + gap);
        const y = py + chartH - barH;
        return (
          <g key={item.id}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={3}
              fill={getColor(item, i)}
              className="transition-all duration-500"
            />
            <text
              x={x + barW / 2}
              y={h - 4}
              textAnchor="middle"
              className="text-[7px] fill-muted-foreground"
            >
              {item.label.length > 8 ? item.label.slice(0, 7) + '…' : item.label}
            </text>
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              className="text-[7px] fill-foreground font-medium"
            >
              {item.value}{item.suffix || ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
