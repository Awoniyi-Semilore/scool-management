import { describe, it, expect } from 'vitest';
import { buildStatement, localDate, pendingFor } from './statement';
import type { Charge, ChildClaim, ChildPaymentRecord } from '../types';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).getTime();
const charge = (id: string, kind: Charge['kind'], amount: number, y: number, m: number, d: number, category = 'Tuition', pupilId = 'p1'): Charge => ({
  id, pupilId, sessionId: 's', termId: 't', category, description: category, kind, amount,
  createdBy: 'admin', createdAt: day(y, m, d), reason: null, paidKobo: 0,
});
// one child's copy of a payment; `payer` is who paid
const rec = (paymentId: string, date: string, allocs: { chargeId: string; amount: number; category?: string }[], opts: { payer?: string; advance?: number; pupilId?: string; kind?: 'payment' | 'advance_application' } = {}): ChildPaymentRecord => ({
  id: `${opts.pupilId ?? 'p1'}_${paymentId}`, pupilId: opts.pupilId ?? 'p1', paymentId, kind: opts.kind ?? 'payment',
  payerName: opts.payer ?? 'Mrs A', paymentDate: date, bankReference: 'R', receiptNumber: opts.kind === 'advance_application' ? null : 'TCS-' + paymentId,
  allocations: allocs.map((a) => ({ pupilId: opts.pupilId ?? 'p1', sessionId: 's', termId: 't', category: a.category ?? 'Tuition', chargeId: a.chargeId, amount: a.amount })),
  advanceKobo: opts.advance ?? 0,
});

describe('account statement', () => {
  it('orders lines by date and runs the balance', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 10), charge('c2', 'fee', 15000, 2026, 9, 10, 'Books')];
    const st = buildStatement({ pupilId: 'p1', charges, records: [rec('P1', '2026-09-18', [{ chargeId: 'c1', amount: 20000 }])], from: '2026-09-01', to: '2026-09-30' });
    expect(st.lines.map((l) => l.txId)).toEqual(['c1', 'c2', 'P1']);
    expect(st.lines.map((l) => l.balance)).toEqual([40000, 55000, 35000]);
    expect(st.closing).toBe(35000);
  });

  it('says who paid on each payment line', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 10)];
    const st = buildStatement({ pupilId: 'p1', charges, records: [rec('P1', '2026-09-18', [{ chargeId: 'c1', amount: 20000 }], { payer: 'Mr Okafor (father)' })], from: '2026-09-01', to: '2026-09-30' });
    expect(st.lines.find((l) => l.txId === 'P1')?.payer).toBe('Mr Okafor (father)');
  });

  it('shows payments made by a different guardian for the same child', () => {
    // Both guardians are given the same child-level records, so the statements match.
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 10)];
    const records = [rec('P1', '2026-09-05', [{ chargeId: 'c1', amount: 10000 }], { payer: 'Mum' }), rec('P2', '2026-09-20', [{ chargeId: 'c1', amount: 30000 }], { payer: 'Dad' })];
    const forMum = buildStatement({ pupilId: 'p1', charges, records, from: '2026-09-01', to: '2026-09-30' });
    const forDad = buildStatement({ pupilId: 'p1', charges, records, from: '2026-09-01', to: '2026-09-30' });
    expect(forMum).toEqual(forDad);
    expect(forMum.closing).toBe(0);
  });

  it('closing = opening + debits - credits', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 10)];
    const st = buildStatement({ pupilId: 'p1', charges, records: [rec('P1', '2026-09-18', [{ chargeId: 'c1', amount: 40000 }])], from: '2026-09-01', to: '2026-09-30' });
    expect(st.closing).toBe(st.opening + st.debits - st.credits);
    expect(st.closing).toBe(0);
  });

  it('carries previous-term arrears into the opening balance', () => {
    const charges = [charge('old', 'opening_balance', 8000, 2026, 5, 3, 'Books'), charge('new', 'fee', 65000, 2026, 9, 10)];
    const st = buildStatement({ pupilId: 'p1', charges, records: [], from: '2026-09-01', to: '2026-09-30' });
    expect(st.opening).toBe(8000);
    expect(st.lines.map((l) => l.txId)).toEqual(['new']);
    expect(st.closing).toBe(73000);
  });

  it('shows partial payments as credits that reduce the balance step by step', () => {
    const charges = [charge('c1', 'fee', 60000, 2026, 9, 1)];
    const st = buildStatement({ pupilId: 'p1', charges, records: [rec('A', '2026-09-05', [{ chargeId: 'c1', amount: 20000 }]), rec('B', '2026-09-20', [{ chargeId: 'c1', amount: 20000 }])], from: '2026-09-01', to: '2026-09-30' });
    expect(st.lines.map((l) => l.balance)).toEqual([60000, 40000, 20000]);
    expect(st.closing).toBe(20000);
  });

  it('shows discounts as credits, not payments', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 1), charge('d1', 'discount', 5000, 2026, 9, 1)];
    const st = buildStatement({ pupilId: 'p1', charges, records: [], from: '2026-09-01', to: '2026-09-30' });
    expect(st.credits).toBe(5000);
    expect(st.closing).toBe(35000);
  });

  it('filters by the date range and keeps the opening balance right', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 1), charge('c2', 'fee', 10000, 2026, 10, 15)];
    const st = buildStatement({ pupilId: 'p1', charges, records: [], from: '2026-10-01', to: '2026-10-31' });
    expect(st.opening).toBe(40000);
    expect(st.lines.map((l) => l.txId)).toEqual(['c2']);
    expect(st.closing).toBe(50000);
  });

  it('keeps an advance out of the balance until it is applied', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 1)];
    const st = buildStatement({ pupilId: 'p1', charges, records: [rec('P1', '2026-09-10', [{ chargeId: 'c1', amount: 40000 }], { advance: 15000 })], from: '2026-09-01', to: '2026-09-30' });
    expect(st.closing).toBe(0);
    expect(st.lines.find((l) => l.note)).toBeDefined();
  });

  it('counts an applied advance as a credit against the fee', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 1), charge('n1', 'fee', 30000, 2026, 10, 1, 'Books')];
    const records = [rec('ADV', '2026-10-02', [{ chargeId: 'n1', amount: 10000, category: 'Books' }], { kind: 'advance_application', payer: 'Mum' })];
    const st = buildStatement({ pupilId: 'p1', charges, records, from: '2026-09-01', to: '2026-10-31' });
    expect(st.closing).toBe(40000 + 30000 - 10000);
    expect(st.lines.find((l) => l.txId === 'ADV')?.description).toMatch(/^Advance applied/);
  });

  it('ignores other children', () => {
    const other = charge('x', 'fee', 99999, 2026, 9, 1, 'Tuition', 'p2');
    const st = buildStatement({ pupilId: 'p1', charges: [other], records: [], from: '2026-09-01', to: '2026-09-30' });
    expect(st.closing).toBe(0);
    expect(st.lines).toHaveLength(0);
  });

  it('rejects a start date after the end date', () => {
    expect(() => buildStatement({ pupilId: 'p1', charges: [], records: [], from: '2026-10-01', to: '2026-09-01' })).toThrow();
  });

  it('uses the local calendar date', () => {
    expect(localDate(new Date(2026, 8, 5, 23, 30).getTime())).toBe('2026-09-05');
  });
});

describe('transfers not yet confirmed', () => {
  const claim = (id: string, pupilId: string, status: ChildClaim['status'], date: string, amount: number): ChildClaim => ({
    id, submissionId: 'S' + id, pupilId, parentUid: 'u', payerName: 'Mum', transferDate: date, bankReference: 'FT' + id,
    amountForChild: amount, status, createdAt: 1,
  });
  it('lists only pending transfers for the child, separately from the balance', () => {
    const claims = [claim('1', 'p1', 'pending', '2026-10-21', 25000), claim('2', 'p1', 'confirmed', '2026-09-18', 50000), claim('3', 'p2', 'pending', '2026-10-21', 9000)];
    const lines = pendingFor('p1', claims);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(25000);
    expect(lines[0].status).toBe('pending');
  });
});

describe('corrections', () => {
  it('a correction takes the payment back: the owed amount goes up again', () => {
    const charges = [charge('c1', 'fee', 40000, 2026, 9, 1)];
    const paid = rec('P1', '2026-09-05', [{ chargeId: 'c1', amount: 40000 }]);
    const fixed = { ...rec('R1', '2026-09-06', [{ chargeId: 'c1', amount: -40000 }]), kind: 'reversal' as const, receiptNumber: null };
    const st = buildStatement({ pupilId: 'p1', charges, records: [paid, fixed, rec('P2', '2026-09-07', [{ chargeId: 'c1', amount: 40000 }])], from: '2026-09-01', to: '2026-09-30' });
    expect(st.closing).toBe(0);
    expect(st.lines.find((l) => l.txId === 'R1')?.debit).toBe(40000);
  });
});

