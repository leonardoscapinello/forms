import { FileText, CheckCircle, BarChart3 } from 'lucide-react';

interface Props {
  totalForms: number;
  publishedCount: number;
  totalResponses: number;
}

export function StatsCards({ totalForms, publishedCount, totalResponses }: Props) {
  const cards = [
    { icon: FileText, label: 'Total de formulários', value: totalForms },
    { icon: CheckCircle, label: 'Publicados', value: publishedCount },
    { icon: BarChart3, label: 'Total de respostas', value: totalResponses },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      {cards.map(({ icon: Icon, label, value }) => (
        <div key={label} className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}
