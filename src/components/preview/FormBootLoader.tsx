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
    <rect width="100" height="100" rx="20" fill="#050505" />
    <path
      d="M44.714 15.6311V22.2384H19.4243L11.8143 29.8484V70.1515L19.4243 77.7615H44.714V84.3688H16.6885L5.20703 72.8874V27.1125L16.6885 15.6311H44.714Z"
      fill="white"
    />
    <path
      d="M55.2856 84.3686V77.7613H80.5753L88.1853 70.1513L88.1853 29.8481L80.5753 22.2382L55.2856 22.2381V15.6309L83.3111 15.6309L94.7926 27.1123V72.8871L83.3111 84.3686H55.2856Z"
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
