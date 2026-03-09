import { ChartType } from '@/types/form';
import { motion } from 'framer-motion';
import { TrendingUp, BarChart3, PieChart } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface ChartTypeOption {
  value: ChartType;
  label: string;
  icon: LucideIcon;
  description: string;
}

const CHART_TYPES: ChartTypeOption[] = [
  { value: 'line', label: 'Cartesiano', icon: TrendingUp, description: 'Linhas e tendências' },
  { value: 'column', label: 'Barras', icon: BarChart3, description: 'Comparação de valores' },
  { value: 'pie', label: 'Circular', icon: PieChart, description: 'Proporções e fatias' },
];

interface Props {
  selected: ChartType;
  onSelect: (type: ChartType) => void;
}

export default function ChartTypeSelector({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CHART_TYPES.map(ct => {
        const isActive = selected === ct.value;
        const Icon = ct.icon;
        return (
          <motion.button
            key={ct.value}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(ct.value)}
            className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
              isActive
                ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
                : 'border-border hover:border-primary/40 hover:bg-muted/50'
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-semibold leading-tight ${isActive ? 'text-primary' : 'text-foreground'}`}>
              {ct.label}
            </span>
            <span className="text-[9px] text-muted-foreground leading-tight">{ct.description}</span>
            {isActive && (
              <motion.div
                layoutId="chart-type-indicator"
                className="absolute -top-px -right-px w-4 h-4 rounded-bl-lg rounded-tr-[10px] bg-primary flex items-center justify-center"
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
