import {
  createSignedStateWithSecret,
  verifySignedStateWithSecret,
} from './signedState.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('opaque signed state round-trips without exposing identifiers', async () => {
  const responseId = '20000000-0000-4000-8000-000000000001';
  const token = await createSignedStateWithSecret({
    kind: 'form-submission',
    responseId,
  }, 60, 'unit-test-secret-with-enough-entropy');

  assert(token.startsWith('v2.'), 'new credentials must use the opaque v2 envelope');
  assert(!token.includes(responseId), 'credential must not expose its response identifier');
  const encodedEnvelope = token.slice(3).replace(/-/g, '+').replace(/_/g, '/');
  const decodedEnvelope = new TextDecoder().decode(
    Uint8Array.from(
      atob(encodedEnvelope + '='.repeat((4 - encodedEnvelope.length % 4) % 4)),
      (character) => character.charCodeAt(0),
    ),
  );
  assert(!decodedEnvelope.includes(responseId), 'base64-decoding must not reveal identifiers');

  const decoded = await verifySignedStateWithSecret(
    token,
    'unit-test-secret-with-enough-entropy',
  );
  assert(decoded?.kind === 'form-submission', 'valid state should round-trip');
  assert(decoded?.responseId === responseId, 'valid state should retain its identifier');
});

Deno.test('opaque signed state rejects a wrong key and tampering', async () => {
  const secret = 'unit-test-secret-with-enough-entropy';
  const token = await createSignedStateWithSecret({ kind: 'form-submission' }, 60, secret);
  assert(
    await verifySignedStateWithSecret(token, 'another-unit-test-secret') === null,
    'a different key must not decrypt the state',
  );

  const last = token.at(-1) === 'A' ? 'B' : 'A';
  const tampered = `${token.slice(0, -1)}${last}`;
  assert(
    await verifySignedStateWithSecret(tampered, secret) === null,
    'AES-GCM authentication must reject a modified envelope',
  );
});

Deno.test('opaque signed state rejects an expired credential', async () => {
  const secret = 'unit-test-secret-with-enough-entropy';
  const token = await createSignedStateWithSecret({ kind: 'form-submission' }, -1, secret);
  assert(
    await verifySignedStateWithSecret(token, secret) === null,
    'expired state must not be accepted',
  );
});
