import { GraphicDataItem } from '@/types/form';

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

export default function PieChart({ items }: { items: GraphicDataItem[] }) {
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
