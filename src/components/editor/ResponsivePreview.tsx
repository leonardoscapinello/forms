import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FormData as AppFormData } from '@/types/form';
import FormBootLoader from '@/components/preview/FormBootLoader';

interface Props {
  form: AppFormData;
  onClose: () => void;
}

const DEVICES = [
  { id: 'desktop', icon: Monitor, label: 'Desktop', width: 1280, height: 800 },
  { id: 'tablet', icon: Tablet, label: 'Tablet', width: 768, height: 1024 },
  { id: 'mobile', icon: Smartphone, label: 'Mobile', width: 375, height: 812 },
] as const;

type DeviceId = typeof DEVICES[number]['id'];

export default function ResponsivePreview({ form, onClose }: Props) {
  const [device, setDevice] = useState<DeviceId>('desktop');
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewTimedOut, setPreviewTimedOut] = useState(false);
  const [iframeEpoch, setIframeEpoch] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewSessionRef = useRef(crypto.randomUUID());
  const active = DEVICES.find(d => d.id === device)!;

  const sendPreviewData = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'forms-editor-preview-data',
      formId: form.id,
      previewSession: previewSessionRef.current,
      form,
    }, '*');
  }, [form]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.formId !== form.id || event.data?.previewSession !== previewSessionRef.current) return;
      if (event.data?.type === 'forms-editor-preview-ready') {
        sendPreviewData();
      } else if (event.data?.type === 'forms-editor-preview-mounted') {
        setPreviewMounted(true);
        setPreviewTimedOut(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [form.id, sendPreviewData]);

  useEffect(() => {
    sendPreviewData();
  }, [sendPreviewData]);

  useEffect(() => {
    setPreviewMounted(false);
    setPreviewTimedOut(false);
    const timeout = window.setTimeout(() => setPreviewTimedOut(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [device, iframeEpoch]);

  const retryPreview = () => {
    previewSessionRef.current = crypto.randomUUID();
    setIframeEpoch(previous => previous + 1);
  };

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
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground active:bg-muted/80 active:text-foreground'
                )}
                onClick={() => setDevice(d.id)}
                aria-pressed={isActive}
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
          className="h-8 w-8 ml-auto text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground active:bg-muted/80 active:text-foreground"
          onClick={onClose}
          aria-label="Fechar preview"
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
            ref={iframeRef}
            src={`/f/${form.id}?editorPreview=1&previewSession=${encodeURIComponent(previewSessionRef.current)}&previewEpoch=${iframeEpoch}`}
            className="w-full h-full border-0"
            title={`Preview ${active.label}`}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            referrerPolicy="no-referrer"
            onLoad={sendPreviewData}
          />
          <AnimatePresence>
            {!previewMounted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex items-center justify-center bg-background/95 px-6 text-center"
              >
                {previewTimedOut ? (
                  <div className="space-y-3" role="alert">
                    <p className="text-sm font-medium text-foreground">O preview demorou para carregar</p>
                    <p className="text-xs text-muted-foreground">O rascunho continua salvo. Tente recarregar somente esta visualização.</p>
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={retryPreview}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Recarregar preview
                    </Button>
                  </div>
                ) : (
                  <FormBootLoader contained />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}
