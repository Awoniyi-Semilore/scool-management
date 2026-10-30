import { describe, it, expect } from 'vitest';
import { feeChangeFor } from './ledger';

describe('changing a fee for one child', () => {
  it('no change when the amount is the same', () => {
    expect(feeChangeFor(4_000_000, 4_000_000)).toEqual({ kind: 'none' });
  });
  it('a lower amount becomes a discount of the difference', () => {
    expect(feeChangeFor(4_000_000, 3_500_000)).toEqual({ kind: 'discount', amount: 500_000 });
  });
  it('setting zero means not charged, so the discount is the whole fee', () => {
    expect(feeChangeFor(4_000_000, 0)).toEqual({ kind: 'discount', amount: 4_000_000 });
  });
  it('a higher amount becomes an added fee of the difference', () => {
    expect(feeChangeFor(4_000_000, 4_500_000)).toEqual({ kind: 'increase', amount: 500_000 });
  });
  it('rejects negative amounts', () => {
    expect(() => feeChangeFor(4_000_000, -1)).toThrow();
  });
});
