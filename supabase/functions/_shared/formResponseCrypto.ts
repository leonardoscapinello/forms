const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const BASE64_CHUNK_SIZE = 32_768;

type KeyPurpose = "encrypt" | "decrypt";
type CachedKey = {
  secret: string;
  promise: Promise<CryptoKey>;
};

// Edge isolates normally use one ENCRYPTION_SECRET for their whole lifetime.
// Keep at most one key per purpose so concurrent rows share the same expensive
// PBKDF2 derivation without creating an unbounded secret-key cache. A secret
// rotation replaces the entry on its next use.
let encryptionKeyCache: CachedKey | null = null;
let decryptionKeyCache: CachedKey | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE),
    );
  }
  return btoa(binary);
}

async function deriveKeyUncached(
  secret: string,
  purpose: KeyPurpose,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("twobrain-salt-v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    [purpose],
  );
}

function deriveKey(secret: string, purpose: KeyPurpose): Promise<CryptoKey> {
  const cached = purpose === "encrypt"
    ? encryptionKeyCache
    : decryptionKeyCache;
  if (cached?.secret === secret) return cached.promise;

  const promise = deriveKeyUncached(secret, purpose);
  const next = { secret, promise };
  if (purpose === "encrypt") encryptionKeyCache = next;
  else decryptionKeyCache = next;

  // A transient Web Crypto failure must not poison the isolate permanently.
  promise.catch(() => {
    if (purpose === "encrypt" && encryptionKeyCache?.promise === promise) {
      encryptionKeyCache = null;
    }
    if (purpose === "decrypt" && decryptionKeyCache?.promise === promise) {
      decryptionKeyCache = null;
    }
  });
  return promise;
}

export async function encryptStoredJson(
  value: unknown,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error("encryption_secret_missing");
  const key = await deriveKey(secret, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return `enc:${bytesToBase64(combined)}`;
}

export function isEncryptedStoredJson(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("enc:");
}

export async function prepareLegacyResponseEncryption(
  row: Record<string, unknown>,
  secret: string,
): Promise<{
  needsMigration: boolean;
  encryptedAnswers?: string;
  encryptedMetadata?: string;
}> {
  if (!secret) throw new Error("encryption_secret_missing");
  const answersEncrypted = isEncryptedStoredJson(row.answers);
  const metadataEncrypted = row.metadata == null ||
    isEncryptedStoredJson(row.metadata);
  if (answersEncrypted && metadataEncrypted) {
    return { needsMigration: false };
  }

  const answers = await readStoredJsonObject(
    row.answers,
    secret,
    "answers",
  );
  const metadata = row.metadata == null
    ? null
    : await readStoredJsonObject(row.metadata, secret, "metadata");
  return {
    needsMigration: true,
    encryptedAnswers: answersEncrypted
      ? row.answers as string
      : await encryptStoredJson(answers, secret),
    encryptedMetadata: metadata == null
      ? undefined
      : metadataEncrypted
      ? row.metadata as string
      : await encryptStoredJson(metadata, secret),
  };
}

async function decryptStoredValue(
  value: string,
  secret: string,
): Promise<unknown> {
  if (!secret) throw new Error("encryption_secret_missing");
  const encoded = value.slice("enc:".length);
  let combined: Uint8Array;
  try {
    combined = Uint8Array.from(
      atob(encoded),
      (character) => character.charCodeAt(0),
    );
  } catch {
    throw new Error("encrypted_value_invalid_base64");
  }
  if (combined.byteLength <= IV_LENGTH) {
    throw new Error("encrypted_value_too_short");
  }

  const key = await deriveKey(secret, "decrypt");
  let plaintext: string;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: combined.slice(0, IV_LENGTH) },
      key,
      combined.slice(IV_LENGTH),
    );
    plaintext = new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("encrypted_value_decryption_failed");
  }

  try {
    return JSON.parse(plaintext);
  } catch {
    throw new Error("encrypted_value_invalid_json");
  }
}

/**
 * Reads the canonical JSONB representation used by form_responses.
 *
 * New rows contain an `enc:` JSON string, while legacy rows may contain a
 * regular JSON object or a stringified JSON object. Decryption errors are
 * intentionally fatal: an external delivery must never leak ciphertext or
 * silently send an empty response.
 */
export async function readStoredJsonObject(
  value: unknown,
  secret: string,
  fieldName: string,
): Promise<Record<string, unknown>> {
  let decoded = value;
  if (typeof value === "string") {
    if (value.startsWith("enc:")) {
      decoded = await decryptStoredValue(value, secret);
    } else {
      try {
        decoded = JSON.parse(value);
      } catch {
        throw new Error(`${fieldName}_invalid_json`);
      }
    }
  }

  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error(`${fieldName}_not_an_object`);
  }
  assertNoEncryptedMarker(decoded, fieldName);
  return decoded as Record<string, unknown>;
}

function assertNoEncryptedMarker(
  value: unknown,
  fieldName: string,
  seen = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    if (value.startsWith("enc:")) {
      throw new Error(`${fieldName}_encrypted_value_remaining`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    assertNoEncryptedMarker(nested, fieldName, seen);
  }
}

/**
 * Decrypt the response fields selected by form-responses-read.
 *
 * The endpoint requires its encryption key even while legacy plaintext rows
 * still exist. A single invalid encrypted field rejects the whole result set,
 * preventing a mixed plaintext/ciphertext 200 response.
 */
export async function decryptStoredResponseRows<
  T extends Record<string, unknown>,
>(
  rows: T[],
  secret: string,
): Promise<T[]> {
  if (!secret) throw new Error("encryption_secret_missing");

  const settledRows = await Promise.allSettled(rows.map(async (row) => {
    const decoded: Record<string, unknown> = { ...row };
    const settledFields = await Promise.allSettled(
      (["answers", "metadata"] as const).map(async (fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(row, fieldName)) return;
        const value = row[fieldName];
        // metadata was nullable in the first schema version; preserving that
        // legacy null does not risk exposing encrypted material.
        if (value === null || value === undefined) return;
        decoded[fieldName] = await readStoredJsonObject(
          value,
          secret,
          fieldName,
        );
      }),
    );
    const fieldFailure = settledFields.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (fieldFailure) throw fieldFailure.reason;
    return decoded as T;
  }));

  const rowFailure = settledRows.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rowFailure) throw rowFailure.reason;
  return settledRows.map((result) =>
    (result as PromiseFulfilledResult<T>).value
  );
}
