import { useState } from 'react';
import { Bug, ChevronRight, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface VariableEntry {
  name: string;
  type: string;
  value: string;
}

interface DebugPanelProps {
  entries: VariableEntry[];
  currentPage: string;
}

function typeColor(type: string) {
  switch (type) {
    case 'number':  return 'bg-blue-500/10 text-blue-600 border-blue-300/30';
    case 'boolean': return 'bg-purple-500/10 text-purple-600 border-purple-300/30';
    case 'response': return 'bg-amber-500/10 text-amber-600 border-amber-300/30';
    default:        return 'bg-muted text-muted-foreground border-border';
  }
}

function formatValue(value: string, type: string): string {
  if (value === '' || value === undefined || value === null) return '—';
  if (type === 'boolean') return value === 'true' ? '✓ true' : '✗ false';
  return value;
}

export default function DebugPanel({ entries, currentPage }: DebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed left-0 top-1/2 -translate-y-1/2 z-50 flex items-center gap-0">
      {/* Toggle tab */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex flex-col items-center gap-1.5 px-1.5 py-3 rounded-r-xl border border-l-0 border-border bg-card shadow-md text-muted-foreground hover:text-foreground transition-colors"
        title="Debug: variáveis"
      >
        <Bug className="h-3.5 w-3.5" />
        {open ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span
          className="text-[9px] font-medium tracking-wide uppercase"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Debug
        </span>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="w-[260px] border border-l-0 border-border bg-card/95 backdrop-blur-sm shadow-xl rounded-r-xl flex flex-col max-h-[70vh]">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
                <Bug className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Variáveis</span>
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">
                  {entries.length}
                </Badge>
              </div>

              {/* Current page */}
              <div className="px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
                <span className="text-[10px] text-muted-foreground">Página atual: </span>
                <span className="text-[10px] font-medium text-foreground">{currentPage}</span>
              </div>

              {/* Variable list */}
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1.5">
                  {entries.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-4">
                      Nenhuma variável definida
                    </p>
                  ) : (
                    entries.map(entry => (
                      <div
                        key={entry.name}
                        className="rounded-lg border border-border bg-background/50 px-2.5 py-2 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-mono font-medium text-foreground truncate">
                            {`{{${entry.name}}}`}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${typeColor(entry.type)}`}>
                            {entry.type}
                          </span>
                        </div>
                        <div className="text-[12px] font-mono text-primary break-all">
                          {formatValue(entry.value, entry.type)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Footer hint */}
              <div className="px-3 py-1.5 border-t border-border bg-muted/20 shrink-0">
                <p className="text-[9px] text-muted-foreground">
                  Atualiza em tempo real conforme o formulário é preenchido
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
