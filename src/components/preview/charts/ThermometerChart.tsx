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

export default function ThermometerChart({ items }: { items: GraphicDataItem[] }) {
  const maxVal = Math.max(...items.map(i => parseFloat(i.value) || 0), 1);

  return (
    <div className="flex items-end gap-6 justify-center w-full py-4">
      {items.map((item, i) => {
        const val = parseFloat(item.value) || 0;
        const pct = Math.min((val / maxVal) * 100, 100);
        const color = getColor(item, i);

        return (
          <div key={item.id} className="flex flex-col items-center gap-2">
            {/* Value label */}
            <span className="text-xs font-semibold text-foreground">{item.value}{item.suffix || ''}</span>

            {/* Thermometer body */}
            <div className="relative w-7 rounded-t-full overflow-hidden" style={{ height: 120 }}>
              {/* Background tube */}
              <div className="absolute inset-0 bg-muted rounded-t-full" />
              {/* Fill */}
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-full transition-all duration-700 ease-out"
                style={{
                  height: `${pct}%`,
                  backgroundColor: color,
                }}
              />
              {/* Glass highlight */}
              <div className="absolute inset-y-0 left-0.5 w-1.5 bg-white/20 rounded-full" />
            </div>

            {/* Bulb */}
            <div
              className="w-10 h-10 rounded-full -mt-3 border-4 border-card shadow-sm flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <div className="w-4 h-4 rounded-full bg-white/20" />
            </div>

            {/* Label */}
            <span className="text-[10px] text-muted-foreground text-center max-w-[60px] truncate">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
