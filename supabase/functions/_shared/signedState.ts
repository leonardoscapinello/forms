function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const OPAQUE_STATE_PREFIX = 'v2.';
const OPAQUE_STATE_IV_BYTES = 12;

async function opaqueStateKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`forms-opaque-state-v2:${secret}`),
  );
  return crypto.subtle.importKey(
    'raw',
    material,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createSignedStateWithSecret(
  data: Record<string, unknown>,
  ttlSeconds: number,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error('ENCRYPTION_SECRET is required');
  const iv = crypto.getRandomValues(new Uint8Array(OPAQUE_STATE_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify({
    ...data,
    expiresAt: Date.now() + ttlSeconds * 1_000,
  }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await opaqueStateKey(secret),
    plaintext,
  ));
  const envelope = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  envelope.set(iv);
  envelope.set(ciphertext, iv.byteLength);
  return `${OPAQUE_STATE_PREFIX}${base64Url(envelope)}`;
}

export async function verifySignedStateWithSecret(
  value: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  if (!secret || !value.startsWith(OPAQUE_STATE_PREFIX)) return null;
  try {
    const envelope = decodeBase64Url(value.slice(OPAQUE_STATE_PREFIX.length));
    if (envelope.byteLength <= OPAQUE_STATE_IV_BYTES) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: envelope.slice(0, OPAQUE_STATE_IV_BYTES) },
      await opaqueStateKey(secret),
      envelope.slice(OPAQUE_STATE_IV_BYTES),
    );
    const decoded = JSON.parse(new TextDecoder().decode(plaintext));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    if (typeof decoded.expiresAt !== 'number' || decoded.expiresAt < Date.now()) return null;
    return decoded as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
}

export async function createSignedState(data: Record<string, unknown>, ttlSeconds = 600): Promise<string> {
  const secret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
  return createSignedStateWithSecret(data, ttlSeconds, secret);
}

export async function verifySignedState(value: string): Promise<Record<string, unknown> | null> {
  const secret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
  if (value.startsWith(OPAQUE_STATE_PREFIX)) {
    return verifySignedStateWithSecret(value, secret);
  }

  // Transitional reader for credentials issued before the opaque v2 rollout.
  // New credentials are always AES-GCM envelopes and no longer expose their
  // response/session identifiers through base64-decoding.
  const [payload, signature] = value.split('.');
  if (!secret || !payload || !signature) return null;
  const expected = await sign(payload, secret);
  const expectedBytes = new TextEncoder().encode(expected);
  const actualBytes = new TextEncoder().encode(signature);
  if (expectedBytes.length !== actualBytes.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expectedBytes.length; i++) mismatch |= expectedBytes[i] ^ actualBytes[i];
  if (mismatch !== 0) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (typeof decoded.expiresAt !== 'number' || decoded.expiresAt < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}
