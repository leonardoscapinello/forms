type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowSeconds: number;
  source: string;
  responseHeaders?: Record<string, string>;
};

export type WorkflowNodeRateLimitOptions = {
  bucket: string;
  /** Generous abuse ceiling scoped only to the caller IP (corporate NAT-safe). */
  ipLimit?: number;
  ipWindowSeconds?: number;
  /** A tenant/provider scope, such as form id or integration instance id. */
  globalScope: string;
  globalLimit: number;
  globalWindowSeconds?: number;
  formId?: string;
  responseId?: string;
  nodeKey?: string;
  nodeAttemptLimit?: number;
  nodeAttemptWindowSeconds?: number;
  serviceRoleKey?: string;
  responseHeaders?: Record<string, string>;
};

export type ProviderRequestRateLimitOptions = {
  bucket: string;
  ipLimit?: number;
  ipWindowSeconds?: number;
  providerScope: string;
  providerLimit: number;
  providerWindowSeconds?: number;
  subjectScope: string;
  subjectLimit: number;
  subjectWindowSeconds?: number;
  serviceRoleKey?: string;
  responseHeaders?: Record<string, string>;
};

export type PublicSubmissionRateLimitOptions = {
  bucket: string;
  formId: string;
  responseId: string;
  ipFormLimit: number;
  ipFormWindowSeconds?: number;
  formGlobalLimit: number;
  formGlobalWindowSeconds?: number;
  responseLimit: number;
  responseWindowSeconds?: number;
  serviceRoleKey?: string;
  responseHeaders?: Record<string, string>;
};

export type PublicFormGetAccess =
  | { formId: string; response: null }
  | { formId: null; response: Response };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicFormAccessRateLimitOptions = {
  bucket: string;
  limit?: number;
  windowSeconds?: number;
  globalLimit?: number;
  globalWindowSeconds?: number;
  serviceRoleKey?: string;
  responseHeaders?: Record<string, string>;
};

function requestSource(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',') || [];
  return req.headers.get('cf-connecting-ip')
    || forwarded[forwarded.length - 1]?.trim()
    || 'unknown';
}

async function hashRateLimitSource(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function consumeRateLimit(
  client: RpcClient,
  {
    bucket,
    limit,
    windowSeconds,
    source,
    responseHeaders = {},
  }: RateLimitOptions,
): Promise<Response | null> {
  const keyHash = await hashRateLimitSource(source);

  const { data, error } = await client.rpc('consume_edge_rate_limit', {
    p_bucket: bucket,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('rate_limit_unavailable', error.message || error);
    return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
      status: 503,
      headers: { ...responseHeaders, 'Content-Type': 'application/json', 'Retry-After': '10' },
    });
  }

  if (data !== true) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: {
        ...responseHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(windowSeconds),
      },
    });
  }

  return null;
}

export async function enforceRateLimit(
  client: RpcClient,
  req: Request,
  bucket: string,
  limit: number,
  windowSeconds: number,
  scope = '',
  serviceRoleKey = '',
  responseHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const authorization = req.headers.get('authorization');
  if (serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`) return null;

  return consumeRateLimit(client, {
    bucket,
    limit,
    windowSeconds,
    source: `${requestSource(req)}:${scope}`,
    responseHeaders,
  });
}

/**
 * Validates the public form identity before consuming the corporate-NAT
 * budget. Keeping both operations in this gate prevents a future endpoint
 * refactor from charging malformed traffic to a shared legitimate IP.
 */
export async function validateAndRateLimitPublicFormGet(
  client: RpcClient,
  req: Request,
  rawFormId: unknown,
  serviceRoleKey = '',
  responseHeaders: Record<string, string> = {},
): Promise<PublicFormGetAccess> {
  return validateAndRateLimitPublicFormAccess(client, req, rawFormId, {
    bucket: 'form-public-get:ip-form',
    limit: 5_000,
    windowSeconds: 60,
    serviceRoleKey,
    responseHeaders,
  });
}

export async function validateAndRateLimitPublicFormAccess(
  client: RpcClient,
  req: Request,
  rawFormId: unknown,
  {
    bucket,
    limit = 5_000,
    windowSeconds = 60,
    globalLimit = 20_000,
    globalWindowSeconds = 60,
    serviceRoleKey = '',
    responseHeaders = {},
  }: PublicFormAccessRateLimitOptions,
): Promise<PublicFormGetAccess> {
  if (typeof rawFormId !== 'string' || !UUID_PATTERN.test(rawFormId)) {
    return {
      formId: null,
      response: new Response(JSON.stringify({ error: 'Invalid form ID' }), {
        status: 400,
        headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const authorization = req.headers.get('authorization');
  if (serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`) {
    return { formId: rawFormId, response: null };
  }

  const response = await enforceRateLimit(
    client,
    req,
    bucket,
    limit,
    windowSeconds,
    rawFormId,
    serviceRoleKey,
    responseHeaders,
  );
  if (response) return { formId: null, response };

  const globalBucket = bucket.endsWith(':ip-form')
    ? `${bucket.slice(0, -':ip-form'.length)}:form-global`
    : `${bucket}:form-global`;
  const globalResponse = await consumeRateLimit(client, {
    bucket: globalBucket,
    limit: globalLimit,
    windowSeconds: globalWindowSeconds,
    source: rawFormId,
    responseHeaders,
  });

  return globalResponse
    ? { formId: null, response: globalResponse }
    : { formId: rawFormId, response: null };
}

/**
 * Public form traffic needs a generous corporate-NAT ceiling and an
 * independent per-response abuse budget. Never substitute one for the other:
 * hundreds of legitimate respondents can share the same public IP.
 */
export async function enforcePublicSubmissionRateLimits(
  client: RpcClient,
  req: Request,
  {
    bucket,
    formId,
    responseId,
    ipFormLimit,
    ipFormWindowSeconds = 60,
    formGlobalLimit,
    formGlobalWindowSeconds = 60,
    responseLimit,
    responseWindowSeconds = 300,
    serviceRoleKey = '',
    responseHeaders = {},
  }: PublicSubmissionRateLimitOptions,
): Promise<Response | null> {
  const authorization = req.headers.get('authorization');
  if (serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`) return null;

  // Consume the narrow signed-response budget first. Once it is exhausted, a
  // single respondent can no longer burn the shared corporate-IP or form-wide
  // budgets by retrying the same token.
  const responseLimited = await consumeRateLimit(client, {
    bucket: `${bucket}:response`,
    limit: responseLimit,
    windowSeconds: responseWindowSeconds,
    source: `${formId}:${responseId}`,
    responseHeaders,
  });
  if (responseLimited) return responseLimited;

  const ipFormLimited = await consumeRateLimit(client, {
    bucket: `${bucket}:ip-form`,
    limit: ipFormLimit,
    windowSeconds: ipFormWindowSeconds,
    source: `${requestSource(req)}:${formId}`,
    responseHeaders,
  });
  if (ipFormLimited) return ipFormLimited;

  const formGlobalLimited = await consumeRateLimit(client, {
    bucket: `${bucket}:form-global`,
    limit: formGlobalLimit,
    windowSeconds: formGlobalWindowSeconds,
    source: formId,
    responseHeaders,
  });
  if (formGlobalLimited) return formGlobalLimited;
  return null;
}

/** Independent IP, provider and subject budgets for a public provider call. */
export async function enforceProviderRequestRateLimits(
  client: RpcClient,
  req: Request,
  {
    bucket,
    ipLimit = 10_000,
    ipWindowSeconds = 60,
    providerScope,
    providerLimit,
    providerWindowSeconds = 60,
    subjectScope,
    subjectLimit,
    subjectWindowSeconds = 60,
    serviceRoleKey = '',
    responseHeaders = {},
  }: ProviderRequestRateLimitOptions,
): Promise<Response | null> {
  const authorization = req.headers.get('authorization');
  if (serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`) return null;

  const ipLimited = await consumeRateLimit(client, {
    bucket: `${bucket}:ip`,
    limit: ipLimit,
    windowSeconds: ipWindowSeconds,
    source: requestSource(req),
    responseHeaders,
  });
  if (ipLimited) return ipLimited;

  const providerLimited = await consumeRateLimit(client, {
    bucket: `${bucket}:provider-global`,
    limit: providerLimit,
    windowSeconds: providerWindowSeconds,
    source: providerScope,
    responseHeaders,
  });
  if (providerLimited) return providerLimited;

  return consumeRateLimit(client, {
    bucket: `${bucket}:subject`,
    limit: subjectLimit,
    windowSeconds: subjectWindowSeconds,
    source: subjectScope,
    responseHeaders,
  });
}

/**
 * Applies three independent controls to an external workflow node:
 *
 * - a deliberately generous IP-only ceiling for abuse containment without
 *   serialising legitimate calls by tenant;
 * - a tenant/provider ceiling independent of IP, so distributed traffic cannot
 *   bypass the integration's real external capacity;
 * - a much smaller response/node retry budget which is independent of IP.
 *
 * Call this only after the workflow execution claim has returned `claimed`.
 * Delivered and currently-processing retries must bypass both counters.
 */
export async function enforceWorkflowNodeRateLimits(
  client: RpcClient,
  req: Request,
  {
    bucket,
    ipLimit = 10_000,
    ipWindowSeconds = 60,
    globalScope,
    globalLimit,
    globalWindowSeconds = 60,
    formId = '',
    responseId = '',
    nodeKey = '',
    nodeAttemptLimit = 6,
    nodeAttemptWindowSeconds = 300,
    serviceRoleKey = '',
    responseHeaders = {},
  }: WorkflowNodeRateLimitOptions,
): Promise<Response | null> {
  const authorization = req.headers.get('authorization');
  if (serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`) return null;

  const ipLimited = await consumeRateLimit(client, {
    bucket: `${bucket}:ip`,
    limit: ipLimit,
    windowSeconds: ipWindowSeconds,
    source: requestSource(req),
    responseHeaders,
  });
  if (ipLimited) return ipLimited;

  const globalLimited = await consumeRateLimit(client, {
    bucket: `${bucket}:tenant-global`,
    limit: globalLimit,
    windowSeconds: globalWindowSeconds,
    source: globalScope,
    responseHeaders,
  });
  if (globalLimited) return globalLimited;

  // Authenticated admin tests and legacy internal calls may not have a stable
  // response/node identity. They remain covered by IP and provider ceilings.
  if (!formId || !responseId || !nodeKey) return null;

  return consumeRateLimit(client, {
    bucket: `${bucket}:response-node`,
    limit: nodeAttemptLimit,
    windowSeconds: nodeAttemptWindowSeconds,
    source: `${formId}:${responseId}:${nodeKey}`,
    responseHeaders,
  });
}
