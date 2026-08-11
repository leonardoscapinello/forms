import { describe, expect, it } from 'vitest';
import { isExplicitlyEnabled } from '../../supabase/functions/_shared/legacyFeatureGate.ts';

describe('legacy Edge feature gates', () => {
  it('fails closed unless the operator supplies the exact opt-in value', () => {
    expect(isExplicitlyEnabled(undefined)).toBe(false);
    expect(isExplicitlyEnabled(null)).toBe(false);
    expect(isExplicitlyEnabled('')).toBe(false);
    expect(isExplicitlyEnabled('TRUE')).toBe(false);
    expect(isExplicitlyEnabled('1')).toBe(false);
    expect(isExplicitlyEnabled(true)).toBe(false);
    expect(isExplicitlyEnabled('true')).toBe(true);
  });
});
