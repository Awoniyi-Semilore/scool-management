import { describe, it, expect } from 'vitest';
import { computeChargeBalances, pupilTotals } from './ledger';
import { buildStatement } from './statement';
import { reversalAllocations } from '../services/data';
import type { Allocation, Charge, ChildPaymentRecord } from '../types';

const fee: Charge = { id: 'c1', pupilId: 'p1', sessionId: 's', termId: 't', category: 'Tuition', description: 'Tuition', kind: 'fee', amount: 4000000, createdBy: 'a', createdAt: new Date(2026, 8, 1).getTime(), reason: null, paidKobo: 0 };
const pay: Allocation = { pupilId: 'p1', sessionId: 's', termId: 't', category: 'Tuition', chargeId: 'c1', amount: 4000000 };

function owed(allocs: Allocation[]) {
  return pupilTotals([fee], allocs, []).outstanding;
}

describe('a correction moves the balance the right way', () => {
  it('owing -> paid -> corrected (owing again) -> paid correctly', () => {
    expect(owed([])).toBe(4000000);                           // before any payment
    expect(owed([pay])).toBe(0);                               // paid
    const corrected = [pay, ...reversalAllocations([pay])];    // the reversal cancels the payment
    expect(owed(corrected)).toBe(4000000);                     // owed again
    const fixed = [...corrected, { ...pay, amount: 4000000 }]; // correct payment recorded
    expect(owed(fixed)).toBe(0);                               // paid, exactly once
  });

  it('a partial correction leaves the right amount owed', () => {
    const part: Allocation = { ...pay, amount: 1000000 };
    const corrected = [part, ...reversalAllocations([part])];
    expect(owed(corrected)).toBe(4000000);
  });

  it('the statement shows the same closing balance as the ledger', () => {
    const rec = (id: string, date: string, amount: number, kind: ChildPaymentRecord['kind'] = 'payment'): ChildPaymentRecord => ({
      id: `p1_${id}`, pupilId: 'p1', paymentId: id, kind, payerName: 'Mum', paymentDate: date, bankReference: id,
      receiptNumber: kind === 'reversal' ? null : 'TCS-' + id, advanceKobo: 0,
      allocations: [{ ...pay, amount }],
    });
    const records = [rec('P1', '2026-09-05', 4000000), rec('R1', '2026-09-06', -4000000, 'reversal'), rec('P2', '2026-09-07', 4000000)];
    const st = buildStatement({ pupilId: 'p1', charges: [fee], records, from: '2026-09-01', to: '2026-09-30' });
    expect(st.closing).toBe(0);
    expect(st.closing).toBe(owed([pay, ...reversalAllocations([pay]), pay]));
    expect(st.lines.find((l) => l.txId === 'R1')?.debit).toBe(4000000);
    expect(st.lines.find((l) => l.txId === 'P2')?.credit).toBe(4000000);
  });
});

describe('the ledger helper is still in use', () => {
  it('computeChargeBalances is available for the correction tests', () => {
    expect(typeof computeChargeBalances).toBe('function');
  });
});
