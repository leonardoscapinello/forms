import { useState, useCallback, useEffect } from 'react';
import { ChartType, GraphicDataItem, ChartStyle, Question } from '@/types/form';
import { motion } from 'framer-motion';
import { X, Database, Palette, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChartTypeSelector from './chart-designer/ChartTypeSelector';
import DataItemList from './chart-designer/DataItemList';
import ChartStylePanel from './chart-designer/ChartStylePanel';
import GraphicPreview from '@/components/preview/GraphicPreview';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onClose: () => void;
}

type Tab = 'data' | 'style';
type PreviewSize = 'desktop' | 'tablet' | 'mobile';

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Database }[] = [
  { key: 'data', label: 'Dados', icon: Database },
  { key: 'style', label: 'Aparência', icon: Palette },
];

const PREVIEW_SIZES: { key: PreviewSize; icon: typeof Monitor; width: string }[] = [
  { key: 'desktop', icon: Monitor, width: '100%' },
  { key: 'tablet', icon: Tablet, width: '768px' },
  { key: 'mobile', icon: Smartphone, width: '375px' },
];

export default function ChartDesigner({ question, onChange, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop');

  const chartType = question.graphicChartType || 'column';
  const items = question.graphicData || [];
  const chartStyle = question.chartStyle || {};

  useEffect(() => {
    if (question.graphicVariant !== 'chart') {
      onChange({ graphicVariant: 'chart' });
    }
  }, []);

  const setChartType = useCallback((type: ChartType) => {
    onChange({ graphicChartType: type, graphicVariant: 'chart' });
  }, [onChange]);

  const setItems = useCallback((newItems: GraphicDataItem[]) => {
    onChange({ graphicData: newItems });
  }, [onChange]);

  const setStyle = useCallback((style: ChartStyle) => {
    onChange({ chartStyle: style });
  }, [onChange]);

  const previewWidth = PREVIEW_SIZES.find(p => p.key === previewSize)?.width || '100%';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-10 mx-auto w-full max-w-5xl bg-card rounded-t-2xl border border-border border-b-0 shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 40px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3.5 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-sm">📊</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Gráfico</h2>
              <p className="text-[10px] text-muted-foreground">Configuração de visualização</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {PREVIEW_SIZES.map(ps => {
              const Icon = ps.icon;
              return (
                <button
                  key={ps.key}
                  onClick={() => setPreviewSize(ps.key)}
                  className={`p-1.5 rounded-md transition-colors ${
                    previewSize === ps.key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8 ml-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: Controls */}
          <div className="w-[340px] flex flex-col border-r border-border">
            <div className="flex border-b border-border">
              {TAB_CONFIG.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                      activeTab === tab.key
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">
                {activeTab === 'data' && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground font-medium">Título</Label>
                      <Input
                        value={question.title}
                        onChange={e => onChange({ title: e.target.value })}
                        placeholder="Título do gráfico..."
                        className="text-sm"
                      />
                    </div>
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

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground font-medium">Tipo de gráfico</Label>
                      <ChartTypeSelector selected={chartType} onSelect={setChartType} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground font-medium">
                        Dados ({items.length})
                      </Label>
                      <DataItemList items={items} onChange={setItems} />
                    </div>
                  </>
                )}

                {activeTab === 'style' && (
                  <ChartStylePanel
                    style={chartStyle}
                    chartType={chartType}
                    items={items}
                    onChange={setStyle}
                    onItemsChange={setItems}
                  />
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Live Preview */}
          <div className="flex-1 flex flex-col bg-background min-w-0">
            <div className="px-5 py-2.5 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preview ao vivo</p>
            </div>

            <div className="flex-1 overflow-auto p-8 flex items-start justify-center">
              <div className="transition-all duration-300" style={{ width: previewWidth, maxWidth: '100%' }}>
                <GraphicPreview
                  variant="chart"
                  chartType={chartType}
                  items={items}
                  title={question.title}
                  description={question.description}
                  chartStyle={chartStyle}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
