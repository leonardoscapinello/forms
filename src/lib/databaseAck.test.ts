import { describe, expect, it } from 'vitest';
import { hasExactIdAcks, hasSingleIdAck } from './databaseAck';

describe('database mutation acknowledgements', () => {
  it('does not confuse a successful HTTP request with a persisted row', () => {
    expect(hasSingleIdAck(null, 'form-1')).toBe(false);
    expect(hasSingleIdAck({}, 'form-1')).toBe(false);
    expect(hasSingleIdAck({ id: 'form-2' }, 'form-1')).toBe(false);
    expect(hasSingleIdAck({ id: 'form-1' }, 'form-1')).toBe(true);
  });

  it('requires every expected row exactly once for batch mutations', () => {
    expect(hasExactIdAcks([], ['a', 'b'])).toBe(false);
    expect(hasExactIdAcks([{ id: 'a' }], ['a', 'b'])).toBe(false);
    expect(hasExactIdAcks([{ id: 'a' }, { id: 'c' }], ['a', 'b'])).toBe(false);
    expect(hasExactIdAcks([{ id: 'b' }, { id: 'a' }], ['a', 'b'])).toBe(true);
  });
});
