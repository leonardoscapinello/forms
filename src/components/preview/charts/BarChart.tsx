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

export default function BarChart({ items }: { items: GraphicDataItem[] }) {
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
