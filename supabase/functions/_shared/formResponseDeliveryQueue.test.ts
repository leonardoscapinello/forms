import {
  calculateDeliveryBackoffMs,
  classifyExistingDeliveryClaim,
  deliveryDestinationKey,
  isDeliveryClaimable,
  shouldDeadLetterDelivery,
} from './formResponseDeliveryQueue.ts';
import { buildCompletionWebhookBody } from './completionDeliveries.ts';
import { encryptStoredJson, readStoredJsonObject } from './formResponseCrypto.ts';

function assert(condition: unknown, message = 'assertion_failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

const NOW = Date.parse('2026-08-10T20:00:00.000Z');

Deno.test('delivery backoff is exponential, capped and jitter-bounded', () => {
  assertEquals(calculateDeliveryBackoffMs(1, () => 0), 15_000);
  assertEquals(calculateDeliveryBackoffMs(1, () => 1), 30_000);
  assertEquals(calculateDeliveryBackoffMs(2, () => 0), 30_000);
  assertEquals(calculateDeliveryBackoffMs(20, () => 0), 1_800_000);
  assertEquals(calculateDeliveryBackoffMs(20, () => 1), 3_600_000);
});

Deno.test('claim rules recover due failures and expired leases only', () => {
  const dueFailure = {
    status: 'failed' as const,
    attempts: 0,
    next_attempt_at: new Date(NOW).toISOString(),
    lease_until: null,
  };
  assert(isDeliveryClaimable(dueFailure, NOW));
  assertEquals(classifyExistingDeliveryClaim(dueFailure, NOW), 'claimable');

  const futureFailure = {
    ...dueFailure,
    next_attempt_at: new Date(NOW + 1).toISOString(),
  };
  assert(!isDeliveryClaimable(futureFailure, NOW));
  assertEquals(classifyExistingDeliveryClaim(futureFailure, NOW), 'scheduled');

  const activeLease = {
    status: 'processing' as const,
    attempts: 3,
    next_attempt_at: null,
    lease_until: new Date(NOW + 1).toISOString(),
  };
  assert(!isDeliveryClaimable(activeLease, NOW));
  assertEquals(classifyExistingDeliveryClaim(activeLease, NOW), 'processing');

  const expiredLease = { ...activeLease, lease_until: new Date(NOW).toISOString() };
  assert(isDeliveryClaimable(expiredLease, NOW));
  assertEquals(classifyExistingDeliveryClaim(expiredLease, NOW), 'claimable');
});

Deno.test('max attempts and permanent failures enter dead-letter', () => {
  const exhausted = {
    status: 'failed' as const,
    attempts: 8,
    next_attempt_at: new Date(NOW).toISOString(),
    lease_until: null,
  };
  assert(!isDeliveryClaimable(exhausted, NOW));
  assertEquals(classifyExistingDeliveryClaim(exhausted, NOW), 'dead_letter');
  assert(shouldDeadLetterDelivery(8));
  assert(shouldDeadLetterDelivery(1, true));
  assert(!shouldDeadLetterDelivery(7));
});

Deno.test('destination keys are deterministic and isolated by delivery type', async () => {
  const webhook = await deliveryDestinationKey('completion_webhook', 'https://example.com/hook');
  const webhookAgain = await deliveryDestinationKey('completion_webhook', 'https://example.com/hook');
  const sheet = await deliveryDestinationKey('google_sheets', 'https://example.com/hook');
  assertEquals(webhook, webhookAgain);
  assert(webhook.startsWith('completion_webhook:'));
  assert(sheet.startsWith('google_sheets:'));
  assert(webhook !== sheet);
});

Deno.test('canonical encrypted response round-trips without leaking ciphertext', async () => {
  const secret = 'unit-test-secret-with-sufficient-entropy';
  const original = { name: 'Leonardo', nested: { approved: true } };
  const encrypted = await encryptStoredJson(original, secret);
  assert(encrypted.startsWith('enc:'));
  assert(!encrypted.includes('Leonardo'));
  assertEquals(await readStoredJsonObject(encrypted, secret, 'answers'), original);

  let rejected = false;
  try {
    await readStoredJsonObject(encrypted, 'wrong-secret', 'answers');
  } catch {
    rejected = true;
  }
  assert(rejected, 'wrong encryption key must fail closed');
});

Deno.test('large canonical payload encryption does not overflow the call stack', async () => {
  const secret = 'large-payload-test-secret';
  const original = { content: 'x'.repeat(200_000) };
  const encrypted = await encryptStoredJson(original, secret);
  assertEquals(await readStoredJsonObject(encrypted, secret, 'answers'), original);
});

Deno.test('webhook body uses canonical answers and derived variables', () => {
  const body = buildCompletionWebhookBody(
    {
      id: 'form-1',
      title: 'Formulário',
      data: {
        variables: [{
          id: 'score-var',
          name: 'score',
          type: 'response',
          sourceElementId: 'score-field',
        }],
      },
    },
    {
      form_id: 'form-1',
      response_id: 'response-1',
      answers: { name: 'Leo', 'score-field': 42 },
      metadata: { submitted_at: '2026-08-10T20:00:00.000Z' },
    },
  );
  assertEquals(body.variables, { score: 42 });
  assertEquals(body.answers, { name: 'Leo', 'score-field': 42 });
  assertEquals((body.event as Record<string, unknown>).response_id, 'response-1');
});
