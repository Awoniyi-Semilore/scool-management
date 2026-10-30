import { describe, it, expect } from 'vitest';
import { computeChargeBalances, pupilTotals, availableForNewSubmission } from './ledger';
import { validateAllocations } from './validation';
import { parseNairaToKobo, formatNaira } from './money';
import type { Allocation, Charge } from '../types';

const base = { pupilId: 'p1', sessionId: 's1', createdBy: 'admin', createdAt: 0, reason: null, description: '' };
const tuitionT2: Charge = { ...base, id: 'c-tuition-t2', termId: 's1_2', category: 'tuition', kind: 'fee', amount: 6_500_000 };
const discountT2: Charge = { ...base, id: 'c-disc-t2', termId: 's1_2', category: 'tuition', kind: 'discount', amount: 500_000 };
const booksDebtT1: Charge = { ...base, id: 'c-books-t1', termId: 's1_1', category: 'books', kind: 'fee', amount: 300_000 };
const uniformDebtT1: Charge = { ...base, id: 'c-uniform-t1', termId: 's1_1', category: 'uniform', kind: 'fee', amount: 500_000 };

const alloc = (chargeId: string, amount: number, c: Charge): Allocation => ({
  pupilId: c.pupilId, sessionId: c.sessionId, termId: c.termId, category: c.category, chargeId, amount,
});

describe('money', () => {
  it('parses naira strings to integer kobo', () => {
    expect(parseNairaToKobo('50,000')).toBe(5_000_000);
    expect(parseNairaToKobo('₦1,500.50')).toBe(150_050);
    expect(parseNairaToKobo('0.1')).toBe(10);
    expect(parseNairaToKobo('abc')).toBeNull();
    expect(parseNairaToKobo('')).toBeNull();
  });
  it('formats kobo as naira for display', () => {
    expect(formatNaira(4_500_000)).toBe('₦45,000.00');
    expect(formatNaira(150_050)).toBe('₦1,500.50');
  });
});

describe('balances', () => {
  it('discount reduces amount payable and keeps original fee visible', () => {
    const t = pupilTotals([tuitionT2, discountT2], [], []);
    expect(t.totalCharges).toBe(6_500_000);
    expect(t.discounts).toBe(500_000);
    expect(t.amountPayable).toBe(6_000_000);
    expect(t.outstanding).toBe(6_000_000);
  });

  it('partial payments reduce outstanding correctly', () => {
    const confirmed = [alloc('c-tuition-t2', 2_000_000, tuitionT2)];
    const t = pupilTotals([tuitionT2], confirmed, []);
    expect(t.confirmedPaid).toBe(2_000_000);
    expect(t.outstanding).toBe(4_500_000);
  });

  it('carry-forward: old-term debts are kept separately and not duplicated', () => {
    const charges = [tuitionT2, booksDebtT1, uniformDebtT1];
    const t = pupilTotals(charges, [], []);
    expect(t.totalCharges).toBe(6_500_000 + 300_000 + 500_000);
    expect(charges.filter((c) => c.termId === 's1_1')).toHaveLength(2);
  });

  it('payment to a First Term debt reduces only that debt', () => {
    const confirmed = [alloc('c-books-t1', 300_000, booksDebtT1)];
    const balances = computeChargeBalances([booksDebtT1, uniformDebtT1], confirmed, []);
    expect(balances.find((b) => b.chargeId === 'c-books-t1')!.outstanding).toBe(0);
    expect(balances.find((b) => b.chargeId === 'c-uniform-t1')!.outstanding).toBe(500_000);
  });

  it('pending submissions do not reduce the official outstanding balance', () => {
    const pending = [alloc('c-tuition-t2', 1_000_000, tuitionT2)];
    const t = pupilTotals([tuitionT2], [], pending);
    expect(t.outstanding).toBe(6_500_000);
    expect(t.pendingReserved).toBe(1_000_000);
  });

  it('pending reservations reduce what a NEW submission may claim', () => {
    const pending = [alloc('c-tuition-t2', 4_000_000, tuitionT2)];
    expect(availableForNewSubmission(tuitionT2, [], pending)).toBe(2_500_000);
  });

  it('a discount line has no outstanding amount of its own', () => {
    expect(availableForNewSubmission(discountT2, [], [])).toBe(0);
  });
});

describe('allocation validation', () => {
  const chargesById = new Map([tuitionT2, booksDebtT1, uniformDebtT1].map((c) => [c.id, c]));
  const allowed = new Set(['p1']);
  const run = (paymentAmount: number, allocations: Allocation[], pending: Allocation[] = []) =>
    validateAllocations({ paymentAmount, allocations, chargesById, confirmed: [], pending, allowedPupilIds: allowed });

  it('accepts exact allocation of a ₦50,000 payment', () => {
    const c: Charge = { ...tuitionT2, amount: 10_000_000 };
    const m = new Map([[c.id, c]]);
    const r = validateAllocations({ paymentAmount: 5_000_000, allocations: [alloc(c.id, 5_000_000, c)], chargesById: m, confirmed: [], pending: [], allowedPupilIds: allowed });
    expect(r.ok).toBe(true);
  });

  it('rejects ₦50,000 with allocations of ₦49,000 and ₦51,000', () => {
    const c: Charge = { ...tuitionT2, amount: 10_000_000 };
    const m = new Map([[c.id, c]]);
    const v = (amt: number) => validateAllocations({ paymentAmount: 5_000_000, allocations: [alloc(c.id, amt, c)], chargesById: m, confirmed: [], pending: [], allowedPupilIds: allowed });
    expect(v(4_900_000).ok).toBe(false);
    expect(v(5_100_000).ok).toBe(false);
  });

  it('rejects missing, zero, and negative allocations', () => {
    expect(run(100, []).ok).toBe(false);
    expect(run(100, [alloc('c-books-t1', 0, booksDebtT1)]).ok).toBe(false);
    expect(run(100, [alloc('c-books-t1', -100, booksDebtT1)]).ok).toBe(false);
  });

  it('rejects allocation exceeding eligible outstanding', () => {
    const r = run(600_000, [alloc('c-books-t1', 600_000, booksDebtT1)]);
    expect(r.ok).toBe(false);
  });

  it('rejects allocation to an unrelated pupil', () => {
    const other: Allocation = { ...alloc('c-books-t1', 300_000, booksDebtT1), pupilId: 'p-other' };
    const r = run(300_000, [other]);
    expect(r.ok).toBe(false);
  });

  it('rejects allocation referencing an unknown fee', () => {
    const r = run(100, [{ ...alloc('nope', 100, booksDebtT1) }]);
    expect(r.ok).toBe(false);
  });

  it('two pending submissions cannot claim the same fee beyond its outstanding amount', () => {
    const pending = [alloc('c-books-t1', 200_000, booksDebtT1)];
    const r = run(200_000, [alloc('c-books-t1', 200_000, booksDebtT1)], pending);
    expect(r.ok).toBe(false);
  });
});
