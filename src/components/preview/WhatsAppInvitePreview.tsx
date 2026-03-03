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
    waGroupLink,
  } = element;

  const initials = waGroupName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

  const hasLink = waGroupLink && waGroupLink !== 'https://chat.whatsapp.com/';

  return (
    <div className="flex flex-col items-center w-full py-2">
      <div
        className="w-full max-w-[340px] overflow-hidden"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          borderRadius: 16,
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* Top green accent */}
        <div style={{ height: 4, background: 'linear-gradient(90deg, #25D366, #128C7E)' }} />

        <div className="flex flex-col items-center px-8 pt-7 pb-6 gap-1">
          {/* Avatar */}
          <div className="relative mb-2">
            {waGroupPhoto ? (
              <img
                src={waGroupPhoto}
                alt={waGroupName}
                className="object-cover"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  border: '2.5px solid #25D366',
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                  color: '#fff',
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                {initials}
              </div>
            )}
            {/* WA icon badge */}
            <div
              className="absolute flex items-center justify-center"
              style={{
                bottom: -2,
                right: -2,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#25D366',
                border: '2.5px solid #fff',
              }}
            >
              <svg viewBox="0 0 24 24" fill="#fff" width="12" height="12">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
          </div>

          {/* Group name */}
          <h3
            className="text-center leading-tight"
            style={{ fontSize: 17, fontWeight: 700, color: '#111b21', marginTop: 4 }}
          >
            {waGroupName}
          </h3>

          {/* Participant count */}
          <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
            <svg viewBox="0 0 16 16" fill="#4e5d66" width="11" height="11">
              <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm9.5-5a.5.5 0 01.5.5v1h1a.5.5 0 010 1h-1v1a.5.5 0 01-1 0v-1h-1a.5.5 0 010-1h1v-1a.5.5 0 01.5-.5z" />
            </svg>
            <span style={{ fontSize: 12, color: '#4e5d66' }}>
              {waParticipantCount} participantes
            </span>
          </div>

          {/* Message */}
          {waGroupMessage && (
            <p
              className="text-center leading-relaxed"
              style={{
                fontSize: 13,
                color: '#54656f',
                marginTop: 12,
                lineHeight: 1.5,
              }}
            >
              {waGroupMessage}
            </p>
          )}

          {/* Encryption badge */}
          <div
            className="flex items-center gap-1 mx-auto"
            style={{
              marginTop: 14,
              padding: '4px 10px',
              borderRadius: 20,
              background: '#f0f2f5',
            }}
          >
            <svg viewBox="0 0 16 16" fill="#4e5d66" width="10" height="10">
              <path d="M8 1a4 4 0 00-4 4v2H3a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-1V5a4 4 0 00-4-4zm2.5 6h-5V5a2.5 2.5 0 015 0v2z" />
            </svg>
            <span style={{ fontSize: 10, color: '#4e5d66', letterSpacing: 0.2 }}>
              Criptografia de ponta a ponta
            </span>
          </div>

          {/* CTA button */}
          <a
            href={hasLink ? waGroupLink : '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => { if (!hasLink) e.preventDefault(); }}
            className="flex items-center justify-center gap-2 w-full transition-transform active:scale-[0.98]"
            style={{
              marginTop: 16,
              padding: '12px 0',
              borderRadius: 12,
              background: '#25D366',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 2px 12px rgba(37, 211, 102, 0.25)',
              letterSpacing: 0.3,
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            {waButtonLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
