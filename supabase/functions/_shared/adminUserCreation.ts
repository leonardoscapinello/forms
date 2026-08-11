type PromotionQueryResult = {
  data: unknown;
  count: number | null;
  error: unknown;
};

type PromotionFilterBuilder = {
  eq(column: string, value: string): PromotionFilterBuilder;
  select(columns: 'user_id, role'): PromiseLike<PromotionQueryResult>;
};

type PromotionQueryBuilder = {
  update(value: { role: 'admin' }, options: { count: 'exact' }): PromotionFilterBuilder;
};

type RolePromotionClient = {
  from(table: 'user_roles'): PromotionQueryBuilder;
};

type AuthRollbackClient = {
  auth: {
    admin: {
      deleteUser(userId: string): Promise<{
        data: { user?: { id?: string } | null } | null;
        error: unknown;
      }>;
    };
  };
};

export type AdminPromotionResult =
  | { ok: true }
  | { ok: false; reason: 'database_error' | 'ack_mismatch' };

export function hasExactAdminPromotionAck(
  data: unknown,
  count: number | null,
  userId: string,
): boolean {
  if (count !== 1 || !Array.isArray(data) || data.length !== 1) return false;
  const row = data[0];
  return !!row
    && typeof row === 'object'
    && !Array.isArray(row)
    && (row as Record<string, unknown>).user_id === userId
    && (row as Record<string, unknown>).role === 'admin';
}

/**
 * Promote exactly the trigger-created `user` role and require PostgREST's
 * exact row count plus returned-row acknowledgement.
 */
export async function promoteCreatedUserToAdmin(
  adminClient: RolePromotionClient,
  userId: string,
): Promise<AdminPromotionResult> {
  const result = await adminClient
    .from('user_roles')
    .update({ role: 'admin' }, { count: 'exact' })
    .eq('user_id', userId)
    .eq('role', 'user')
    .select('user_id, role') as PromotionQueryResult;

  if (result.error) return { ok: false, reason: 'database_error' };
  if (!hasExactAdminPromotionAck(result.data, result.count, userId)) {
    return { ok: false, reason: 'ack_mismatch' };
  }
  return { ok: true };
}

export async function rollbackCreatedAuthUser(
  adminClient: AuthRollbackClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await adminClient.auth.admin.deleteUser(userId);
    return !error && data?.user?.id === userId;
  } catch {
    return false;
  }
}
