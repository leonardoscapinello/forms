export type LimitedRequestBodyResult =
  | { ok: true; value: Uint8Array }
  | { ok: false; response: Response };

function bodyError(
  status: number,
  error: string,
  responseHeaders: Record<string, string>,
): LimitedRequestBodyResult {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    }),
  };
}

/** Reads a non-JSON request stream with an actual byte cap before buffering it. */
export async function readLimitedRequestBody(
  req: Request,
  maximumBytes: number,
  responseHeaders: Record<string, string> = {},
): Promise<LimitedRequestBodyResult> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > maximumBytes) {
      return bodyError(413, "payload_too_large", responseHeaders);
    }
  }

  if (!req.body) return { ok: true, value: new Uint8Array() };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return bodyError(413, "payload_too_large", responseHeaders);
      }
      chunks.push(value);
    }
  } catch {
    return bodyError(400, "invalid_body", responseHeaders);
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: result };
}
