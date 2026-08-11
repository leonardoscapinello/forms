import {
  injectFormFirstPaintShell,
  injectFormSeoIntoHtml,
  resolveFormSeo,
  type PublicFormMetadata,
} from '../src/lib/formSeo.js';
import {
  fetchPublicFormMetadata,
  fetchSpaShell,
  MetadataFetchError,
  requestOrigin,
  validFormId,
} from './_lib/publicFormMetadata.js';

function unavailableMetadata(id: string): PublicFormMetadata {
  return {
    id,
    title: 'Formulário indisponível',
    description: 'Este formulário não está disponível no momento.',
    status: 'closed',
    seo: { robots: 'noindex, nofollow, noarchive' },
  };
}

async function handleRequest(request: Request): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const formId = new URL(request.url).searchParams.get('id');
  if (!validFormId(formId)) return new Response('Formulário inválido', { status: 400 });

  const startedAt = performance.now();
  let metadataDurationMs = 0;
  let shellDurationMs = 0;
  const timed = async <T,>(operation: Promise<T>, record: (duration: number) => void): Promise<T> => {
    const operationStartedAt = performance.now();
    try {
      return await operation;
    } finally {
      record(performance.now() - operationStartedAt);
    }
  };
  let status = 200;
  let metadata: PublicFormMetadata;
  const [metadataResult, shellResult] = await Promise.allSettled([
    timed(fetchPublicFormMetadata(request, formId), (duration) => { metadataDurationMs = duration; }),
    timed(fetchSpaShell(request), (duration) => { shellDurationMs = duration; }),
  ]);
  if (metadataResult.status === 'fulfilled') {
    metadata = metadataResult.value;
  } else {
    const error = metadataResult.reason;
    status = error instanceof MetadataFetchError ? error.status : 503;
    metadata = unavailableMetadata(formId);
  }

  if (shellResult.status === 'rejected') {
    return new Response('Aplicação temporariamente indisponível', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '10' },
    });
  }
  const shell = shellResult.value;

  const resolved = resolveFormSeo(metadata, { origin: requestOrigin(request) });
  const html = injectFormFirstPaintShell(
    injectFormSeoIntoHtml(shell, resolved),
    metadata,
    resolved,
  );
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': resolved.language,
    'Cache-Control': status === 200
      ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
      : 'public, max-age=0, s-maxage=15',
    'X-Robots-Tag': status === 200 ? resolved.robots : 'noindex, nofollow, noarchive',
    'X-Forms-Render-Mode': 'hybrid-shell-v1',
    'Server-Timing': [
      `metadata;dur=${metadataDurationMs.toFixed(1)}`,
      `shell;dur=${shellDurationMs.toFixed(1)}`,
      `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
    ].join(', '),
    Vary: 'Accept-Encoding, Host',
  });
  return new Response(request.method === 'HEAD' ? null : html, { status, headers });
}

export default { fetch: handleRequest };
