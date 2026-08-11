/** Returns a protocol-level 405 before an endpoint reads or parses a body. */
export function rejectUnsupportedHttpMethod(
  req: Request,
  allowedMethods: readonly string[],
  responseHeaders: Record<string, string> = {},
): Response | null {
  const allowed = new Set(allowedMethods.map((method) => method.toUpperCase()));
  if (allowed.has(req.method.toUpperCase())) return null;

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: {
      ...responseHeaders,
      'Content-Type': 'application/json',
      Allow: [...allowed].join(', '),
    },
  });
}
