import { GraphicVariant, ChartType, GraphicDataItem, ChartStyle } from '@/types/form';
import ChartLivePreview from '@/components/editor/chart-designer/ChartLivePreview';

interface Props {
  variant: GraphicVariant;
  chartType?: ChartType;
  items: GraphicDataItem[];
  title?: string;
  description?: string;
  chartStyle?: ChartStyle;
}

/** Timeline */
function Timeline({ items }: { items: GraphicDataItem[] }) {
  return (
    <div className="relative pl-6 space-y-6 w-full">
      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
      {items.map((item) => (
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
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-border bg-card p-4 text-center space-y-1">
          {item.icon && <span className="text-2xl">{item.icon}</span>}
          <p className="text-2xl font-bold text-foreground">{item.value}{item.suffix}</p>
          <p className="text-xs text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function GraphicPreview({ variant, chartType = 'bar', items, title, description, chartStyle = {} }: Props) {
  if (!items?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum dado configurado
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-lg" style={{ minWidth: 0 }}>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {variant === 'chart' && (
        <div className="w-full" style={{ minHeight: 300 }}>
          <ChartLivePreview chartType={chartType} items={items} style={chartStyle} />
        </div>
      )}
      {variant === 'timeline' && <Timeline items={items} />}
      {variant === 'steps' && <Steps items={items} />}
      {variant === 'kpis' && <KpiCards items={items} />}
    </div>
  );
}
