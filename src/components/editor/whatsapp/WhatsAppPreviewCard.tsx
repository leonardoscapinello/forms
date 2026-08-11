import { useMemo } from 'react';
import { Type, FileText, Volume2 } from 'lucide-react';
import { parseWhatsAppMarkdown } from './whatsappMarkdown';
import type { ElementLookup } from '../shared/VariableHighlightOverlay';

interface Props {
  messageText?: string;
  sendMedia?: boolean;
  mediaType?: 'image' | 'document' | 'video' | 'audio';
  mediaUrl?: string;
  mediaFileName?: string;
  elementLookup?: ElementLookup;
}

export default function WhatsAppPreviewCard({
  messageText,
  sendMedia,
  mediaType,
  mediaUrl,
  mediaFileName,
  elementLookup,
}: Props) {
  const previewHtml = useMemo(() => parseWhatsAppMarkdown(messageText || '', elementLookup), [messageText, elementLookup]);
  const hasContent = !!(messageText || (sendMedia && mediaUrl));

  if (!hasContent) return null;

  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="absolute left-full top-0 ml-3 w-[240px] z-50 animate-in fade-in slide-in-from-left-2 duration-200"
      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
    >
      <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-2.5 py-1.5 bg-[#075E54] flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">
            <Type className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-white">Preview</span>
        </div>

        {/* Chat area */}
        <div className="p-3 bg-[#ECE5DD] dark:bg-muted/30 min-h-[60px]">
          <div className="bg-[#DCF8C6] dark:bg-primary/15 rounded-lg rounded-tl-none shadow-sm max-w-full overflow-hidden">
            {/* Media preview */}
            {sendMedia && mediaUrl && (
              <div className="border-b border-black/5">
                {mediaType === 'image' && (
                  <img
                    src={mediaUrl}
                    alt={mediaFileName || 'Imagem'}
                    className="w-full max-h-[140px] object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                {mediaType === 'video' && (
                  <div className="relative">
                    <video
                      src={mediaUrl}
                      className="w-full max-h-[140px] object-cover"
                      muted
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-10 w-10 rounded-full bg-black/40 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[14px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1" />
                      </div>
                    </div>
                  </div>
                )}
                {mediaType === 'audio' && (
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div className="h-8 w-8 rounded-full bg-[#00A884] flex items-center justify-center flex-shrink-0">
                      <Volume2 className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="h-1 bg-black/10 rounded-full">
                        <div className="h-1 bg-[#00A884] rounded-full w-0" />
                      </div>
                      <span className="text-[9px] text-black/40 mt-0.5 block">0:00</span>
                    </div>
                  </div>
                )}
                {mediaType === 'document' && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-black/5">
                    <FileText className="h-8 w-8 text-[#00A884] flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-foreground truncate">
                        {mediaFileName || 'Documento'}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {mediaFileName?.split('.').pop()?.toUpperCase() || 'PDF'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Text message */}
            {messageText && (
              <div className="px-2.5 py-1.5">
                <div
                  className="text-xs text-foreground leading-relaxed break-words wa-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml /* safe: parseWhatsAppMarkdown escapes &, <, > before formatting */ }}
                />
              </div>
            )}

            {/* Timestamp */}
            <div className="flex justify-end px-2 pb-1">
              <span className="text-[9px] text-muted-foreground">{time}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
