type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

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

  const forwarded = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
    || 'unknown';
  const source = `${forwarded}:${scope}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const keyHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

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
