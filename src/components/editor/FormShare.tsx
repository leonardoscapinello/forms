import { useState } from 'react';
import { FormData } from '@/types/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Copy, Link, Code2, Globe, Mail, QrCode, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  form: FormData;
}

const PUBLISHED_BASE = 'https://nodecraft-forms.lovable.app';

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast({ description: `${label} copiado!` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={value}
        className={`flex-1 bg-muted border-border text-sm ${mono ? 'font-mono' : ''} text-foreground`}
      />
      <Button variant="outline" size="icon" onClick={copy} className="shrink-0">
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function SectionCard({ icon: Icon, title, color, children }: {
  icon: React.ElementType;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={`flex items-center gap-3 px-5 py-3.5 border-b border-border ${color}`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

export default function FormShare({ form }: Props) {
  const previewUrl = `${PUBLISHED_BASE}/preview/${form.id}`;
  const isPublished = form.status === 'published';

  const iframeCode = `<iframe
  src="${previewUrl}"
  width="100%"
  height="600"
  frameborder="0"
  style="border-radius: 12px; overflow: hidden;"
  allow="clipboard-write"
></iframe>`;

  const scriptCode = `<div id="twobrain-form-${form.id}"></div>
<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${previewUrl}';
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    iframe.style.borderRadius = '12px';
    iframe.style.overflow = 'hidden';
    document.getElementById('twobrain-form-${form.id}').appendChild(iframe);
  })();
</script>`;

  const popupCode = `<!-- Trigger button -->
<button onclick="document.getElementById('nf-overlay-${form.id}').style.display='flex'" 
  style="padding:12px 24px;background:#000;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
  Abrir formulário
</button>

<!-- Overlay -->
<div id="nf-overlay-${form.id}" 
  style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;align-items:center;justify-content:center;"
  onclick="if(event.target===this)this.style.display='none'">
  <div style="width:90%;max-width:560px;height:85vh;border-radius:16px;overflow:hidden;position:relative;">
    <iframe src="${previewUrl}" width="100%" height="100%" frameborder="0"></iframe>
    <button onclick="document.getElementById('nf-overlay-${form.id}').style.display='none'"
      style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px;">×</button>
  </div>
</div>`;

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">Compartilhar formulário</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Distribua seu formulário por link direto ou incorpore em qualquer site.
          </p>
        </div>

        {/* Status banner */}
        {!isPublished && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 px-4 py-3">
            <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              O formulário está em rascunho. <strong>Publique</strong> para que o link funcione publicamente.
            </p>
          </div>
        )}

        {/* Link público */}
        <SectionCard icon={Link} title="Link público" color="bg-primary/5 text-primary">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Compartilhe diretamente com seus respondentes.</p>
            <CopyField label="Link público" value={previewUrl} mono={false} />
            <Button variant="outline" size="sm" asChild className="mt-1">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir em nova aba
              </a>
            </Button>
          </div>
        </SectionCard>

        {/* Incorporar — iFrame */}
        <SectionCard icon={Code2} title="Incorporar no site (iFrame)" color="bg-sky-500/5 text-sky-600 dark:text-sky-400">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Cole este código HTML onde quiser exibir o formulário inline — Framer, Webflow, WordPress, etc.
            </p>
            <CopyField label="Código iFrame" value={iframeCode} />
            <details className="mt-1">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                Ver prévia do código
              </summary>
              <pre className="mt-2 rounded-lg bg-muted p-3 text-xs overflow-x-auto text-foreground font-mono whitespace-pre-wrap">
                {iframeCode}
              </pre>
            </details>
          </div>
        </SectionCard>

        {/* Incorporar — Script */}
        <SectionCard icon={Code2} title="Incorporar via JavaScript" color="bg-violet-500/5 text-violet-600 dark:text-violet-400">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Incorporação dinâmica sem iFrame fixo no HTML — ideal para landing pages com múltiplas seções.
            </p>
            <CopyField label="Código Script" value={scriptCode} />
            <details className="mt-1">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                Ver prévia do código
              </summary>
              <pre className="mt-2 rounded-lg bg-muted p-3 text-xs overflow-x-auto text-foreground font-mono whitespace-pre-wrap">
                {scriptCode}
              </pre>
            </details>
          </div>
        </SectionCard>

        {/* Popup / Overlay */}
        <SectionCard icon={Globe} title="Popup / Overlay" color="bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Abre o formulário em uma janela modal ao clicar num botão — sem redirecionar o usuário.
            </p>
            <CopyField label="Código Popup" value={popupCode} />
            <details className="mt-1">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                Ver prévia do código
              </summary>
              <pre className="mt-2 rounded-lg bg-muted p-3 text-xs overflow-x-auto text-foreground font-mono whitespace-pre-wrap">
                {popupCode}
              </pre>
            </details>
          </div>
        </SectionCard>

        {/* E-mail */}
        <SectionCard icon={Mail} title="Compartilhar por e-mail" color="bg-orange-500/5 text-orange-600 dark:text-orange-400">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Abre seu cliente de e-mail com o link já preenchido.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`mailto:?subject=${encodeURIComponent(`Responda: ${form.title}`)}&body=${encodeURIComponent(`Olá! Você foi convidado para responder ao formulário "${form.title}".\n\nAcesse aqui: ${previewUrl}`)}`}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Abrir e-mail
              </a>
            </Button>
          </div>
        </SectionCard>

        {/* QR Code (placeholder) */}
        <SectionCard icon={QrCode} title="QR Code" color="bg-muted/60 text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
              <QrCode className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Em breve</p>
              <p className="text-xs text-muted-foreground">
                Geração de QR Code para uso em materiais impressos e apresentações.
              </p>
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
