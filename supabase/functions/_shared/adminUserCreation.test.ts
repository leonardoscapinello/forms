import {
  hasExactAdminPromotionAck,
  promoteCreatedUserToAdmin,
  rollbackCreatedAuthUser,
} from './adminUserCreation.ts';

function assert(condition: unknown, message = 'assertion_failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

Deno.test('admin promotion ACK requires exact count, identity and role', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  assert(hasExactAdminPromotionAck([{ user_id: userId, role: 'admin' }], 1, userId));
  assert(!hasExactAdminPromotionAck([{ user_id: userId, role: 'admin' }], null, userId));
  assert(!hasExactAdminPromotionAck([], 0, userId));
  assert(!hasExactAdminPromotionAck([
    { user_id: userId, role: 'admin' },
    { user_id: userId, role: 'admin' },
  ], 2, userId));
  assert(!hasExactAdminPromotionAck([{ user_id: 'different', role: 'admin' }], 1, userId));
  assert(!hasExactAdminPromotionAck([{ user_id: userId, role: 'user' }], 1, userId));
});

function promotionClient(result: { data: unknown; count: number | null; error: unknown }) {
  const calls: unknown[][] = [];
  const builder = {
    update(value: unknown, options: unknown) {
      calls.push(['update', value, options]);
      return builder;
    },
    eq(column: string, value: string) {
      calls.push(['eq', column, value]);
      return builder;
    },
    select(columns: string) {
      calls.push(['select', columns]);
      return Promise.resolve(result);
    },
  };
  return {
    client: {
      from(table: string) {
        calls.push(['from', table]);
        return builder;
      },
    },
    calls,
  };
}

Deno.test('admin promotion scopes the trigger role and returns success only with exact ACK', async () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const mock = promotionClient({
    data: [{ user_id: userId, role: 'admin' }],
    count: 1,
    error: null,
  });

  assertEquals(await promoteCreatedUserToAdmin(mock.client, userId), { ok: true });
  assertEquals(mock.calls, [
    ['from', 'user_roles'],
    ['update', { role: 'admin' }, { count: 'exact' }],
    ['eq', 'user_id', userId],
    ['eq', 'role', 'user'],
    ['select', 'user_id, role'],
  ]);
});

Deno.test('admin promotion fails closed on database error or missing row ACK', async () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const databaseFailure = promotionClient({ data: null, count: null, error: { message: 'failed' } });
  const missingAck = promotionClient({ data: [], count: 0, error: null });

  assertEquals(
    await promoteCreatedUserToAdmin(databaseFailure.client, userId),
    { ok: false, reason: 'database_error' },
  );
  assertEquals(
    await promoteCreatedUserToAdmin(missingAck.client, userId),
    { ok: false, reason: 'ack_mismatch' },
  );
});

Deno.test('auth rollback is confirmed only by the exact deleted user ID', async () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const client = (
    data: { user?: { id?: string } | null } | null,
    error: unknown = null,
  ) => ({
    auth: { admin: { deleteUser: () => Promise.resolve({ data, error }) } },
  });

  assert(await rollbackCreatedAuthUser(client({ user: { id: userId } }), userId));
  assert(!await rollbackCreatedAuthUser(client({ user: { id: 'different' } }), userId));
  assert(!await rollbackCreatedAuthUser(client({ user: { id: userId } }, { message: 'failed' }), userId));
  assert(!await rollbackCreatedAuthUser({
    auth: { admin: { deleteUser: () => Promise.reject(new Error('network')) } },
  }, userId));
});
