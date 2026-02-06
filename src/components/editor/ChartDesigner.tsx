import { useState, useCallback } from 'react';
import { ChartType, GraphicDataItem, Question } from '@/types/form';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChartTypeSelector from './chart-designer/ChartTypeSelector';
import DataItemList from './chart-designer/DataItemList';
import ChartLivePreview from './chart-designer/ChartLivePreview';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onClose: () => void;
}

export default function ChartDesigner({ question, onChange, onClose }: Props) {
  const chartType = question.graphicChartType || 'bar';
  const items = question.graphicData || [];

  const setChartType = useCallback((type: ChartType) => {
    onChange({ graphicChartType: type });
  }, [onChange]);

  const setItems = useCallback((newItems: GraphicDataItem[]) => {
    onChange({ graphicData: newItems });
  }, [onChange]);

  const showSuffix = chartType === 'speedometer' || chartType === 'thermometer' || chartType === 'bar' || chartType === 'column';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Designer panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative ml-auto w-full max-w-5xl bg-card border-l border-border shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">Chart Designer</h2>
            <p className="text-xs text-muted-foreground">Crie gráficos interativos e responsivos</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Controls */}
          <ScrollArea className="w-80 border-r border-border">
            <div className="p-5 space-y-6">
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium">Título do gráfico</Label>
                <Input
                  value={question.title}
                  onChange={e => onChange({ title: e.target.value })}
                  placeholder="Título..."
                  className="text-sm"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium">Descrição</Label>
                <Textarea
                  value={question.description || ''}
                  onChange={e => onChange({ description: e.target.value })}
                  placeholder="Texto descritivo..."
                  className="text-xs"
                  rows={2}
                />
              </div>

              {/* Chart Type */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium">Tipo de gráfico</Label>
                <ChartTypeSelector selected={chartType} onSelect={setChartType} />
              </div>

              {/* Data */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground font-medium">
                    Dados ({items.length})
                  </Label>
                </div>
                {chartType === 'speedometer' && (
                  <p className="text-[10px] text-muted-foreground bg-muted rounded-lg px-2.5 py-1.5">
                    💡 No velocímetro, o campo "sufixo" define o valor máximo da escala (padrão: 100)
                  </p>
                )}
                <DataItemList
                  items={items}
                  onChange={setItems}
                  showSuffix={showSuffix}
                />
              </div>
            </div>
          </ScrollArea>

          {/* Right: Live Preview */}
          <div className="flex-1 flex flex-col bg-background">
            <div className="px-5 py-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview ao vivo</p>
            </div>
            <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
              <div className="w-full max-w-xl">
                {question.title && (
                  <motion.h3
                    layout
                    className="text-lg font-semibold text-foreground text-center mb-2"
                  >
                    {question.title}
                  </motion.h3>
                )}
                {question.description && (
                  <motion.p
                    layout
                    className="text-sm text-muted-foreground text-center mb-6"
                  >
                    {question.description}
                  </motion.p>
                )}
                <ChartLivePreview chartType={chartType} items={items} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
