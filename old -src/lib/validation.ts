/**
 * PAYMENT ALLOCATION VALIDATION (pure, no Firebase)
 * Used by the parent submission form, the admin direct-entry form,
 * and as a mirror of the rules the server-side Firestore rules enforce.
 */
import type { Allocation, Charge } from '../types';
import type { Kobo } from './money';
import { availableForNewSubmission } from './ledger';
import { sumKobo } from './money';

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export function validateAllocations(args: {
  paymentAmount: Kobo;
  allocations: Allocation[];
  /** charges the parent is allowed to allocate to, keyed by chargeId */
  chargesById: Map<string, Charge>;
  confirmed: Allocation[];
  pending: Allocation[];
  allowedPupilIds: Set<string>;
}): ValidationResult {
  const errors: string[] = [];
  const { paymentAmount, allocations, chargesById, confirmed, pending, allowedPupilIds } = args;

  if (!Number.isSafeInteger(paymentAmount) || paymentAmount <= 0) {
    errors.push('The payment amount must be greater than zero.');
  }
  if (allocations.length === 0) {
    errors.push('Allocate the payment to at least one fee.');
  }

  for (const a of allocations) {
    if (!Number.isSafeInteger(a.amount) || a.amount <= 0) {
      errors.push('Every allocation must be a positive amount.');
      continue;
    }
    const charge = chargesById.get(a.chargeId);
    if (!charge) {
      errors.push('An allocation refers to a fee that does not exist.');
      continue;
    }
    if (charge.pupilId !== a.pupilId || charge.termId !== a.termId || charge.sessionId !== a.sessionId || charge.category !== a.category) {
      errors.push('An allocation does not match its fee record.');
      continue;
    }
    if (!allowedPupilIds.has(a.pupilId)) {
      errors.push('An allocation is for a pupil not linked to your account.');
      continue;
    }
    const available = availableForNewSubmission(charge, confirmed, pending);
    if (a.amount > available) {
      errors.push(`An allocation exceeds the amount still owed on ${charge.description}.`);
    }
  }

  const total = sumKobo(allocations.map((a) => a.amount));
  if (total !== paymentAmount) {
    errors.push('The allocations must add up to exactly the payment amount.');
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors: Array.from(new Set(errors)) };
}

/**
 * APPROVAL GUARD (pure).
 * An administrator may only approve a claim exactly as the parent submitted it.
 * Any change to the amount or allocations must be done by rejecting the claim
 * with a reason so the parent can resubmit. This prevents silent edits at approval.
 */
export function checkApprovalMatchesClaim(claim: {
  amount: Kobo; allocations: Allocation[];
}, approval: { amount: Kobo; allocations: Allocation[] }): ValidationResult {
  const errors: string[] = [];
  if (claim.amount !== approval.amount) {
    errors.push('The approved amount must match the amount the parent submitted.');
  }
  const key = (a: Allocation) => [a.chargeId, a.pupilId, a.sessionId, a.termId, a.category, a.amount].join('|');
  const claimed = claim.allocations.map(key).sort();
  const approved = approval.allocations.map(key).sort();
  if (claimed.length !== approved.length || claimed.some((k, i) => k !== approved[i])) {
    errors.push('The approved allocations must match the parent’s allocations. Reject with a reason so the parent can resubmit.');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
