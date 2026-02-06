import { ChartType, GraphicDataItem } from '@/types/form';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface Template {
  name: string;
  emoji: string;
  chartType: ChartType;
  items: Omit<GraphicDataItem, 'id'>[];
  tag?: string;
}

const TEMPLATES: Template[] = [
  {
    name: 'Receita mensal',
    emoji: '💰',
    chartType: 'column',
    items: [
      { label: 'Jan', value: '12400', color: '#6366f1' },
      { label: 'Fev', value: '15800', color: '#818cf8' },
      { label: 'Mar', value: '14200', color: '#6366f1' },
      { label: 'Abr', value: '18900', color: '#818cf8' },
      { label: 'Mai', value: '21500', color: '#6366f1' },
      { label: 'Jun', value: '19800', color: '#818cf8' },
    ],
  },
  {
    name: 'Crescimento',
    emoji: '📈',
    chartType: 'area',
    tag: 'Novo',
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
    name: 'Competências',
    emoji: '🕸️',
    chartType: 'radar',
    tag: 'Novo',
    items: [
      { label: 'Comunicação', value: '85', color: '#6366f1' },
      { label: 'Liderança', value: '72', color: '#6366f1' },
      { label: 'Técnica', value: '90', color: '#6366f1' },
      { label: 'Criatividade', value: '68', color: '#6366f1' },
      { label: 'Organização', value: '78', color: '#6366f1' },
      { label: 'Colaboração', value: '88', color: '#6366f1' },
    ],
  },
  {
    name: 'Funil de Vendas',
    emoji: '🔻',
    chartType: 'funnel',
    tag: 'Novo',
    items: [
      { label: 'Visitantes', value: '10000', color: '#6366f1' },
      { label: 'Leads', value: '5200', color: '#3b82f6' },
      { label: 'Qualificados', value: '2400', color: '#06b6d4' },
      { label: 'Propostas', value: '900', color: '#10b981' },
      { label: 'Fechados', value: '340', color: '#22c55e' },
    ],
  },
  {
    name: 'Fluxo Financeiro',
    emoji: '💸',
    chartType: 'waterfall',
    tag: 'Novo',
    items: [
      { label: 'Receita', value: '50000', color: '#22c55e' },
      { label: 'COGS', value: '-15000', color: '#ef4444' },
      { label: 'Marketing', value: '-8000', color: '#ef4444' },
      { label: 'Pessoal', value: '-12000', color: '#ef4444' },
      { label: 'Outros', value: '-3000', color: '#ef4444' },
    ],
  },
  {
    name: 'Categorias',
    emoji: '🗂️',
    chartType: 'treemap',
    tag: 'Novo',
    items: [
      { label: 'Eletrônicos', value: '45000', color: '#6366f1' },
      { label: 'Moda', value: '32000', color: '#3b82f6' },
      { label: 'Alimentos', value: '28000', color: '#10b981' },
      { label: 'Esportes', value: '18000', color: '#f59e0b' },
      { label: 'Casa', value: '12000', color: '#ef4444' },
    ],
  },
  {
    name: 'Metas',
    emoji: '🎯',
    chartType: 'radialBar',
    tag: 'Novo',
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
    name: 'KPIs Velocímetro',
    emoji: '⚡',
    chartType: 'speedometer',
    items: [
      { label: 'Uptime', value: '99', suffix: '100', color: '#22c55e' },
      { label: 'Performance', value: '87', suffix: '100', color: '#3b82f6' },
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
        <p className="text-xs text-muted-foreground font-medium">Templates prontos</p>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Selecione um template para começar. Os dados podem ser editados depois.
      </p>
      <div className="grid grid-cols-1 gap-1.5">
        {TEMPLATES.map((tpl, idx) => (
          <motion.button
            key={idx}
            whileHover={{ scale: 1.01, x: 3 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              const items = tpl.items.map(i => ({ ...i, id: crypto.randomUUID() }));
              onApply(tpl.chartType, items);
            }}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-all text-left group"
          >
            <span className="text-lg">{tpl.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{tpl.name}</p>
                {tpl.tag && (
                  <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    {tpl.tag}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{tpl.items.length} dados</p>
            </div>
            <div className="flex gap-0.5 flex-shrink-0">
              {tpl.items.slice(0, 5).map((item, i) => (
                <div key={i} className="w-1.5 h-5 rounded-full" style={{ backgroundColor: item.color, opacity: 0.7 + (i * 0.06) }} />
              ))}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
