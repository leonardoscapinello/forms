import { ChartType, GraphicDataItem } from '@/types/form';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface Template {
  name: string;
  emoji: string;
  chartType: ChartType;
  items: Omit<GraphicDataItem, 'id'>[];
}

const TEMPLATES: Template[] = [
  {
    name: 'Receita mensal',
    emoji: '💰',
    chartType: 'column',
    items: [
      { label: 'Jan', value: '12400', color: '#6366f1' },
      { label: 'Fev', value: '15800', color: '#6366f1' },
      { label: 'Mar', value: '14200', color: '#6366f1' },
      { label: 'Abr', value: '18900', color: '#6366f1' },
      { label: 'Mai', value: '21500', color: '#6366f1' },
      { label: 'Jun', value: '19800', color: '#6366f1' },
    ],
  },
  {
    name: 'Crescimento',
    emoji: '📈',
    chartType: 'line',
    items: [
      { label: 'Q1', value: '340', color: '#10b981' },
      { label: 'Q2', value: '520', color: '#10b981' },
      { label: 'Q3', value: '780', color: '#10b981' },
      { label: 'Q4', value: '1250', color: '#10b981' },
    ],
  },
  {
    name: 'Market Share',
    emoji: '🥧',
    chartType: 'pie',
    items: [
      { label: 'Produto A', value: '45', color: '#6366f1' },
      { label: 'Produto B', value: '28', color: '#3b82f6' },
      { label: 'Produto C', value: '18', color: '#06b6d4' },
      { label: 'Outros', value: '9', color: '#94a3b8' },
    ],
  },
  {
    name: 'Satisfação',
    emoji: '⭐',
    chartType: 'bar',
    items: [
      { label: 'Muito satisfeito', value: '42', color: '#22c55e' },
      { label: 'Satisfeito', value: '35', color: '#84cc16' },
      { label: 'Neutro', value: '15', color: '#eab308' },
      { label: 'Insatisfeito', value: '8', color: '#ef4444' },
    ],
  },
  {
    name: 'Metas',
    emoji: '🎯',
    chartType: 'speedometer',
    items: [
      { label: 'Vendas', value: '78', suffix: '100', color: '#6366f1' },
      { label: 'NPS', value: '85', suffix: '100', color: '#10b981' },
      { label: 'Retenção', value: '92', suffix: '100', color: '#f59e0b' },
    ],
  },
  {
    name: 'Temperatura',
    emoji: '🌡️',
    chartType: 'thermometer',
    items: [
      { label: 'Seg', value: '72', color: '#ef4444' },
      { label: 'Ter', value: '58', color: '#f97316' },
      { label: 'Qua', value: '85', color: '#ef4444' },
      { label: 'Qui', value: '45', color: '#3b82f6' },
      { label: 'Sex', value: '90', color: '#ef4444' },
    ],
  },
  {
    name: 'Vendas por região',
    emoji: '🗺️',
    chartType: 'column',
    items: [
      { label: 'Sudeste', value: '89000', color: '#6366f1' },
      { label: 'Sul', value: '45000', color: '#3b82f6' },
      { label: 'Nordeste', value: '52000', color: '#06b6d4' },
      { label: 'Centro-Oeste', value: '31000', color: '#10b981' },
      { label: 'Norte', value: '18000', color: '#f59e0b' },
    ],
  },
  {
    name: 'Performance',
    emoji: '🏆',
    chartType: 'bar',
    items: [
      { label: 'Maria', value: '95', suffix: '%', color: '#6366f1' },
      { label: 'João', value: '87', suffix: '%', color: '#3b82f6' },
      { label: 'Ana', value: '82', suffix: '%', color: '#06b6d4' },
      { label: 'Pedro', value: '76', suffix: '%', color: '#10b981' },
    ],
  },
];

interface Props {
  onApply: (chartType: ChartType, items: GraphicDataItem[]) => void;
}

export default function ChartTemplates({ onApply }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <Label className="text-xs text-muted-foreground font-medium">Templates prontos</Label>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Selecione um template para começar rapidamente. Os dados podem ser editados depois.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {TEMPLATES.map((tpl, idx) => (
          <motion.button
            key={idx}
            whileHover={{ scale: 1.01, x: 4 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              const items = tpl.items.map(i => ({ ...i, id: crypto.randomUUID() }));
              onApply(tpl.chartType, items);
            }}
            className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-all text-left group"
          >
            <span className="text-xl">{tpl.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{tpl.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {tpl.chartType === 'line' ? 'Linha' :
                 tpl.chartType === 'column' ? 'Colunas' :
                 tpl.chartType === 'pie' ? 'Pizza' :
                 tpl.chartType === 'bar' ? 'Barras' :
                 tpl.chartType === 'thermometer' ? 'Termômetro' :
                 'Velocímetro'} • {tpl.items.length} dados
              </p>
            </div>
            <div className="flex gap-0.5 flex-shrink-0">
              {tpl.items.slice(0, 5).map((item, i) => (
                <div key={i} className="w-2 h-6 rounded-full" style={{ backgroundColor: item.color, opacity: 0.7 + (i * 0.06) }} />
              ))}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={className}>{children}</p>;
}
