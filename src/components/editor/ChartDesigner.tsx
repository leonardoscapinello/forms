import { useState, useCallback, useEffect } from 'react';
import { ChartType, GraphicDataItem, Question, ChartStyle, ChartPanel, GridColumns } from '@/types/form';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, Palette, Sparkles, Monitor, Smartphone, Tablet, Plus, Trash2, LayoutGrid, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChartTypeSelector from './chart-designer/ChartTypeSelector';
import DataItemList from './chart-designer/DataItemList';
import ChartLivePreview from './chart-designer/ChartLivePreview';
import ChartStylePanel from './chart-designer/ChartStylePanel';
import ChartTemplates from './chart-designer/ChartTemplates';
import GraphicPreview from '@/components/preview/GraphicPreview';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onClose: () => void;
}

type Tab = 'data' | 'style' | 'templates';
type PreviewSize = 'desktop' | 'tablet' | 'mobile';

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Database }[] = [
  { key: 'data', label: 'Dados', icon: Database },
  { key: 'style', label: 'Estilo', icon: Palette },
  { key: 'templates', label: 'Templates', icon: Sparkles },
];

const PREVIEW_SIZES: { key: PreviewSize; icon: typeof Monitor; width: string }[] = [
  { key: 'desktop', icon: Monitor, width: '100%' },
  { key: 'tablet', icon: Tablet, width: '768px' },
  { key: 'mobile', icon: Smartphone, width: '375px' },
];

function createEmptyPanel(): ChartPanel {
  return {
    id: crypto.randomUUID(),
    label: '',
    chartType: 'bar',
    items: [
      { id: crypto.randomUUID(), label: 'Item 1', value: '75' },
      { id: crypto.randomUUID(), label: 'Item 2', value: '120' },
    ],
    style: {},
  };
}

export default function ChartDesigner({ question, onChange, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop');

  // Multi-panel state
  const panels = question.chartPanels || [];
  const isMultiMode = panels.length > 0;
  const [activePanelIndex, setActivePanelIndex] = useState(0);

  // Single-chart fallback values
  const chartType = question.graphicChartType || 'bar';
  const items = question.graphicData || [];
  const chartStyle = question.chartStyle || {};
  const gridColumns = question.gridColumns || 2;

  // Ensure graphicVariant is 'chart' when using Chart Designer
  useEffect(() => {
    if (question.graphicVariant !== 'chart') {
      onChange({ graphicVariant: 'chart' });
    }
  }, []);

  // ── Single-chart handlers ──
  const setChartType = useCallback((type: ChartType) => {
    if (isMultiMode) {
      updatePanel(activePanelIndex, { chartType: type });
    } else {
      onChange({ graphicChartType: type, graphicVariant: 'chart' });
    }
  }, [onChange, isMultiMode, activePanelIndex]);

  const setItems = useCallback((newItems: GraphicDataItem[]) => {
    if (isMultiMode) {
      updatePanel(activePanelIndex, { items: newItems });
    } else {
      onChange({ graphicData: newItems });
    }
  }, [onChange, isMultiMode, activePanelIndex]);

  const setStyle = useCallback((style: ChartStyle) => {
    if (isMultiMode) {
      updatePanel(activePanelIndex, { style });
    } else {
      onChange({ chartStyle: style });
    }
  }, [onChange, isMultiMode, activePanelIndex]);

  const handleApplyTemplate = useCallback((type: ChartType, templateItems: GraphicDataItem[]) => {
    if (isMultiMode) {
      updatePanel(activePanelIndex, { chartType: type, items: templateItems });
    } else {
      onChange({ graphicChartType: type, graphicData: templateItems, graphicVariant: 'chart' });
    }
    setActiveTab('data');
  }, [onChange, isMultiMode, activePanelIndex]);

  // ── Multi-panel handlers ──
  const updatePanel = useCallback((index: number, patch: Partial<ChartPanel>) => {
    const updated = [...panels];
    updated[index] = { ...updated[index], ...patch };
    onChange({ chartPanels: updated });
  }, [panels, onChange]);

  const addPanel = useCallback(() => {
    const newPanels = [...panels, createEmptyPanel()];
    onChange({ chartPanels: newPanels });
    setActivePanelIndex(newPanels.length - 1);
  }, [panels, onChange]);

  const removePanel = useCallback((index: number) => {
    const newPanels = panels.filter((_, i) => i !== index);
    onChange({ chartPanels: newPanels });
    if (activePanelIndex >= newPanels.length) {
      setActivePanelIndex(Math.max(0, newPanels.length - 1));
    }
  }, [panels, onChange, activePanelIndex]);

  const duplicatePanel = useCallback((index: number) => {
    const source = panels[index];
    const dup: ChartPanel = {
      ...source,
      id: crypto.randomUUID(),
      label: source.label ? `${source.label} (cópia)` : '',
      items: source.items.map(i => ({ ...i, id: crypto.randomUUID() })),
      style: { ...source.style, box: source.style.box ? { ...source.style.box } : undefined },
    };
    const newPanels = [...panels];
    newPanels.splice(index + 1, 0, dup);
    onChange({ chartPanels: newPanels });
    setActivePanelIndex(index + 1);
  }, [panels, onChange]);

  const enableMultiMode = useCallback(() => {
    // Convert current single chart into first panel + add a second
    const firstPanel: ChartPanel = {
      id: crypto.randomUUID(),
      label: '',
      chartType,
      items: [...items],
      style: { ...chartStyle },
    };
    onChange({
      chartPanels: [firstPanel, createEmptyPanel()],
      gridColumns: 2,
    });
    setActivePanelIndex(0);
  }, [chartType, items, chartStyle, onChange]);

  const disableMultiMode = useCallback(() => {
    // Convert first panel back to single chart
    if (panels.length > 0) {
      const first = panels[0];
      onChange({
        graphicChartType: first.chartType,
        graphicData: first.items,
        chartStyle: first.style,
        chartPanels: [],
        gridColumns: undefined,
      });
    } else {
      onChange({ chartPanels: [], gridColumns: undefined });
    }
  }, [panels, onChange]);

  // Active panel data
  const activePanel = isMultiMode ? panels[activePanelIndex] : null;
  const currentChartType = activePanel ? activePanel.chartType : chartType;
  const currentItems = activePanel ? activePanel.items : items;
  const currentStyle = activePanel ? activePanel.style : chartStyle;

  const showSuffix = currentChartType === 'speedometer' || currentChartType === 'thermometer' || currentChartType === 'bar' || currentChartType === 'column' || currentChartType === 'radialBar';

  const previewWidth = PREVIEW_SIZES.find(p => p.key === previewSize)?.width || '100%';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Designer panel */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-10 mx-auto w-full max-w-6xl bg-card rounded-t-2xl border border-border border-b-0 shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 40px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3.5 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-sm">📊</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Chart Studio</h2>
              <p className="text-[10px] text-muted-foreground">Design e configuração de gráficos</p>
            </div>
          </div>

          {/* Multi-chart toggle */}
          <Button
            variant={isMultiMode ? 'default' : 'outline'}
            size="sm"
            className="ml-4 text-xs gap-1.5 h-7"
            onClick={isMultiMode ? disableMultiMode : enableMultiMode}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {isMultiMode ? 'Multi-gráfico' : 'Comparativo'}
          </Button>

          {/* Grid columns selector (only in multi mode) */}
          {isMultiMode && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {([1, 2, 3] as GridColumns[]).map(cols => (
                <button
                  key={cols}
                  onClick={() => onChange({ gridColumns: cols })}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    gridColumns === cols
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cols} col{cols > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          )}

          {/* Preview size toggles */}
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
            {/* Multi-panel tabs */}
            {isMultiMode && (
              <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/30 overflow-x-auto">
                {panels.map((panel, i) => (
                  <button
                    key={panel.id}
                    onClick={() => setActivePanelIndex(i)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap ${
                      activePanelIndex === i
                        ? 'bg-card text-foreground shadow-sm border border-border'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    📊 {panel.label || `Gráfico ${i + 1}`}
                    {panels.length > 1 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); removePanel(i); }}
                        className="ml-1 hover:text-destructive cursor-pointer"
                      >
                        <X className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={addPanel}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Tabs */}
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
                    {/* Title + Description (global for single, per-panel label for multi) */}
                    {isMultiMode && activePanel ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground font-medium">Título do painel</Label>
                        <Input
                          value={activePanel.label || ''}
                          onChange={e => updatePanel(activePanelIndex, { label: e.target.value })}
                          placeholder="Ex: Vendas Q1..."
                          className="text-sm"
                        />
                        <div className="flex gap-1.5 mt-2">
                          <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1 flex-1"
                            onClick={() => duplicatePanel(activePanelIndex)}>
                            <Copy className="h-3 w-3" /> Duplicar
                          </Button>
                          {panels.length > 1 && (
                            <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1 text-destructive hover:text-destructive flex-1"
                              onClick={() => removePanel(activePanelIndex)}>
                              <Trash2 className="h-3 w-3" /> Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
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
                      </>
                    )}

                    {/* Chart Type */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground font-medium">Tipo de gráfico</Label>
                      <ChartTypeSelector selected={currentChartType} onSelect={setChartType} />
                    </div>

                    {/* Data */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground font-medium">
                        Dados ({currentItems.length})
                      </Label>
                      {currentChartType === 'speedometer' && (
                        <p className="text-[10px] text-muted-foreground bg-muted rounded-lg px-2.5 py-1.5">
                          💡 O campo "sufixo" define o valor máximo da escala (padrão: 100)
                        </p>
                      )}
                      <DataItemList items={currentItems} onChange={setItems} showSuffix={showSuffix} />
                    </div>
                  </>
                )}

                {activeTab === 'style' && (
                  <ChartStylePanel
                    style={currentStyle}
                    chartType={currentChartType}
                    items={currentItems}
                    onChange={setStyle}
                    onItemsChange={setItems}
                  />
                )}

                {activeTab === 'templates' && (
                  <ChartTemplates onApply={handleApplyTemplate} />
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Live Preview */}
          <div className="flex-1 flex flex-col bg-background min-w-0">
            <div className="px-5 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preview ao vivo</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${(isMultiMode ? panels.some(p => p.items.length > 0) : items.length > 0) ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                <span className="text-[10px] text-muted-foreground">
                  {(isMultiMode ? panels.some(p => p.items.length > 0) : items.length > 0) ? 'Atualizado' : 'Sem dados'}
                </span>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
              <div className="w-full" style={{ maxWidth: previewWidth }}>
                {question.title && (
                  <h3 className="text-lg font-semibold text-foreground text-center mb-1">
                    {question.title}
                  </h3>
                )}
                {question.description && (
                  <p className="text-sm text-muted-foreground text-center mb-6">
                    {question.description}
                  </p>
                )}
                <GraphicPreview
                  variant="chart"
                  chartType={chartType}
                  items={items}
                  chartStyle={chartStyle}
                  chartPanels={isMultiMode ? panels : undefined}
                  gridColumns={isMultiMode ? gridColumns : undefined}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
