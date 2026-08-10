function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
  if (!secret) throw new Error('ENCRYPTION_SECRET is required');
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    ...data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySignedState(value: string): Promise<Record<string, unknown> | null> {
  const secret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
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
