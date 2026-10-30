/**
 * Account statement for one pupil over a period. Pure: no database.
 * Convention: a debit increases the amount owed; a credit reduces it.
 * Opening balance + debits - credits = closing balance.
 * Only CONFIRMED payments count. Pending and rejected claims never appear here.
 */
import type { Charge, ChildClaim, ChildPaymentRecord } from '../types';
import type { Kobo } from './money';

export interface LedgerLine {
  date: string;            // YYYY-MM-DD
  txId: string;            // immutable internal ID: charge ID or payment ID
  receiptNo: string | null;
  description: string;
  payer: string | null;    // who paid (for a payment line)
  debit: Kobo;
  credit: Kobo;
  balance: Kobo;           // running balance after this line
  note: string | null;     // e.g. advance payment not yet applied (no balance effect)
}

export interface Statement {
  opening: Kobo;
  debits: Kobo;
  credits: Kobo;
  closing: Kobo;
  lines: LedgerLine[];
}

/** Local calendar date (YYYY-MM-DD) for a timestamp in milliseconds. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Entry { date: string; txId: string; receiptNo: string | null; description: string; payer: string | null; debit: Kobo; credit: Kobo; note: string | null }

export function buildStatement(args: {
  pupilId: string; charges: Charge[]; records: ChildPaymentRecord[]; from: string; to: string;
}): Statement {
  if (args.from > args.to) throw new Error('The start date must be before the end date.');
  const entries: Entry[] = [];

  for (const c of args.charges) {
    if (c.pupilId !== args.pupilId) continue;
    const date = localDate(c.createdAt);
    if (c.kind === 'discount') {
      entries.push({ date, txId: c.id, receiptNo: null, description: `Discount: ${c.category}${c.reason ? ` (${c.reason})` : ''}`, payer: null, debit: 0, credit: c.amount, note: null });
    } else {
      const label = c.kind === 'opening_balance' ? 'Brought forward' : 'Charged';
      entries.push({ date, txId: c.id, receiptNo: null, description: `${label}: ${c.category}`, payer: null, debit: c.amount, credit: 0, note: null });
    }
  }

  // Child-level records: the same for every linked guardian, with who paid on each line.
  for (const r of args.records) {
    if (r.pupilId !== args.pupilId) continue;
    const verb = r.kind === 'advance_application' ? 'Advance applied' : r.kind === 'reversal' ? 'Corrected (cancelled)' : 'Paid';
    for (const a of r.allocations) {
      if (a.amount < 0) {
        // A correction takes the payment back: the amount owed goes up again.
        entries.push({ date: r.paymentDate, txId: r.paymentId, receiptNo: null, description: `${verb}: ${a.category}`, payer: null, debit: -a.amount, credit: 0, note: 'Earlier payment cancelled. See the correction note.' });
      } else {
        entries.push({ date: r.paymentDate, txId: r.paymentId, receiptNo: r.receiptNumber, description: `${verb}: ${a.category}`, payer: r.payerName, debit: 0, credit: a.amount, note: null });
      }
    }
    if (r.advanceKobo > 0) {
      // Advance money: shown for information. It changes no balance until the school applies it to a fee.
      entries.push({ date: r.paymentDate, txId: r.paymentId, receiptNo: r.receiptNumber, description: 'Advance received, not yet applied', payer: r.payerName, debit: 0, credit: 0, note: 'Held for this child. Applied to a fee when the school does so.' });
    }
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.txId < b.txId ? -1 : a.txId > b.txId ? 1 : 0));

  let opening = 0;
  for (const e of entries) if (e.date < args.from) opening += e.debit - e.credit;

  let running = opening, debits = 0, credits = 0;
  const lines: LedgerLine[] = [];
  for (const e of entries) {
    if (e.date < args.from || e.date > args.to) continue;
    running += e.debit - e.credit;
    debits += e.debit; credits += e.credit;
    lines.push({ date: e.date, txId: e.txId, receiptNo: e.receiptNo, description: e.description, payer: e.payer, debit: e.debit, credit: e.credit, balance: running, note: e.note });
  }
  const closing = opening + debits - credits;
  if (closing !== running) throw new Error('The statement does not reconcile. Please report this to the school.');
  return { opening, debits, credits, closing, lines };
}

export interface PendingLine { date: string; ref: string; payer: string; amount: Kobo; status: 'pending' }

/** Transfers waiting for the school, for one child. Shown separately; never part of the balance. */
export function pendingFor(pupilId: string, claims: ChildClaim[]): PendingLine[] {
  return claims
    .filter((c) => c.pupilId === pupilId && c.status === 'pending')
    .sort((a, b) => (a.transferDate < b.transferDate ? -1 : a.transferDate > b.transferDate ? 1 : 0))
    .map((c) => ({ date: c.transferDate, ref: c.bankReference || c.submissionId.slice(0, 8), payer: c.payerName, amount: c.amountForChild, status: 'pending' as const }));
}
