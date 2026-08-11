import {
  decryptStoredResponseRows,
  encryptStoredJson,
  isEncryptedStoredJson,
  prepareLegacyResponseEncryption,
} from './formResponseCrypto.ts';

function assert(condition: unknown, message = 'assertion_failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

async function assertRejects(operation: () => Promise<unknown>, expectedMessage: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof Error, 'expected an Error rejection');
    assert(error.message.includes(expectedMessage), `expected ${expectedMessage}, received ${error.message}`);
    return;
  }
  throw new Error('expected operation to reject');
}

Deno.test('response row decryption requires ENCRYPTION_SECRET even for an empty result', async () => {
  await assertRejects(
    () => decryptStoredResponseRows([], ''),
    'encryption_secret_missing',
  );
});

Deno.test('response row decryption rejects the whole batch when one enc value is unreadable', async () => {
  const secret = 'response-reader-test-secret';
  const valid = await encryptStoredJson({ name: 'Leonardo' }, secret);

  await assertRejects(
    () => decryptStoredResponseRows([
      { id: 'valid', answers: valid, metadata: { status: 'complete' } },
      { id: 'invalid', answers: 'enc:not-valid-ciphertext', metadata: { status: 'complete' } },
    ], secret),
    'encrypted_value_',
  );
});

Deno.test('response row decryption never returns nested encrypted markers', async () => {
  await assertRejects(
    () => decryptStoredResponseRows([
      { answers: { nested: 'enc:ciphertext' }, metadata: { status: 'complete' } },
    ], 'configured-secret'),
    'answers_encrypted_value_remaining',
  );
});

Deno.test('response row decryption returns plaintext copies and preserves legacy nullable metadata', async () => {
  const secret = 'response-reader-round-trip-secret';
  const answers = await encryptStoredJson({ name: 'Leonardo' }, secret);
  const metadata = await encryptStoredJson({ status: 'complete' }, secret);
  const source = [
    { id: 'encrypted', answers, metadata },
    { id: 'legacy', answers: { email: 'qa@example.com' }, metadata: null },
    { id: 'selection-without-sensitive-fields', created_at: '2026-08-11T00:00:00.000Z' },
  ];

  const decoded = await decryptStoredResponseRows(source, secret);

  assertEquals(decoded, [
    { id: 'encrypted', answers: { name: 'Leonardo' }, metadata: { status: 'complete' } },
    { id: 'legacy', answers: { email: 'qa@example.com' }, metadata: null },
    { id: 'selection-without-sensitive-fields', created_at: '2026-08-11T00:00:00.000Z' },
  ]);
  assert(typeof source[0].answers === 'string' && source[0].answers.startsWith('enc:'), 'source must not be mutated');
});

Deno.test('legacy response backfill encrypts plaintext once and preserves nullable metadata', async () => {
  const secret = 'response-backfill-test-secret';
  const legacy = await prepareLegacyResponseEncryption({
    answers: { email: 'qa@example.com', accepted: false },
    metadata: null,
  }, secret);

  assert(legacy.needsMigration);
  assert(isEncryptedStoredJson(legacy.encryptedAnswers));
  assertEquals(legacy.encryptedMetadata, undefined);
  assertEquals(
    await decryptStoredResponseRows([{
      answers: legacy.encryptedAnswers,
      metadata: null,
    }], secret),
    [{ answers: { email: 'qa@example.com', accepted: false }, metadata: null }],
  );
});

Deno.test('legacy response backfill is idempotent and repairs mixed storage', async () => {
  const secret = 'response-backfill-idempotency-secret';
  const encryptedAnswers = await encryptStoredJson({ score: 0 }, secret);
  const mixed = await prepareLegacyResponseEncryption({
    answers: encryptedAnswers,
    metadata: { status: 'complete' },
  }, secret);
  assert(mixed.needsMigration);
  assertEquals(mixed.encryptedAnswers, encryptedAnswers);
  assert(isEncryptedStoredJson(mixed.encryptedMetadata));

  const complete = await prepareLegacyResponseEncryption({
    answers: mixed.encryptedAnswers,
    metadata: mixed.encryptedMetadata,
  }, secret);
  assertEquals(complete, { needsMigration: false });
});
