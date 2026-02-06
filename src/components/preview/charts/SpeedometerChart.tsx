import { GraphicDataItem } from '@/types/form';

const PALETTE = [
  'hsl(150 60% 45%)',
  'hsl(45 80% 50%)',
  'hsl(35 90% 55%)',
  'hsl(350 70% 55%)',
];

function getColor(item: GraphicDataItem, index: number) {
  return item.color || PALETTE[index % PALETTE.length];
}

/** Single speedometer gauge */
function Gauge({ item, index }: { item: GraphicDataItem; index: number }) {
  const val = parseFloat(item.value) || 0;
  const max = parseFloat(item.suffix || '100') || 100; // suffix used as max if numeric
  const pct = Math.min(Math.max(val / max, 0), 1);

  const cx = 60, cy = 55, r = 42;
  // Arc from 180° to 0° (bottom half = gauge)
  const startAngle = Math.PI; // 180°
  const endAngle = 0;        // 0°
  const totalArc = Math.PI;  // 180°

  // Background arc
  const bgX1 = cx + r * Math.cos(startAngle);
  const bgY1 = cy + r * Math.sin(startAngle);
  const bgX2 = cx + r * Math.cos(endAngle);
  const bgY2 = cy + r * Math.sin(endAngle);
  const bgD = `M${bgX1},${bgY1} A${r},${r} 0 0,1 ${bgX2},${bgY2}`;

  // Value arc
  const valAngle = startAngle - pct * totalArc;
  const valX = cx + r * Math.cos(valAngle);
  const valY = cy + r * Math.sin(valAngle);
  const largeArc = pct > 0.5 ? 1 : 0;
  const valD = pct > 0 ? `M${bgX1},${bgY1} A${r},${r} 0 ${largeArc},1 ${valX},${valY}` : '';

  // Needle
  const needleAngle = startAngle - pct * totalArc;
  const needleLen = r - 8;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy + needleLen * Math.sin(needleAngle);

  const color = getColor(item, index);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-full" style={{ maxWidth: 160 }}>
        {/* Background arc */}
        <path d={bgD} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" strokeLinecap="round" />

        {/* Value arc */}
        {pct > 0 && (
          <path d={valD} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            className="transition-all duration-700 ease-out" />
        )}

        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="hsl(var(--foreground))" strokeWidth="2" strokeLinecap="round"
          className="transition-all duration-700 ease-out" />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="4" fill="hsl(var(--foreground))" />

        {/* Value text */}
        <text x={cx} y={cy - 8} textAnchor="middle" className="text-[11px] font-bold fill-foreground">
          {item.value}
        </text>

        {/* Min / Max labels */}
        <text x={cx - r + 2} y={cy + 12} textAnchor="start" className="text-[6px] fill-muted-foreground">0</text>
        <text x={cx + r - 2} y={cy + 12} textAnchor="end" className="text-[6px] fill-muted-foreground">{max}</text>
      </svg>
      <span className="text-xs text-muted-foreground -mt-1">{item.label}</span>
    </div>
  );
}

export default function SpeedometerChart({ items }: { items: GraphicDataItem[] }) {
  return (
    <div className={`grid gap-4 w-full ${
      items.length === 1 ? 'grid-cols-1 max-w-[200px] mx-auto' :
      items.length === 2 ? 'grid-cols-2' :
      'grid-cols-2 sm:grid-cols-3'
    }`}>
      {items.map((item, i) => (
        <Gauge key={item.id} item={item} index={i} />
      ))}
    </div>
  );
}
