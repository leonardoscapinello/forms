export type LimitedJsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response };

export type LimitedJsonBodyOptions = {
  /** Treat an empty request body as an empty JSON object. */
  allowEmptyObject?: boolean;
};

function jsonError(
  status: number,
  error: string,
  responseHeaders: Record<string, string>,
): LimitedJsonBodyResult {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    }),
  };
}

/** Enforces a small request envelope before JSON parsing. */
export async function readLimitedJsonObject(
  req: Request,
  maximumBytes: number,
  responseHeaders: Record<string, string> = {},
  options: LimitedJsonBodyOptions = {},
): Promise<LimitedJsonBodyResult> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maximumBytes) {
      return jsonError(413, "payload_too_large", responseHeaders);
    }
  }

  let raw = "";
  if (req.body) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const decoder = new TextDecoder();
    let bytesRead = 0;
    try {
      reader = req.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > maximumBytes) {
          await reader.cancel().catch(() => undefined);
          return jsonError(413, "payload_too_large", responseHeaders);
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch {
      return jsonError(400, "invalid_body", responseHeaders);
    } finally {
      reader?.releaseLock();
    }
  }

  if (options.allowEmptyObject && raw.trim() === "") {
    return { ok: true, value: {} };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonError(400, "invalid_json", responseHeaders);
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return jsonError(400, "invalid_json", responseHeaders);
  }
}
