import { describe, it, expect } from 'vitest';
import { computeChargeBalances, pupilTotals } from './ledger';
import { validateAllocations } from './validation';
import type { Allocation, Charge } from '../types';

const mk = (over: Partial<Charge>): Charge => ({
  id: 'c', pupilId: 'p1', sessionId: 's1', termId: 's1_2', category: 'tuition', kind: 'fee',
  amount: 0, description: '', createdBy: 'a', createdAt: 0, reason: null, ...over,
});
const A = (chargeId: string, amount: number, c: Charge): Allocation => ({
  pupilId: c.pupilId, sessionId: c.sessionId, termId: c.termId, category: c.category, chargeId, amount,
});

describe('requirement 1-2: pupil and family access are enforced in rules, unit-level check here is the allowedPupilIds gate', () => {
  it('rejects allocations to a pupil outside the allowed set', () => {
    const c = mk({ id: 'x', pupilId: 'other', amount: 100 });
    const r = validateAllocations({ paymentAmount: 100, allocations: [A('x', 100, c)], chargesById: new Map([['x', c]]), confirmed: [], pending: [], allowedPupilIds: new Set(['p1']) });
    expect(r.ok).toBe(false);
  });
});

describe('requirement 8-9: discounts', () => {
  it('₦50,000 tuition less ₦5,000 discount leaves ₦45,000 payable, original fee visible', () => {
    const fee = mk({ id: 'f', amount: 5_000_000 });
    const disc = mk({ id: 'd', kind: 'discount', amount: 500_000 });
    const t = pupilTotals([fee, disc], [], []);
    expect(t.totalCharges).toBe(5_000_000);
    expect(t.discounts).toBe(500_000);
    expect(t.amountPayable).toBe(4_500_000);
    expect(t.outstanding).toBe(4_500_000);
  });
});

describe('requirement 10: partial payments', () => {
  it('two partial payments sum correctly against one fee', () => {
    const fee = mk({ id: 'f', amount: 5_000_000 });
    const confirmed = [A('f', 1_000_000, fee), A('f', 1_500_000, fee)];
    expect(pupilTotals([fee], confirmed, []).outstanding).toBe(2_500_000);
  });
});

describe('requirement 12-13: carry-forward is not duplicated; old-term payment hits the old debt', () => {
  it('a First Term debt is one charge; paying it leaves the Second Term charge untouched', () => {
    const t1Books = mk({ id: 'b1', termId: 's1_1', category: 'books', amount: 300_000 });
    const t2Tuition = mk({ id: 't2', termId: 's1_2', category: 'tuition', amount: 6_500_000 });
    const bal = computeChargeBalances([t1Books, t2Tuition], [A('b1', 300_000, t1Books)], []);
    expect(bal.find((b) => b.chargeId === 'b1')!.outstanding).toBe(0);
    expect(bal.find((b) => b.chargeId === 't2')!.outstanding).toBe(6_500_000);
  });
});

describe('requirement 11: discount reduces the amount payable of its own fee only', () => {
  it('a discount on tuition does not reduce books', () => {
    const tuition = mk({ id: 't', category: 'tuition', amount: 5_000_000 });
    const books = mk({ id: 'b', category: 'books', amount: 300_000 });
    const disc = mk({ id: 'd', category: 'tuition', kind: 'discount', amount: 500_000 });
    const bal = computeChargeBalances([tuition, books, disc], [], []);
    expect(bal.find((b) => b.chargeId === 't')!.outstanding).toBe(4_500_000);
    expect(bal.find((b) => b.chargeId === 'b')!.outstanding).toBe(300_000);
  });
});

describe('requirement 7: pending does not reduce confirmed balance', () => {
  it('pending allocations leave outstanding unchanged but reserve availability', () => {
    const f = mk({ id: 'f', amount: 5_000_000 });
    const t = pupilTotals([f], [], [A('f', 2_000_000, f)]);
    expect(t.outstanding).toBe(5_000_000);
    expect(t.pendingReserved).toBe(2_000_000);
  });
});

describe('requirement 6: cannot allocate more than eligible outstanding', () => {
  it('rejects an allocation above the remaining open amount', () => {
    const f = mk({ id: 'f', amount: 5_000_000 });
    const r = validateAllocations({ paymentAmount: 5_100_000, allocations: [A('f', 5_100_000, f)], chargesById: new Map([['f', f]]), confirmed: [], pending: [], allowedPupilIds: new Set(['p1']) });
    expect(r.ok).toBe(false);
  });
});

describe('requirement 14: a fee change must not erase confirmed payments', () => {
  it('a payment made against the old fee remains counted after the charge changes via a new adjustment line', () => {
    const original = mk({ id: 'f', amount: 5_000_000 });
    const adjustment = mk({ id: 'adj', kind: 'fee', amount: 500_000, description: 'Increase' });
    const confirmed = [A('f', 2_000_000, original)];
    const t = pupilTotals([original, adjustment], confirmed, []);
    expect(t.confirmedPaid).toBe(2_000_000);
    expect(t.outstanding).toBe(3_500_000);
  });
});
