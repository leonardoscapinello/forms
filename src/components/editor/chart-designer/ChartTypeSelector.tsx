import { ChartType } from '@/types/form';
import { motion } from 'framer-motion';
import {
  BarChart3, TrendingUp, PieChart, AlignLeft, Thermometer, Gauge,
  Radar, Triangle, AreaChart, ArrowDownUp, LayoutGrid, Target,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface ChartTypeOption {
  value: ChartType;
  label: string;
  icon: LucideIcon;
  description: string;
  category: 'basic' | 'advanced';
}

const CHART_TYPES: ChartTypeOption[] = [
  { value: 'line', label: 'Linha', icon: TrendingUp, description: 'Tendências', category: 'basic' },
  { value: 'area', label: 'Área', icon: AreaChart, description: 'Tendências preenchidas', category: 'basic' },
  { value: 'column', label: 'Colunas', icon: BarChart3, description: 'Comparação vertical', category: 'basic' },
  { value: 'bar', label: 'Barras', icon: AlignLeft, description: 'Comparação horizontal', category: 'basic' },
  { value: 'pie', label: 'Pizza / Donut', icon: PieChart, description: 'Proporções', category: 'basic' },
  { value: 'radar', label: 'Radar', icon: Radar, description: 'Multidimensional', category: 'advanced' },
  { value: 'funnel', label: 'Funil', icon: Triangle, description: 'Conversão e fluxo', category: 'advanced' },
  { value: 'waterfall', label: 'Waterfall', icon: ArrowDownUp, description: 'Variações +/-', category: 'advanced' },
  { value: 'treemap', label: 'Treemap', icon: LayoutGrid, description: 'Hierarquia de valores', category: 'advanced' },
  { value: 'radialBar', label: 'Radial', icon: Target, description: 'Progresso circular', category: 'advanced' },
  { value: 'thermometer', label: 'Termômetro', icon: Thermometer, description: 'Progresso e níveis', category: 'advanced' },
  { value: 'speedometer', label: 'Velocímetro', icon: Gauge, description: 'Medidores / KPIs', category: 'advanced' },
];

interface Props {
  selected: ChartType;
  onSelect: (type: ChartType) => void;
}

export default function ChartTypeSelector({ selected, onSelect }: Props) {
  const basicTypes = CHART_TYPES.filter(t => t.category === 'basic');
  const advancedTypes = CHART_TYPES.filter(t => t.category === 'advanced');

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Básicos</p>
        <div className="grid grid-cols-3 gap-1.5">
          {basicTypes.map(ct => <TypeCard key={ct.value} ct={ct} selected={selected} onSelect={onSelect} />)}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Avançados</p>
        <div className="grid grid-cols-3 gap-1.5">
          {advancedTypes.map(ct => <TypeCard key={ct.value} ct={ct} selected={selected} onSelect={onSelect} />)}
        </div>
      </div>
    </div>
  );
}

function TypeCard({ ct, selected, onSelect }: { ct: ChartTypeOption; selected: ChartType; onSelect: (t: ChartType) => void }) {
  const isActive = selected === ct.value;
  const Icon = ct.icon;
  return (
    <motion.button
      whileHover={{ scale: 1.04, y: -1 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => onSelect(ct.value)}
      className={`relative flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-center ${
        isActive
          ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
          : 'border-border hover:border-primary/40 hover:bg-muted/50'
      }`}
    >
      <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
      <span className={`text-[10px] font-semibold leading-tight ${isActive ? 'text-primary' : 'text-foreground'}`}>
        {ct.label}
      </span>
      <span className="text-[8px] text-muted-foreground leading-tight">{ct.description}</span>
      {isActive && (
        <motion.div
          layoutId="chart-type-indicator"
          className="absolute -top-px -right-px w-3.5 h-3.5 rounded-bl-lg rounded-tr-[10px] bg-primary flex items-center justify-center"
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <svg className="w-2 h-2 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
    </motion.button>
  );
}
