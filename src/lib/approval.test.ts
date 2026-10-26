import { describe, it, expect } from 'vitest';
import { checkApprovalMatchesClaim } from './validation';
import type { Allocation } from '../types';

const al = (chargeId: string, amount: number, pupilId = 'p1'): Allocation => ({
  pupilId, sessionId: 's1', termId: 's1_1', category: 'tuition', chargeId, amount,
});

describe('approval must match the parent claim exactly', () => {
  const claim = { amount: 5_000_000, allocations: [al('c1', 3_000_000), al('c2', 2_000_000)] };

  it('accepts an approval identical to the claim', () => {
    expect(checkApprovalMatchesClaim(claim, { amount: 5_000_000, allocations: [al('c2', 2_000_000), al('c1', 3_000_000)] }).ok).toBe(true);
  });
  it('rejects an approval with a different amount', () => {
    expect(checkApprovalMatchesClaim(claim, { amount: 4_900_000, allocations: claim.allocations }).ok).toBe(false);
  });
  it('rejects an approval that moves money to a different fee', () => {
    const r = checkApprovalMatchesClaim(claim, { amount: 5_000_000, allocations: [al('c1', 2_000_000), al('c2', 3_000_000)] });
    expect(r.ok).toBe(false);
  });
  it('rejects an approval that adds or drops an allocation', () => {
    expect(checkApprovalMatchesClaim(claim, { amount: 5_000_000, allocations: [al('c1', 3_000_000)] }).ok).toBe(false);
    expect(checkApprovalMatchesClaim(claim, { amount: 5_000_000, allocations: [...claim.allocations, al('c3', 0)] }).ok).toBe(false);
  });
});
