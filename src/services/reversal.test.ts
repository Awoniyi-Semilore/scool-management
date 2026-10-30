import { describe, it, expect } from 'vitest';
import { reversalAllocations } from './data';
import type { Allocation } from '../types';

const a = (amount: number): Allocation => ({ pupilId: 'p1', sessionId: 's', termId: 't', category: 'Tuition', chargeId: 'c1', amount });

describe('payment correction', () => {
  it('cancels a payment exactly: every amount is negated', () => {
    const r = reversalAllocations([a(15000), a(5000)]);
    expect(r.map((x) => x.amount)).toEqual([-15000, -5000]);
    expect(r.reduce((t, x) => t + x.amount, 0)).toBe(-20000);
  });
  it('keeps the fee and child for each cancelled amount', () => {
    const r = reversalAllocations([a(15000)]);
    expect(r[0]).toMatchObject({ pupilId: 'p1', chargeId: 'c1', category: 'Tuition' });
  });
});
