import { ChartType } from '@/types/form';
import { motion } from 'framer-motion';
import {
  BarChart3, TrendingUp, PieChart, AlignLeft, Thermometer, Gauge,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface ChartTypeOption {
  value: ChartType;
  label: string;
  icon: LucideIcon;
  description: string;
}

const CHART_TYPES: ChartTypeOption[] = [
  { value: 'line', label: 'Linha', icon: TrendingUp, description: 'Tendências e evolução' },
  { value: 'column', label: 'Colunas', icon: BarChart3, description: 'Comparação vertical' },
  { value: 'pie', label: 'Pizza', icon: PieChart, description: 'Proporções e fatias' },
  { value: 'bar', label: 'Barras', icon: AlignLeft, description: 'Comparação horizontal' },
  { value: 'thermometer', label: 'Termômetro', icon: Thermometer, description: 'Progresso e níveis' },
  { value: 'speedometer', label: 'Velocímetro', icon: Gauge, description: 'Medidores e KPIs' },
];

interface Props {
  selected: ChartType;
  onSelect: (type: ChartType) => void;
}

export default function ChartTypeSelector({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CHART_TYPES.map((ct) => {
        const isActive = selected === ct.value;
        const Icon = ct.icon;
        return (
          <motion.button
            key={ct.value}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(ct.value)}
            className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors text-center ${
              isActive
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/40 hover:bg-muted/50'
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-[11px] font-semibold ${isActive ? 'text-primary' : 'text-foreground'}`}>
              {ct.label}
            </span>
            <span className="text-[9px] text-muted-foreground leading-tight">{ct.description}</span>
            {isActive && (
              <motion.div
                layoutId="chart-type-indicator"
                className="absolute -top-px -right-px w-4 h-4 rounded-bl-lg rounded-tr-[10px] bg-primary flex items-center justify-center"
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
