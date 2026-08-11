const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const ENVELOPE_VERSION = 1;
const KDF_SALT = "forms-integration-settings-v1";
const BASE64_CHUNK_SIZE = 32_768;

export const MASKED_INTEGRATION_SECRET = "••••••••";
export const INTEGRATION_SECRET_ENVELOPE_KEY = "__formsEncryptedSecrets";

export const INTEGRATION_SECRET_FIELDS = {
  openai: ["apiKey"],
  resend: ["apiKey"],
  evolution_api: ["apiKey"],
  google_oauth: ["clientSecret", "accessToken", "refreshToken"],
  reoon_email: ["apiKey"],
  minio_s3: ["accessKey", "secretKey"],
  pixels: [
    "metaCapiToken",
    "ga4ApiSecret",
    "tiktokAccessToken",
    "linkedinAccessToken",
    // Webhook URLs commonly carry signing tokens in their path or query.
    "webhookDefaultUrl",
  ],
} as const;

export type IntegrationType = keyof typeof INTEGRATION_SECRET_FIELDS;

type SecretEnvelope = {
  version: 1;
  algorithm: "A256GCM";
  iv: string;
  ciphertext: string;
};

export type OpenedIntegrationConfig = {
  config: Record<string, unknown>;
  storage: "encrypted" | "legacy" | "public_only";
  needsMigration: boolean;
};

export type IntegrationConfigStorageRow = {
  integration_type: string;
  config: unknown;
};

type CachedKey = { secret: string; promise: Promise<CryptoKey> };
let keyCache: CachedKey | null = null;

export class IntegrationConfigCryptoError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "IntegrationConfigCryptoError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isIntegrationType(value: unknown): value is IntegrationType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(
    INTEGRATION_SECRET_FIELDS,
    value,
  );
}

export function isExactIntegrationConfigWriteAck(
  data: unknown,
  count: unknown,
  expectedId: string,
): boolean {
  return count === 1 && Array.isArray(data) && data.length === 1 &&
    isPlainObject(data[0]) && data[0].id === expectedId;
}

function requireEncryptionSecret(secret: string): void {
  if (!secret) {
    throw new IntegrationConfigCryptoError(
      "integration_encryption_unavailable",
    );
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE),
    );
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new IntegrationConfigCryptoError(
      "integration_config_decryption_failed",
    );
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveKeyUncached(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(KDF_SALT),
      iterations: 100_000,
      hash: "SHA-256",
    },
    material,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

function deriveKey(secret: string): Promise<CryptoKey> {
  if (keyCache?.secret === secret) return keyCache.promise;
  const promise = deriveKeyUncached(secret);
  keyCache = { secret, promise };
  promise.catch(() => {
    if (keyCache?.promise === promise) keyCache = null;
  });
  return promise;
}

function additionalData(integrationType: IntegrationType): Uint8Array {
  return new TextEncoder().encode(
    `forms:integration_settings:${integrationType}:v${ENVELOPE_VERSION}`,
  );
}

function parseEnvelope(value: unknown): SecretEnvelope {
  if (
    !isPlainObject(value) ||
    value.version !== ENVELOPE_VERSION ||
    value.algorithm !== "A256GCM" ||
    typeof value.iv !== "string" ||
    typeof value.ciphertext !== "string"
  ) {
    throw new IntegrationConfigCryptoError(
      "integration_config_envelope_invalid",
    );
  }
  return value as SecretEnvelope;
}

function validateSecretObject(
  integrationType: IntegrationType,
  value: unknown,
): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new IntegrationConfigCryptoError(
      "integration_config_decryption_failed",
    );
  }
  const allowed = new Set<string>(INTEGRATION_SECRET_FIELDS[integrationType]);
  const result: Record<string, string> = {};
  for (const [key, secretValue] of Object.entries(value)) {
    if (!allowed.has(key) || typeof secretValue !== "string" || !secretValue) {
      throw new IntegrationConfigCryptoError(
        "integration_config_decryption_failed",
      );
    }
    result[key] = secretValue;
  }
  return result;
}

async function decryptEnvelope(
  integrationType: IntegrationType,
  envelope: SecretEnvelope,
  secret: string,
): Promise<Record<string, string>> {
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (iv.byteLength !== IV_LENGTH || ciphertext.byteLength <= 16) {
    throw new IntegrationConfigCryptoError(
      "integration_config_decryption_failed",
    );
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(additionalData(integrationType)),
      },
      await deriveKey(secret),
      toArrayBuffer(ciphertext),
    );
    return validateSecretObject(
      integrationType,
      JSON.parse(new TextDecoder().decode(plaintext)),
    );
  } catch (error) {
    if (error instanceof IntegrationConfigCryptoError) throw error;
    throw new IntegrationConfigCryptoError(
      "integration_config_decryption_failed",
    );
  }
}

function splitPlaintextConfig(
  integrationType: IntegrationType,
  config: Record<string, unknown>,
): { publicConfig: Record<string, unknown>; secrets: Record<string, string> } {
  const publicConfig = { ...config };
  delete publicConfig[INTEGRATION_SECRET_ENVELOPE_KEY];
  const secrets: Record<string, string> = {};
  for (const field of INTEGRATION_SECRET_FIELDS[integrationType]) {
    if (!Object.prototype.hasOwnProperty.call(publicConfig, field)) continue;
    const value = publicConfig[field];
    delete publicConfig[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || value === MASKED_INTEGRATION_SECRET) {
      throw new IntegrationConfigCryptoError(
        "integration_config_secret_invalid",
      );
    }
    secrets[field] = value;
  }
  return { publicConfig, secrets };
}

export function hasLegacyPlaintextSecrets(
  integrationType: IntegrationType,
  storedConfig: unknown,
): boolean {
  if (
    !isPlainObject(storedConfig) ||
    Object.prototype.hasOwnProperty.call(
      storedConfig,
      INTEGRATION_SECRET_ENVELOPE_KEY,
    )
  ) {
    return false;
  }
  // Presence alone is enough: backfill must also remove empty/null legacy
  // secret slots so every designated field has one canonical storage form.
  return INTEGRATION_SECRET_FIELDS[integrationType].some((field) =>
    Object.prototype.hasOwnProperty.call(storedConfig, field)
  );
}

export async function openIntegrationConfig(
  integrationType: IntegrationType,
  storedConfig: unknown,
  encryptionSecret: string,
): Promise<OpenedIntegrationConfig> {
  requireEncryptionSecret(encryptionSecret);
  if (!isPlainObject(storedConfig)) {
    throw new IntegrationConfigCryptoError("integration_config_invalid");
  }

  const rawEnvelope = storedConfig[INTEGRATION_SECRET_ENVELOPE_KEY];
  if (rawEnvelope === undefined) {
    for (const field of INTEGRATION_SECRET_FIELDS[integrationType]) {
      const value = storedConfig[field];
      if (
        value !== undefined && value !== null && value !== "" &&
        typeof value !== "string"
      ) {
        throw new IntegrationConfigCryptoError(
          "integration_config_secret_invalid",
        );
      }
    }
    const needsMigration = hasLegacyPlaintextSecrets(
      integrationType,
      storedConfig,
    );
    return {
      config: { ...storedConfig },
      storage: needsMigration ? "legacy" : "public_only",
      needsMigration,
    };
  }

  // Never silently prefer an envelope while leaving a plaintext copy beside it.
  if (
    INTEGRATION_SECRET_FIELDS[integrationType].some((field) =>
      Object.prototype.hasOwnProperty.call(storedConfig, field)
    )
  ) {
    throw new IntegrationConfigCryptoError("integration_config_mixed_storage");
  }

  const publicConfig = { ...storedConfig };
  delete publicConfig[INTEGRATION_SECRET_ENVELOPE_KEY];
  const secrets = await decryptEnvelope(
    integrationType,
    parseEnvelope(rawEnvelope),
    encryptionSecret,
  );
  return {
    config: { ...publicConfig, ...secrets },
    storage: "encrypted",
    needsMigration: false,
  };
}

export async function openIntegrationConfigRows<
  T extends IntegrationConfigStorageRow,
>(
  rows: readonly T[],
  encryptionSecret: string,
  migrateLegacy: boolean,
  persistMigration?: (
    row: T,
    plaintextConfig: Record<string, unknown>,
  ) => Promise<void>,
): Promise<{
  rows: Array<T & { config: Record<string, unknown> }>;
  migrated: number;
}> {
  const openedRows: Array<T & { config: Record<string, unknown> }> = [];
  let migrated = 0;
  for (const storedRow of rows) {
    if (!isIntegrationType(storedRow.integration_type)) {
      throw new IntegrationConfigCryptoError("invalid_integration_type");
    }
    const opened = await openIntegrationConfig(
      storedRow.integration_type,
      storedRow.config,
      encryptionSecret,
    );
    if (opened.needsMigration && migrateLegacy) {
      if (!persistMigration) {
        throw new IntegrationConfigCryptoError(
          "integration_migration_writer_required",
        );
      }
      await persistMigration(storedRow, opened.config);
      migrated += 1;
    }
    openedRows.push({ ...storedRow, config: opened.config });
  }
  return { rows: openedRows, migrated };
}

export async function sealIntegrationConfig(
  integrationType: IntegrationType,
  plaintextConfig: Record<string, unknown>,
  encryptionSecret: string,
): Promise<Record<string, unknown>> {
  requireEncryptionSecret(encryptionSecret);
  if (!isPlainObject(plaintextConfig)) {
    throw new IntegrationConfigCryptoError("integration_config_invalid");
  }
  const { publicConfig, secrets } = splitPlaintextConfig(
    integrationType,
    plaintextConfig,
  );
  if (Object.keys(secrets).length === 0) return publicConfig;

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(secrets));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(additionalData(integrationType)),
    },
    await deriveKey(encryptionSecret),
    toArrayBuffer(plaintext),
  );
  return {
    ...publicConfig,
    [INTEGRATION_SECRET_ENVELOPE_KEY]: {
      version: ENVELOPE_VERSION,
      algorithm: "A256GCM",
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    } satisfies SecretEnvelope,
  };
}

export function maskIntegrationConfig(
  integrationType: IntegrationType,
  plaintextConfig: Record<string, unknown>,
): Record<string, unknown> {
  const masked = { ...plaintextConfig };
  delete masked[INTEGRATION_SECRET_ENVELOPE_KEY];
  for (const field of INTEGRATION_SECRET_FIELDS[integrationType]) {
    if (
      masked[field] !== undefined && masked[field] !== null &&
      masked[field] !== ""
    ) {
      masked[field] = MASKED_INTEGRATION_SECRET;
    }
  }
  return masked;
}
