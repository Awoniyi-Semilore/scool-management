/**
 * LEDGER RULES (pure, no Firebase)
 * --------------------------------
 * Charges:   kind 'fee' and 'opening_balance' ADD to what is owed.
 *            kind 'discount' REDUCES what is owed.
 * Confirmed: a confirmed payment's allocations REDUCE the owed amount of the
 *            specific charge they name (matched by chargeId).
 * Pending:   pending submission allocations RESERVE availability only. They
 *            never reduce the official outstanding balance.
 *
 * Previous-term debt is never copied. A charge keeps its original termId and
 * category; a payment reduces that exact charge.
 */
import type { Allocation, Charge } from '../types';
import type { Kobo } from './money';
import { sumKobo } from './money';

export interface ChargeBalance {
  chargeId: string;
  termId: string;
  sessionId: string;
  category: Charge['category'];
  kind: Charge['kind'];
  pupilId: string;
  gross: Kobo;        // signed face value as charged (discount is negative)
  paid: Kobo;         // confirmed allocations applied to this charge
  reserved: Kobo;     // pending allocations (availability only)
  outstanding: Kobo;  // gross - paid, floored at 0 for owed lines
}

/** Signed value a charge contributes to the amount owed. */
export function signedCharge(c: Charge): Kobo {
  return c.kind === 'discount' ? -c.amount : c.amount;
}

/**
 * Compute per-charge balances.
 * Discounts reduce the fee they belong to (same pupil, session, term, category).
 * Confirmed allocations reduce the specific charge they name.
 * Pending allocations reserve availability only.
 */
export function computeChargeBalances(
  charges: Charge[],
  confirmed: Allocation[],
  pending: Allocation[],
): ChargeBalance[] {
  const paidBy = new Map<string, Kobo>();
  for (const a of confirmed) paidBy.set(a.chargeId, (paidBy.get(a.chargeId) ?? 0) + a.amount);
  const reservedBy = new Map<string, Kobo>();
  for (const a of pending) reservedBy.set(a.chargeId, (reservedBy.get(a.chargeId) ?? 0) + a.amount);

  // Each discount is applied to the fee lines in its own pupil/session/term/category group,
  // in order, never beyond the fee's face value.
  const discountLeft = new Map<string, Kobo>();
  const groupKey = (c: Charge) => `${c.pupilId}|${c.sessionId}|${c.termId}|${c.category}`;
  for (const c of charges) {
    if (c.kind === 'discount') {
      discountLeft.set(groupKey(c), (discountLeft.get(groupKey(c)) ?? 0) + c.amount);
    }
  }
  const discountOn = new Map<string, Kobo>();
  for (const c of charges) {
    if (c.kind !== 'fee' && c.kind !== 'opening_balance') continue;
    const key = groupKey(c);
    const pool = discountLeft.get(key) ?? 0;
    const take = Math.min(pool, c.amount);
    discountOn.set(c.id, take);
    discountLeft.set(key, pool - take);
  }

  return charges.map((c) => {
    if (c.kind === 'discount') {
      return { chargeId: c.id, termId: c.termId, sessionId: c.sessionId, category: c.category, kind: c.kind, pupilId: c.pupilId, gross: -c.amount, paid: 0, reserved: 0, outstanding: 0 };
    }
    const discount = discountOn.get(c.id) ?? 0;
    const gross = c.amount - discount;
    const paid = paidBy.get(c.id) ?? 0;
    const reserved = reservedBy.get(c.id) ?? 0;
    const outstanding = Math.max(0, gross - paid);
    return { chargeId: c.id, termId: c.termId, sessionId: c.sessionId, category: c.category, kind: c.kind, pupilId: c.pupilId, gross, paid, reserved, outstanding };
  });
}

export interface PupilTotals {
  totalCharges: Kobo;   // fees + opening balances (before discounts)
  discounts: Kobo;      // total discounts applied (positive number)
  amountPayable: Kobo;  // charges - discounts
  confirmedPaid: Kobo;  // allocations applied from confirmed payments
  outstanding: Kobo;    // amountPayable - confirmedPaid, never below 0 per line
  pendingReserved: Kobo;
}

export function pupilTotals(
  charges: Charge[],
  confirmed: Allocation[],
  pending: Allocation[],
): PupilTotals {
  const balances = computeChargeBalances(charges, confirmed, pending);
  const totalCharges = sumKobo(charges.filter((c) => c.kind !== 'discount').map((c) => c.amount));
  const discounts = sumKobo(charges.filter((c) => c.kind === 'discount').map((c) => c.amount));
  const confirmedPaid = sumKobo(confirmed.map((a) => a.amount));
  const pendingReserved = sumKobo(pending.map((a) => a.amount));
  const outstanding = sumKobo(balances.map((b) => b.outstanding));
  return {
    totalCharges,
    discounts,
    amountPayable: totalCharges - discounts,
    confirmedPaid,
    outstanding,
    pendingReserved,
  };
}

/**
 * How much of a specific charge is still open to a NEW submission.
 * Accounts for confirmed payments and other pending reservations.
 */
export function availableForNewSubmission(
  charge: Charge,
  confirmed: Allocation[],
  pending: Allocation[],
): Kobo {
  if (charge.kind === 'discount') return 0;
  const [b] = computeChargeBalances([charge], confirmed.filter((a) => a.chargeId === charge.id), pending.filter((a) => a.chargeId === charge.id));
  return Math.max(0, b.outstanding - b.reserved);
}

export type FeeChange = { kind: 'none' } | { kind: 'discount' | 'increase'; amount: Kobo };

/**
 * How to record a change to what one child pays for a fee, without rewriting history.
 * Lower amount -> discount of the difference. Higher -> an added fee of the difference.
 */
export function feeChangeFor(currentDue: Kobo, newAmount: Kobo): FeeChange {
  if (!Number.isSafeInteger(newAmount) || newAmount < 0) throw new Error('The new amount must be zero or more.');
  if (newAmount === currentDue) return { kind: 'none' };
  return newAmount < currentDue
    ? { kind: 'discount', amount: currentDue - newAmount }
    : { kind: 'increase', amount: newAmount - currentDue };
}
