import { useEffect, useState, type CSSProperties } from 'react';

interface FormBootLoaderProps {
  contained?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface FormChunkFallbackProps {
  timeoutMs?: number;
  onRetry?: () => void;
}

export const FORM_CHUNK_FALLBACK_TIMEOUT_MS = 4_000;

const brandMark = (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="100" height="100" fill="black" />
    <path
      d="M46.7682 29.0001V32.9752H31.5534L26.9751 37.5535V61.8008L31.5534 66.3791H46.7682V70.3542H29.9075L23 63.4467V35.9076L29.9075 29.0001H46.7682Z"
      fill="white"
    />
    <path
      d="M53.1283 70.354V66.3789H68.3431L72.9214 61.8006L72.9214 37.5534L68.3431 32.9751L53.1283 32.9751V29L69.989 29L76.8965 35.9075V63.4466L69.989 70.354H53.1283Z"
      fill="white"
    />
  </svg>
);

export default function FormBootLoader({ contained = false, className = '', style }: FormBootLoaderProps) {
  const classes = [
    'form-boot-loader',
    contained ? 'form-boot-loader--contained' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={style}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      data-testid="form-boot-loader"
    >
      <div className="form-boot-loader__stage" aria-hidden="true">
        <div className="form-boot-loader__orbit" />
        <div className="form-boot-loader__mark">{brandMark}</div>
      </div>
      <span className="sr-only">Carregando formulário</span>
    </div>
  );
}

/**
 * Suspense may wait indefinitely when a browser leaves a module request open.
 * Keep the normal boot state visually clean, then expose a recoverable error
 * instead of trapping the respondent behind an endless spinner.
 */
export function FormChunkFallback({
  timeoutMs = FORM_CHUNK_FALLBACK_TIMEOUT_MS,
  onRetry = () => window.location.reload(),
}: FormChunkFallbackProps) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [timeoutMs]);

  if (!timedOut) return <FormBootLoader />;

  return (
    <div className="form-chunk-error" role="alert" aria-live="assertive">
      <div className="form-chunk-error__content">
        <p className="form-chunk-error__title">Não foi possível carregar o formulário</p>
        <p className="form-chunk-error__description">
          Verifique sua conexão e tente novamente. Nenhuma resposta foi perdida.
        </p>
        <button type="button" className="form-chunk-error__button" onClick={onRetry}>
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
