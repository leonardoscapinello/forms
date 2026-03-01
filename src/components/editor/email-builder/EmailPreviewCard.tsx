import { motion } from 'framer-motion';

interface Props {
  bodyHtml?: string;
  bodyText?: string;
  useHtml?: boolean;
  subject?: string;
  fromName?: string;
  fromEmail?: string;
  toEmail?: string;
}

export default function EmailPreviewCard({
  bodyHtml,
  bodyText,
  useHtml,
  subject,
  fromName,
  fromEmail,
  toEmail,
}: Props) {
  const hasContent = !!(bodyHtml || bodyText);
  if (!hasContent) return null;

  return (
    <motion.div
      className="absolute left-full top-0 ml-3 z-10 pointer-events-none"
      style={{ width: 340 }}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden pointer-events-auto">
        {/* Email client header */}
        <div className="bg-muted/60 border-b border-border px-3 py-2 space-y-1">
          {subject && (
            <p className="text-xs font-semibold text-foreground truncate">{subject || 'Sem assunto'}</p>
          )}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {fromName && <span className="font-medium text-foreground">{fromName}</span>}
            {fromEmail && <span>&lt;{fromEmail}&gt;</span>}
          </div>
          {toEmail && (
            <p className="text-[10px] text-muted-foreground">
              Para: <span className="text-foreground">{toEmail}</span>
            </p>
          )}
        </div>

        {/* Email body preview */}
        <div className="max-h-[320px] overflow-hidden">
          {useHtml && bodyHtml ? (
            <iframe
              srcDoc={bodyHtml}
              className="w-full border-0"
              style={{ height: 300 }}
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="px-3 py-2.5 text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
              {bodyText || 'Sem conteúdo'}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
