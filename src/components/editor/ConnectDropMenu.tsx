import { FileText, GitBranch, Variable, Webhook, BarChart2, MessageSquare, Mail } from 'lucide-react';

interface Props {
  position: { x: number; y: number };
  onAddPage: () => void;
  onAddCondition: () => void;
  onAddVariableOp: () => void;
  onAddIntegration: () => void;
  onAddAnalytics: () => void;
  onAddWhatsApp: () => void;
  onAddEmail: () => void;
  onClose: () => void;
}

export default function ConnectDropMenu({ position, onAddPage, onAddCondition, onAddVariableOp, onAddIntegration, onAddAnalytics, onAddWhatsApp, onAddEmail, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-64 rounded-xl border border-border bg-popover shadow-xl py-2"
        style={{ left: position.x, top: position.y }}
      >
        {/* New Page */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddPage(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="font-medium text-foreground">Nova Página</span>
            <p className="text-[10px] text-muted-foreground">Adicionar página ao fluxo</p>
          </div>
        </button>

        <div className="h-px bg-border my-1.5 mx-3" />

        {/* Condition */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddCondition(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-node-condition flex items-center justify-center flex-shrink-0">
            <GitBranch className="h-4 w-4 text-node-condition-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">Condicional</span>
            <p className="text-[10px] text-muted-foreground">Ramificar o fluxo</p>
          </div>
        </button>

        <div className="h-px bg-border my-1.5 mx-3" />

        {/* Variable Op */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddVariableOp(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-node-variable-op flex items-center justify-center flex-shrink-0">
            <Variable className="h-4 w-4 text-node-variable-op-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">Variáveis</span>
            <p className="text-[10px] text-muted-foreground">Atribuir, somar, calcular variáveis</p>
          </div>
        </button>

        <div className="h-px bg-border my-1.5 mx-3" />

        {/* Webhook */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddIntegration(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-node-webhook flex items-center justify-center flex-shrink-0">
            <Webhook className="h-4 w-4 text-node-webhook-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">Webhook</span>
            <p className="text-[10px] text-muted-foreground">Enviar dados para uma URL</p>
          </div>
        </button>

        <div className="h-px bg-border my-1.5 mx-3" />

        {/* Analytics / Pixel */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddAnalytics(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-node-analytics flex items-center justify-center flex-shrink-0">
            <BarChart2 className="h-4 w-4 text-node-analytics-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">Analytics</span>
            <p className="text-[10px] text-muted-foreground">Meta, Google, TikTok, LinkedIn Pixel</p>
          </div>
        </button>

        <div className="h-px bg-border my-1.5 mx-3" />

        {/* WhatsApp */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddWhatsApp(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-node-whatsapp flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-4 w-4 text-node-whatsapp-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">WhatsApp</span>
            <p className="text-[10px] text-muted-foreground">Enviar mensagem via Evolution API</p>
          </div>
        </button>

        <div className="h-px bg-border my-1.5 mx-3" />

        {/* Email */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-accent text-left transition-colors"
          onClick={() => { onAddEmail(); onClose(); }}
        >
          <div className="h-8 w-8 rounded-lg bg-node-email flex items-center justify-center flex-shrink-0">
            <Mail className="h-4 w-4 text-node-email-accent" />
          </div>
          <div>
            <span className="font-medium text-foreground">E-mail</span>
            <p className="text-[10px] text-muted-foreground">Enviar e-mail via Resend</p>
          </div>
        </button>
      </div>
    </>
  );
}
