import { PageElement } from '@/types/pageElements';

interface Props {
  element: PageElement;
}

export default function WhatsAppInvitePreview({ element }: Props) {
  const {
    waGroupName = 'Comunidade VIP',
    waGroupPhoto,
    waGroupMessage = 'Toque no botão abaixo para entrar no grupo',
    waButtonLabel = 'Entrar no grupo',
    waParticipantCount = 128,
  } = element;

  const initials = waGroupName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="flex flex-col items-center w-full" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div className="w-full max-w-[360px] rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        {/* Header bar */}
        <div style={{ backgroundColor: '#008069', height: 6, borderRadius: '0 0 0 0' }} />

        {/* Body */}
        <div className="flex flex-col items-center px-6 py-8 gap-4">
          {/* Group avatar */}
          <div className="relative">
            {waGroupPhoto ? (
              <img
                src={waGroupPhoto}
                alt={waGroupName}
                className="w-20 h-20 rounded-full object-cover"
                style={{ border: '3px solid #25D366' }}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: '#25D366', border: '3px solid #128C7E' }}
              >
                {initials}
              </div>
            )}
            {/* WhatsApp badge */}
            <div
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#25D366', border: '2px solid #ffffff' }}
            >
              <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
          </div>

          {/* Group name */}
          <div className="text-center">
            <h3 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>{waGroupName}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#667781' }}>
              Grupo · {waParticipantCount} participantes
            </p>
          </div>

          {/* Message */}
          {waGroupMessage && (
            <p className="text-sm text-center leading-relaxed" style={{ color: '#54656f' }}>
              {waGroupMessage}
            </p>
          )}

          {/* End-to-end encryption notice */}
          <div className="flex items-center gap-1.5 mt-1">
            <svg viewBox="0 0 16 16" fill="#667781" width="12" height="12">
              <path d="M8 1a4 4 0 00-4 4v2H3a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-1V5a4 4 0 00-4-4zm2.5 6h-5V5a2.5 2.5 0 015 0v2z" />
            </svg>
            <span className="text-[10px]" style={{ color: '#667781' }}>
              Protegido com criptografia de ponta a ponta
            </span>
          </div>

          {/* Join button */}
          <a
            href={element.waGroupLink || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl text-sm font-semibold text-center block transition-all mt-1"
            style={{
              backgroundColor: '#25D366',
              color: '#ffffff',
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)',
            }}
            onClick={e => {
              if (!element.waGroupLink || element.waGroupLink === 'https://chat.whatsapp.com/') {
                e.preventDefault();
              }
            }}
          >
            {waButtonLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
