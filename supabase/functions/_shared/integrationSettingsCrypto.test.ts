import {
  hasLegacyPlaintextSecrets,
  INTEGRATION_SECRET_ENVELOPE_KEY,
  INTEGRATION_SECRET_FIELDS,
  IntegrationConfigCryptoError,
  type IntegrationType,
  isExactIntegrationConfigWriteAck,
  MASKED_INTEGRATION_SECRET,
  maskIntegrationConfig,
  openIntegrationConfig,
  openIntegrationConfigRows,
  sealIntegrationConfig,
} from "./integrationSettingsCrypto.ts";

function assert(
  condition: unknown,
  message = "assertion_failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

async function assertRejectsCode(
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof IntegrationConfigCryptoError,
      "expected crypto error",
    );
    assertEquals(error.code, code);
    return;
  }
  throw new Error(`expected rejection ${code}`);
}

const TEST_SECRET = "integration-settings-unit-test-secret";

Deno.test("every integration secret is encrypted at rest and round-trips", async () => {
  for (
    const [integrationType, fields] of Object.entries(INTEGRATION_SECRET_FIELDS)
  ) {
    const plaintext: Record<string, unknown> = {
      publicValue: `${integrationType}-public`,
    };
    for (const field of fields) {
      plaintext[field] = `${integrationType}-${field}-sensitive-value`;
    }

    const stored = await sealIntegrationConfig(
      integrationType as IntegrationType,
      plaintext,
      TEST_SECRET,
    );
    const serialized = JSON.stringify(stored);
    for (const field of fields) {
      assert(
        !Object.prototype.hasOwnProperty.call(stored, field),
        `${field} remained top-level`,
      );
      assert(
        !serialized.includes(String(plaintext[field])),
        `${field} leaked into storage`,
      );
    }
    assert(
      Object.prototype.hasOwnProperty.call(
        stored,
        INTEGRATION_SECRET_ENVELOPE_KEY,
      ),
    );

    const opened = await openIntegrationConfig(
      integrationType as IntegrationType,
      stored,
      TEST_SECRET,
    );
    assertEquals(opened.config, plaintext);
    assertEquals(opened.storage, "encrypted");
    assert(!opened.needsMigration);
  }
});

Deno.test("legacy plaintext is readable only as an explicit migration state", async () => {
  const legacy = { apiKey: "legacy-secret", model: "gpt-4.1-mini" };
  const opened = await openIntegrationConfig("openai", legacy, TEST_SECRET);
  assertEquals(opened.config, legacy);
  assertEquals(opened.storage, "legacy");
  assert(opened.needsMigration);
  assert(hasLegacyPlaintextSecrets("openai", legacy));

  const migrated = await sealIntegrationConfig(
    "openai",
    opened.config,
    TEST_SECRET,
  );
  assert(!hasLegacyPlaintextSecrets("openai", migrated));
  assert(!JSON.stringify(migrated).includes("legacy-secret"));

  const emptySlot = await openIntegrationConfig(
    "openai",
    { apiKey: null, model: "gpt-4.1" },
    TEST_SECRET,
  );
  assert(emptySlot.needsMigration);
  assertEquals(
    await sealIntegrationConfig("openai", emptySlot.config, TEST_SECRET),
    { model: "gpt-4.1" },
  );
});

Deno.test("missing or wrong encryption keys fail closed", async () => {
  const stored = await sealIntegrationConfig("resend", {
    apiKey: "re_secret",
    defaultFrom: "forms@example.com",
  }, TEST_SECRET);
  await assertRejectsCode(
    () => openIntegrationConfig("resend", stored, ""),
    "integration_encryption_unavailable",
  );
  await assertRejectsCode(
    () => openIntegrationConfig("resend", stored, "wrong-secret"),
    "integration_config_decryption_failed",
  );
});

Deno.test("tampered, unsupported and cross-integration envelopes fail closed", async () => {
  const stored = await sealIntegrationConfig(
    "openai",
    { apiKey: "sk-secret" },
    TEST_SECRET,
  );
  const envelope = structuredClone(
    stored[INTEGRATION_SECRET_ENVELOPE_KEY],
  ) as Record<string, unknown>;
  const ciphertext = Uint8Array.from(
    atob(String(envelope.ciphertext)),
    (character) => character.charCodeAt(0),
  );
  ciphertext[0] ^= 1;
  envelope.ciphertext = btoa(String.fromCharCode(...ciphertext));
  await assertRejectsCode(
    () =>
      openIntegrationConfig("openai", {
        ...stored,
        [INTEGRATION_SECRET_ENVELOPE_KEY]: envelope,
      }, TEST_SECRET),
    "integration_config_decryption_failed",
  );
  await assertRejectsCode(
    () => openIntegrationConfig("resend", stored, TEST_SECRET),
    "integration_config_decryption_failed",
  );
  await assertRejectsCode(
    () =>
      openIntegrationConfig("openai", {
        [INTEGRATION_SECRET_ENVELOPE_KEY]: { ...envelope, version: 2 },
      }, TEST_SECRET),
    "integration_config_envelope_invalid",
  );
});

Deno.test("same plaintext uses fresh authenticated ciphertext each time", async () => {
  const plaintext = { apiKey: "sk-randomized", model: "gpt-4.1-mini" };
  const first = await sealIntegrationConfig("openai", plaintext, TEST_SECRET);
  const second = await sealIntegrationConfig("openai", plaintext, TEST_SECRET);
  assert(
    JSON.stringify(first) !== JSON.stringify(second),
    "AES-GCM envelopes must use a fresh IV",
  );
  assertEquals(
    (await openIntegrationConfig("openai", first, TEST_SECRET)).config,
    { model: "gpt-4.1-mini", apiKey: "sk-randomized" },
  );
  assertEquals(
    (await openIntegrationConfig("openai", second, TEST_SECRET)).config,
    { model: "gpt-4.1-mini", apiKey: "sk-randomized" },
  );
});

Deno.test("mixed plaintext and encrypted secret storage is rejected", async () => {
  const stored = await sealIntegrationConfig("google_oauth", {
    clientId: "client.apps.googleusercontent.com",
    clientSecret: "client-secret",
  }, TEST_SECRET);
  await assertRejectsCode(
    () =>
      openIntegrationConfig("google_oauth", {
        ...stored,
        clientSecret: "plaintext-copy",
      }, TEST_SECRET),
    "integration_config_mixed_storage",
  );
});

Deno.test("masking covers every secret including webhookDefaultUrl", () => {
  const plaintext: Record<string, unknown> = {
    metaCapiToken: "meta",
    ga4ApiSecret: "ga4",
    tiktokAccessToken: "tiktok",
    linkedinAccessToken: "linkedin",
    webhookDefaultUrl: "https://example.com/hook?token=secret",
    ga4MeasurementId: "G-123",
  };
  const masked = maskIntegrationConfig("pixels", plaintext);
  for (const field of INTEGRATION_SECRET_FIELDS.pixels) {
    assertEquals(masked[field], MASKED_INTEGRATION_SECRET);
  }
  assertEquals(masked.ga4MeasurementId, "G-123");
});

Deno.test("public-only configs remain objects without an empty envelope", async () => {
  const stored = await sealIntegrationConfig("openai", {
    model: "gpt-4.1-mini",
  }, TEST_SECRET);
  assertEquals(stored, { model: "gpt-4.1-mini" });
  const opened = await openIntegrationConfig("openai", stored, TEST_SECRET);
  assertEquals(opened.storage, "public_only");
  assert(!opened.needsMigration);
});

Deno.test("database writes require an exact matching-row acknowledgement", () => {
  const id = "92dbb7a6-270f-4a29-8b9b-e90cec5aaea1";
  assert(isExactIntegrationConfigWriteAck([{ id }], 1, id));
  assert(!isExactIntegrationConfigWriteAck([{ id }], null, id));
  assert(!isExactIntegrationConfigWriteAck([{ id }], 0, id));
  assert(!isExactIntegrationConfigWriteAck([], 1, id));
  assert(!isExactIntegrationConfigWriteAck([{ id }, { id }], 1, id));
  assert(
    !isExactIntegrationConfigWriteAck([{ id: crypto.randomUUID() }], 1, id),
  );
  assert(!isExactIntegrationConfigWriteAck({ id }, 1, id));
});

Deno.test("row migration opens everything but writes only legacy secrets", async () => {
  const encrypted = await sealIntegrationConfig(
    "openai",
    { apiKey: "already-encrypted", model: "gpt-4.1-mini" },
    TEST_SECRET,
  );
  const rows = [
    { id: "legacy", integration_type: "openai", config: { apiKey: "legacy" } },
    { id: "encrypted", integration_type: "openai", config: encrypted },
    { id: "public", integration_type: "openai", config: { model: "gpt-4.1" } },
  ];
  const persisted: string[] = [];
  const result = await openIntegrationConfigRows(
    rows,
    TEST_SECRET,
    true,
    async (row, config) => {
      persisted.push(row.id);
      const storage = await sealIntegrationConfig(
        "openai",
        config,
        TEST_SECRET,
      );
      assert(!JSON.stringify(storage).includes('"apiKey":"legacy"'));
    },
  );
  assertEquals(persisted, ["legacy"]);
  assertEquals(result.migrated, 1);
  assertEquals(result.rows.map((row) => row.config.apiKey), [
    "legacy",
    "already-encrypted",
    undefined,
  ]);
});

Deno.test("catalog mode never migrates and migration failures stop the batch", async () => {
  const rows = [
    { id: "first", integration_type: "resend", config: { apiKey: "one" } },
    { id: "second", integration_type: "resend", config: { apiKey: "two" } },
  ];
  let writes = 0;
  const catalog = await openIntegrationConfigRows(
    rows,
    TEST_SECRET,
    false,
    () => {
      writes += 1;
      return Promise.resolve();
    },
  );
  assertEquals(writes, 0);
  assertEquals(catalog.migrated, 0);

  let failed = false;
  try {
    await openIntegrationConfigRows(
      rows,
      TEST_SECRET,
      true,
      () => {
        writes += 1;
        return Promise.reject(new Error("write_ack_failed"));
      },
    );
  } catch (error) {
    failed = error instanceof Error && error.message === "write_ack_failed";
  }
  assert(failed, "migration failure must propagate");
  assertEquals(writes, 1);
});
