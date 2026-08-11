/**
 * PostgREST may return `error: null` when a row filter matches nothing. These
 * helpers make the returned representation part of the mutation ACK contract.
 */
export function hasSingleIdAck(value: unknown, expectedId: string): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && 'id' in value
    && (value as { id?: unknown }).id === expectedId,
  );
}

export function hasExactIdAcks(value: unknown, expectedIds: Iterable<string>): boolean {
  if (!Array.isArray(value)) return false;
  const expected = new Set(expectedIds);
  const received = new Set(
    value
      .filter((row): row is { id: string } => Boolean(row && typeof row === 'object' && typeof row.id === 'string'))
      .map((row) => row.id),
  );
  return received.size === expected.size && [...expected].every((id) => received.has(id));
}
