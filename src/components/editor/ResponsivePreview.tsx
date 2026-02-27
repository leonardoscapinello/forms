import { useState } from 'react';
import { Monitor, Tablet, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  formId: string;
  onClose: () => void;
}

const DEVICES = [
  { id: 'desktop', icon: Monitor, label: 'Desktop', width: 1280, height: 800 },
  { id: 'tablet', icon: Tablet, label: 'Tablet', width: 768, height: 1024 },
  { id: 'mobile', icon: Smartphone, label: 'Mobile', width: 375, height: 812 },
] as const;

type DeviceId = typeof DEVICES[number]['id'];

export default function ResponsivePreview({ formId, onClose }: Props) {
  const [device, setDevice] = useState<DeviceId>('desktop');
  const active = DEVICES.find(d => d.id === device)!;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-border bg-card">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {DEVICES.map(d => {
            const Icon = d.icon;
            const isActive = device === d.id;
            return (
              <Button
                key={d.id}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 px-3 gap-1.5 text-xs font-medium rounded-md transition-all',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setDevice(d.id)}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{d.label}</span>
              </Button>
            );
          })}
        </div>

        <div className="text-xs text-muted-foreground tabular-nums ml-3">
          {active.width} × {active.height}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-auto text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto bg-muted/30">
        <motion.div
          key={device}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="relative bg-background rounded-2xl shadow-2xl border border-border overflow-hidden"
          style={{
            width: Math.min(active.width, window.innerWidth - 80),
            height: Math.min(active.height, window.innerHeight - 120),
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          {/* Device frame top notch for mobile */}
          {device === 'mobile' && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-background rounded-b-2xl z-10 border-b border-x border-border" />
          )}
          <iframe
            src={`/f/${formId}?editorPreview=1`}
            className="w-full h-full border-0"
            title={`Preview ${active.label}`}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
