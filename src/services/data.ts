/**
 * Firestore data access. Every financial write is a transaction or a
 * single document write, and every significant action writes an audit event.
 * Firestore security rules are the real enforcement; this layer is for
 * correct behaviour and clear error messages.
 */
import {
  collection, doc, addDoc, setDoc, updateDoc, getDoc, getDocs, query, where,
  runTransaction, onSnapshot, orderBy, type Unsubscribe, serverTimestamp, arrayUnion, writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type {
  Allocation, AuditEvent, Charge, ConfirmedPayment, FeeCategory, LinkRequest,
  ParentPupilLink, PaymentSubmission, Pupil, SchoolClass, AcademicSession, Term, UserProfile,
} from '../types';
import type { Kobo } from '../lib/money';
import { feeChangeFor } from '../lib/ledger';
import type { Teacher, TeacherRequest, WorkType, ResultRow, ResultSheet, PublishedResult, StatementRecord, BankDetails, ChildClaim, AdvanceCredit, ChildPaymentRecord } from '../types';
import type { Statement } from '../lib/statement';
import { gradeFor, subjectKey } from '../lib/results';
import { checkApprovalMatchesClaim, validateAllocations } from '../lib/validation';
import { computeChargeBalances, pupilTotals } from '../lib/ledger';

const now = () => Date.now();

function actor() {
  const u = auth.currentUser;
  if (!u) throw new Error('You are signed out. Sign in again to continue.');
  return { uid: u.uid, email: u.email ?? '' };
}

function strip<T extends object>(data: T): T {
  // Firestore rejects undefined; remove them before writing.
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;
}

export function listen<T>(q: Parameters<typeof onSnapshot>[0], cb: (rows: T[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(q as never, (snap: { docs: { id: string; data: () => object }[] }) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
  }, (e: Error) => onError(e));
}

export const col = {
  users: () => collection(db, 'users'),
  classes: () => collection(db, 'classes'),
  sessions: () => collection(db, 'sessions'),
  terms: () => collection(db, 'terms'),
  pupils: () => collection(db, 'pupils'),
  links: () => collection(db, 'parentLinks'),
  linkRequests: () => collection(db, 'linkRequests'),
  charges: () => collection(db, 'charges'),
  submissions: () => collection(db, 'paymentSubmissions'),
  payments: () => collection(db, 'payments'),
  receipts: () => collection(db, 'receipts'),
  audit: () => collection(db, 'auditEvents'),
};

async function audit(action: string, targetId: string, details: string) {
  const a = actor();
  await addDoc(col.audit(), strip<Omit<AuditEvent, 'id'>>({
    action, actorUid: a.uid, actorEmail: a.email, at: now(), targetId, details,
  }));
}

/* ---------- admin: setup ---------- */

export async function createSession(label: string, id: string): Promise<void> {
  const cleanId = id.trim();
  if (!/^[0-9]{4}-[0-9]{4}$/.test(cleanId)) throw new Error('Session ID must look like 2026-2027.');
  await setDoc(doc(db, 'sessions', cleanId), { id: cleanId, label: label.trim() || cleanId, active: false } satisfies AcademicSession);
  for (const ordinal of [1, 2, 3] as const) {
    const names = ['First Term', 'Second Term', 'Third Term'] as const;
    await setDoc(doc(db, 'terms', `${cleanId}_${ordinal}`), {
      id: `${cleanId}_${ordinal}`, sessionId: cleanId, name: names[ordinal - 1], ordinal,
      startDate: '', endDate: '', active: false,
    } satisfies Term);
  }
  await audit('session.create', cleanId, `Created session ${cleanId} with three terms`);
}

/** Only one term may be active at a time. Done in one transaction. */
export async function setActiveTerm(termId: string, sessionId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const termsSnap = await getDocs(query(col.terms(), where('active', '==', true)));
    termsSnap.docs.forEach((d) => tx.update(d.ref, { active: false }));
    tx.update(doc(db, 'terms', termId), { active: true });
    tx.update(doc(db, 'sessions', sessionId), { active: true });
  });
  await audit('term.activate', termId, `Set active term to ${termId}`);
}

export async function saveClass(name: string, id?: string, meta?: { level: string; colour: string }): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a class name.');
  const ref = id ? doc(db, 'classes', id) : doc(col.classes());
  await setDoc(ref, { id: ref.id, name: trimmed, ...(meta ?? {}) } satisfies SchoolClass);
  return ref.id;
}

/** Duplicate admission numbers are rejected so a pupil can never be double-counted. */
export async function createPupil(input: { admissionNumber: string; firstName: string; lastName: string; classId: string }): Promise<string> {
  // Admission number is optional. When given, it must be unique.
  const adm = input.admissionNumber.trim().toUpperCase();
  if (!input.firstName.trim() || !input.lastName.trim()) throw new Error('First and last name are required.');
  if (!input.classId) throw new Error('Choose a class.');
  if (adm) {
    const existing = await getDocs(query(col.pupils(), where('admissionNumber', '==', adm)));
    if (!existing.empty) throw new Error(`Admission number ${adm} already exists.`);
  }
  const ref = await addDoc(col.pupils(), strip<Omit<Pupil, 'id'>>({
    admissionNumber: adm,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    classId: input.classId,
    createdAt: now(),
  }));
  await setDoc(doc(db, 'classRosters', input.classId), { classId: input.classId, pupils: arrayUnion({ id: ref.id, name: `${input.firstName.trim()} ${input.lastName.trim()}`, admissionNumber: adm }) }, { merge: true });
  await audit('pupil.create', ref.id, `Created pupil ${adm}`);
  return ref.id;
}

/* ---------- admin: fees ---------- */

export async function addCharge(input: {
  pupilId: string; sessionId: string; termId: string; category: FeeCategory;
  kind: Charge['kind']; amount: Kobo; description: string; reason: string | null;
}): Promise<void> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('Amount must be greater than zero.');
  const a = actor();
  const ref = await addDoc(col.charges(), strip<Omit<Charge, 'id'>>({
    pupilId: input.pupilId, sessionId: input.sessionId, termId: input.termId, category: input.category,
    kind: input.kind, amount: input.amount, description: input.description.trim() || input.kind,
    createdBy: a.uid, createdAt: now(), reason: input.reason, paidKobo: 0,
  }));
  await audit(`charge.${input.kind}`, ref.id, `${input.kind} ${input.amount} kobo for pupil ${input.pupilId}`);
}

/* ---------- admin: parent-pupil links ---------- */

export async function decideLinkRequest(req: LinkRequest, decision: 'approved' | 'rejected', opts: { pupilId?: string; rejectionReason?: string }): Promise<void> {
  const a = actor();
  if (decision === 'rejected' && !opts.rejectionReason?.trim()) throw new Error('Give a reason for rejecting this request.');
  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, 'linkRequests', req.id);
    const snap = await tx.get(reqRef);
    if (!snap.exists() || snap.data().status !== 'pending') throw new Error('This request has already been decided.');
    if (decision === 'approved') {
      if (!opts.pupilId) throw new Error('Choose or create the pupil before approving.');
      const linkRef = doc(db, 'parentLinks', `${req.parentUid}_${opts.pupilId}`);
      tx.set(linkRef, strip<ParentPupilLink>({
        id: linkRef.id, parentUid: req.parentUid, pupilId: opts.pupilId, status: 'approved', decidedBy: a.uid, decidedAt: now(),
      }));
    }
    tx.update(reqRef, strip({
      status: decision, decidedBy: a.uid, decidedAt: now(),
      rejectionReason: decision === 'rejected' ? opts.rejectionReason!.trim() : null,
    }));
  });
  await audit(`link.${decision}`, req.id, decision === 'approved' ? `Linked parent ${req.parentUid} to pupil ${opts.pupilId}` : `Rejected: ${opts.rejectionReason}`);
}

export async function revokeLink(linkId: string): Promise<void> {
  const a = actor();
  await updateDoc(doc(db, 'parentLinks', linkId), { status: 'revoked', decidedBy: a.uid, decidedAt: now() });
  await audit('link.revoke', linkId, 'Revoked parent access');
}

/* ---------- payments ---------- */

/** Parent creates a PENDING claim. Rules block any status other than pending. */
export async function submitPaymentClaim(input: {
  payerName: string; amount: Kobo; transferDate: string; bankReference: string;
  allocations: Allocation[]; evidencePath: string | null; duplicateWarning: string | null;
  advanceKobo?: Kobo; advancePupilId?: string | null; note?: string | null;
}): Promise<string> {
  const a = actor();
  const ref = await addDoc(col.submissions(), strip<Omit<PaymentSubmission, 'id'>>({
    parentUid: a.uid,
    payerName: input.payerName.trim(),
    amount: input.amount,
    transferDate: input.transferDate,
    bankReference: input.bankReference.trim(),
    evidencePath: input.evidencePath,
    status: 'pending',
    allocations: input.allocations,
    duplicateWarning: input.duplicateWarning,
    advanceKobo: input.advanceKobo ?? 0,
    advancePupilId: input.advancePupilId ?? null,
    note: input.note?.trim() || null,
    rejectionReason: null,
    createdAt: now(),
    decidedBy: null,
    decidedAt: null,
  }));
  // Per-child copies of this claim, so each linked guardian sees the same 'not yet confirmed' list.
  const pupilIds = Array.from(new Set([...input.allocations.map((x) => x.pupilId), ...(input.advancePupilId ? [input.advancePupilId] : [])]));
  for (const pid of pupilIds) {
    const forChild = input.allocations.filter((x) => x.pupilId === pid).reduce((t, x) => t + x.amount, 0)
      + (input.advancePupilId === pid ? (input.advanceKobo ?? 0) : 0);
    await setDoc(doc(db, 'childClaims', `${ref.id}_${pid}`), {
      id: `${ref.id}_${pid}`, submissionId: ref.id, pupilId: pid, parentUid: a.uid,
      payerName: input.payerName.trim(), transferDate: input.transferDate, bankReference: input.bankReference.trim(),
      amountForChild: forChild, status: 'pending', createdAt: now(),
    } satisfies ChildClaim);
  }
  return ref.id;
}

/**
 * Admin approves a claim OR records a payment directly. Both paths use the
 * same transaction.
 *
 * Balance safety: each fee charge stores a running `paidKobo` counter. The
 * transaction reads every charge it touches, re-checks each allocation against
 * the CURRENT counter (so two approvals cannot both claim the same balance),
 * then writes the payment, updates each counter once, marks the claim
 * confirmed, and writes the receipt. Either everything happens or nothing does.
 */
export async function confirmPayment(args: {
  submission: PaymentSubmission | null;
  payerName: string;
  payerUid: string;
  amount: Kobo;
  paymentDate: string;
  bankReference: string;
  allocations: Allocation[];
  allowedPupilIds: Set<string>;
  /** Money for the next term, included in amount but assigned to no fee. */
  advanceKobo?: Kobo;
  advancePupilId?: string | null;
  /** 'advance_application' applies held advance money to a fee: no new money, so no receipt. */
  kind?: 'payment' | 'advance_application';
  creditId?: string | null;
}): Promise<string> {
  const advance = args.advanceKobo ?? 0;
  if (!Number.isSafeInteger(advance) || advance < 0 || advance > args.amount) throw new Error('The advance amount is not valid.');
  const a = actor();
  const chargeIds = Array.from(new Set(args.allocations.map((x) => x.chargeId)));
  const isApplication = args.kind === 'advance_application';
  return runTransaction(db, async (tx) => {
    // Digital receipts use their own series (TCS-000001...). Paper book numbers are plain digits, so they never clash.
    const counterRef = doc(db, 'counters', 'receipts');
    const counterSnap = isApplication ? null : await tx.get(counterRef);
    const nextNo: number = counterSnap && counterSnap.exists() ? counterSnap.data().next : 1;
    const creditRef = args.creditId ? doc(db, 'advanceCredits', args.creditId) : null;
    const creditSnap = creditRef ? await tx.get(creditRef) : null;
    if (isApplication) {
      if (!creditSnap || !creditSnap.exists()) throw new Error('This advance no longer exists.');
      const cr = creditSnap.data() as AdvanceCredit;
      if (args.amount <= 0 || args.amount > cr.amount - cr.appliedKobo) throw new Error('That is more than the advance still available.');
      if (args.allocations.some((x) => x.pupilId !== cr.pupilId)) throw new Error('This advance is for a different child.');
    }
    const chargeRefs = chargeIds.map((id) => doc(db, 'charges', id));
    const chargeSnaps = await Promise.all(chargeRefs.map((r) => tx.get(r)));
    const chargesById = new Map<string, Charge>();
    const paidById = new Map<string, Kobo>();
    chargeSnaps.forEach((s) => {
      if (!s.exists()) return;
      const data = s.data() as Omit<Charge, 'id'> & { paidKobo?: number };
      chargesById.set(s.id, { id: s.id, ...data });
      paidById.set(s.id, data.paidKobo ?? 0);
    });

    if (args.submission) {
      const subSnap = await tx.get(doc(db, 'paymentSubmissions', args.submission.id));
      if (!subSnap.exists() || subSnap.data().status !== 'pending') {
        throw new Error('This submission has already been decided.');
      }
      // Approve exactly what the parent claimed. Any change must go through reject + resubmit.
      const stored = subSnap.data() as PaymentSubmission;
      const guard = checkApprovalMatchesClaim(
        { amount: stored.amount, allocations: stored.allocations },
        { amount: args.amount, allocations: args.allocations },
      );
      if (!guard.ok) throw new Error(guard.errors.join(' '));
    }

    // Re-confirm the parent still has an APPROVED link to every pupil being paid.
    // Links can be revoked between submission and approval.
    if (args.payerUid) {
      const pupilIds = Array.from(new Set(args.allocations.map((x) => x.pupilId)));
      const linkSnaps = await Promise.all(pupilIds.map((pid) => tx.get(doc(db, 'parentLinks', `${args.payerUid}_${pid}`))));
      if (linkSnaps.some((s) => !s.exists() || s.data().status !== 'approved')) {
        throw new Error('The parent is no longer linked to one of these pupils. Reject this claim.');
      }
    }

    // Validate against CURRENT paid counters, expressed as confirmed allocations.
    const confirmedAsAllocs: Allocation[] = chargeIds.map((id) => {
      const c = chargesById.get(id);
      return { pupilId: c?.pupilId ?? '', sessionId: c?.sessionId ?? '', termId: c?.termId ?? '', category: c?.category ?? 'other', chargeId: id, amount: paidById.get(id) ?? 0 };
    });
    const check = validateAllocations({
      paymentAmount: args.amount - advance,
      allocations: args.allocations,
      chargesById,
      confirmed: confirmedAsAllocs,
      pending: [],
      allowedPupilIds: args.allowedPupilIds,
    });
    if (!check.ok) throw new Error(check.errors.join(' '));

    // Write payment, counters, claim status and receipt together.
    const payRef = doc(col.payments());
    const receiptNumber = isApplication ? null : `TCS-${String(nextNo).padStart(6, '0')}`;
    if (!isApplication) tx.set(counterRef, { next: nextNo + 1 });
    tx.set(payRef, strip({
      id: payRef.id,
      submissionId: args.submission?.id ?? null,
      payerUid: args.payerUid || null,
      payerName: args.payerName,
      amount: args.amount,
      paymentDate: args.paymentDate,
      bankReference: args.bankReference,
      allocations: args.allocations,
      advanceKobo: advance,
      kind: isApplication ? 'advance_application' : 'payment',
      recordedBy: a.uid,
      recordedAt: now(),
      receiptNumber,
    }));
    const addByCharge = new Map<string, Kobo>();
    for (const alloc of args.allocations) addByCharge.set(alloc.chargeId, (addByCharge.get(alloc.chargeId) ?? 0) + alloc.amount);
    for (const [chargeId, add] of addByCharge) {
      tx.update(doc(db, 'charges', chargeId), { paidKobo: (paidById.get(chargeId) ?? 0) + add });
    }
    if (args.submission) {
      tx.update(doc(db, 'paymentSubmissions', args.submission.id), {
        status: 'confirmed', decidedBy: a.uid, decidedAt: now(),
      });
    }
    if (receiptNumber) {
      tx.set(doc(db, 'receipts', receiptNumber), strip({
        id: receiptNumber, paymentId: payRef.id, payerUid: args.payerUid || null,
        pupilIds: Array.from(new Set(args.allocations.map((x) => x.pupilId))),
        amount: args.amount, issuedAt: now(), voided: false, replacesReceiptId: null,
      }));
    }
    if (creditRef && creditSnap) {
      tx.update(creditRef, { appliedKobo: ((creditSnap.data()?.appliedKobo) ?? 0) + args.amount });
    }
    // Per-child copies, for every child in this payment (and the child an advance is for).
    const childIds = Array.from(new Set([...args.allocations.map((x) => x.pupilId), ...(advance > 0 && args.advancePupilId ? [args.advancePupilId] : [])]));
    for (const pid of childIds) {
      tx.set(doc(db, 'childPayments', `${pid}_${payRef.id}`), strip({
        id: `${pid}_${payRef.id}`, pupilId: pid, paymentId: payRef.id,
        kind: isApplication ? 'advance_application' : 'payment',
        payerName: args.payerName, paymentDate: args.paymentDate, bankReference: args.bankReference,
        receiptNumber, allocations: args.allocations.filter((x) => x.pupilId === pid),
        advanceKobo: !isApplication && advance > 0 && args.advancePupilId === pid ? advance : 0,
      }));
    }
    // A new advance is held for the child the parent chose.
    if (!isApplication && advance > 0 && args.advancePupilId) {
      tx.set(doc(db, 'advanceCredits', payRef.id), strip({
        id: payRef.id, paymentId: payRef.id, pupilId: args.advancePupilId, payerUid: args.payerUid || null,
        payerName: args.payerName, amount: advance, appliedKobo: 0, createdAt: now(),
      }));
    }
    // Child-level claim records move from pending to confirmed.
    if (args.submission) {
      for (const pid of Array.from(new Set([...args.allocations.map((x) => x.pupilId), ...(args.submission.advancePupilId ? [args.submission.advancePupilId] : [])]))) {
        tx.set(doc(db, 'childClaims', `${args.submission.id}_${pid}`), { status: 'confirmed' }, { merge: true });
      }
    }
    return payRef.id;
  });
}

export async function rejectSubmission(subId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error('Give a reason for rejecting this submission.');
  const a = actor();
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'paymentSubmissions', subId);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== 'pending') throw new Error('This submission has already been decided.');
    const sub = snap.data() as PaymentSubmission;
    tx.update(ref, { status: 'rejected', rejectionReason: reason.trim(), decidedBy: a.uid, decidedAt: now() });
    for (const pid of Array.from(new Set([...sub.allocations.map((x) => x.pupilId), ...(sub.advancePupilId ? [sub.advancePupilId] : [])]))) {
      tx.set(doc(db, 'childClaims', `${subId}_${pid}`), { status: 'rejected' }, { merge: true });
    }
  });
  await audit('submission.reject', subId, reason.trim());
}

/* ---------- helpers for screens ---------- */

export function balancesFor(charges: Charge[], payments: ConfirmedPayment[], pending: PaymentSubmission[], pupilId: string) {
  const confirmed = payments.flatMap((p) => p.allocations).filter((a) => a.pupilId === pupilId);
  const pendingAlloc = pending.filter((s) => s.status === 'pending').flatMap((s) => s.allocations).filter((a) => a.pupilId === pupilId);
  const mine = charges.filter((c) => c.pupilId === pupilId);
  return {
    totals: pupilTotals(mine, confirmed, pendingAlloc),
    lines: computeChargeBalances(mine, confirmed, pendingAlloc),
  };
}

export type { UserProfile, LinkRequest, PaymentSubmission, Charge, ConfirmedPayment, Pupil, SchoolClass, AcademicSession, Term, Allocation, ParentPupilLink, AuditEvent };
export { serverTimestamp, getDoc, orderBy, actor };

/** Record the evidence path on a pending claim after a successful upload. */
export async function updateSubmissionEvidence(submissionId: string, path: string): Promise<void> {
  await updateDoc(doc(db, 'paymentSubmissions', submissionId), { evidencePath: path });
}

/* ---------- admin: standard fees per class and term ---------- */

/** Saves the standard fee list for a class in one term. Affects new pupils only. */
export async function saveClassFees(classId: string, sessionId: string, termId: string, items: { name: string; amount: Kobo }[]): Promise<void> {
  const clean = items.map((i) => ({ name: i.name.trim(), amount: i.amount })).filter((i) => i.name);
  if (clean.some((i) => !Number.isSafeInteger(i.amount) || i.amount < 0)) throw new Error('Each fee needs an amount of zero or more.');
  const names = clean.map((i) => i.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Two fees have the same name. Rename one of them.');
  const id = `${classId}_${termId}`;
  await setDoc(doc(db, 'classFees', id), { id, classId, sessionId, termId, items: clean });
  await audit('classFees.save', id, `Saved ${clean.length} standard fee(s)`);
}

/** Copies the class's standard fees onto a pupil for one term. Returns how many fees were added. */
export async function applyClassFees(pupilId: string, classId: string, sessionId: string, termId: string): Promise<number> {
  const snap = await getDoc(doc(db, 'classFees', `${classId}_${termId}`));
  if (!snap.exists()) return 0;
  const items = (snap.data().items ?? []) as { name: string; amount: Kobo }[];
  let added = 0;
  for (const it of items) {
    if (it.amount <= 0) continue;
    await addCharge({ pupilId, sessionId, termId, category: it.name, kind: 'fee', amount: it.amount, description: it.name, reason: null });
    added++;
  }
  return added;
}

/**
 * Changes what one child pays for one fee. Nothing is overwritten: a lower amount is recorded
 * as a discount, a higher amount as an added fee, and zero means "not charged".
 */
export async function setFeeAmount(args: {
  pupilId: string; sessionId: string; termId: string; category: string;
  currentDue: Kobo; newAmount: Kobo; reason: string | null;
}): Promise<void> {
  const change = feeChangeFor(args.currentDue, args.newAmount);
  if (change.kind === 'none') throw new Error('The amount is already set to this value.');
  const reason = args.reason?.trim() || null;
  if (change.kind === 'discount') {
    await addCharge({
      pupilId: args.pupilId, sessionId: args.sessionId, termId: args.termId, category: args.category,
      kind: 'discount', amount: change.amount,
      description: args.newAmount === 0 ? `Not charged: ${args.category}` : `Discount: ${args.category}`,
      reason,
    });
  } else {
    await addCharge({
      pupilId: args.pupilId, sessionId: args.sessionId, termId: args.termId, category: args.category,
      kind: 'fee', amount: change.amount, description: `Increase: ${args.category}`, reason,
    });
  }
}

/* ---------- access requests (teacher or staff) ---------- */

/** The head teacher approves or rejects a request. The person's role changes only on approval. */
export async function decideAccessRequest(uid: string, approve: boolean): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('This request no longer exists.');
  const data = snap.data() as UserProfile;
  if (data.requestStatus !== 'pending' || !data.requestedRole) throw new Error('This request has already been decided.');
  await updateDoc(ref, approve
    ? { role: data.requestedRole, requestStatus: 'approved' }
    : { requestStatus: 'rejected' });
  if (approve && data.requestedRole === 'teacher') {
    const t = await getDocs(query(collection(db, 'teachers'), where('email', '==', data.email.toLowerCase())));
    if (!t.empty) await syncTeacherAccess({ id: t.docs[0].id, ...(t.docs[0].data() as Omit<Teacher, 'id'>) });
  }
  await audit('access.decide', uid, approve ? `Approved as ${data.requestedRole}` : `Rejected ${data.requestedRole} request`);
}

/* ---------- teachers and their requests (Stage 2) ---------- */

import { cleanSubjects } from '../lib/schoolLevels';

export async function createTeacher(input: { fullName: string; email: string; workType: WorkType; classIds: string[]; subjects: string[] }): Promise<string> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) throw new Error('Enter the teacher’s full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address. The teacher signs in with it.');
  if (input.workType !== 'full' && input.workType !== 'part') throw new Error('Choose full time or part time.');
  const dup = await getDocs(query(collection(db, 'teachers'), where('email', '==', email)));
  if (!dup.empty) throw new Error('A teacher with this email already exists.');
  const ref = doc(collection(db, 'teachers'));
  const t: Teacher = {
    id: ref.id, fullName, email, workType: input.workType,
    classIds: [...new Set(input.classIds)], subjects: cleanSubjects(input.subjects), createdAt: Date.now(),
  };
  await setDoc(ref, t);
  await setDoc(doc(db, 'teacherInvites', email), { email, teaching: { classIds: t.classIds, subjects: t.subjects }, teacherId: ref.id });
  await syncTeacherAccess(t);
  await audit('teacher.create', ref.id, `${fullName} · ${input.workType === 'full' ? 'full time' : 'part time'}`);
  return ref.id;
}

export async function updateTeacher(id: string, input: { workType: WorkType; classIds: string[]; subjects: string[] }): Promise<void> {
  if (input.workType !== 'full' && input.workType !== 'part') throw new Error('Choose full time or part time.');
  await updateDoc(doc(db, 'teachers', id), {
    workType: input.workType, classIds: [...new Set(input.classIds)], subjects: cleanSubjects(input.subjects),
  });
  const fresh = await getDoc(doc(db, 'teachers', id));
  await syncTeacherAccess({ id, ...(fresh.data() as Omit<Teacher, 'id'>) });
  await audit('teacher.update', id, `Now ${input.workType === 'full' ? 'full time' : 'part time'}, ${input.classIds.length} class(es), ${cleanSubjects(input.subjects).length} subject(s)`);
}

/** A teacher asks for a subject to be added, or a pupil to be added to one of their classes. */
export async function createTeacherRequest(teacher: Teacher, req:
  | { kind: 'subject'; subject: string }
  | { kind: 'pupil'; firstName: string; lastName: string; admissionNumber: string; classId: string }): Promise<void> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again to send a request.');
  const ref = doc(collection(db, 'teacherRequests'));
  const base = { id: ref.id, requesterUid: me.uid, teacherId: teacher.id, teacherName: teacher.fullName, status: 'pending' as const, reason: null, decidedAt: null, createdAt: Date.now() };
  if (req.kind === 'subject') {
    const subject = req.subject.trim();
    if (!subject) throw new Error('Type the name of the subject.');
    await setDoc(ref, { ...base, kind: 'subject', subject, pupil: null } satisfies TeacherRequest);
  } else {
    if (!req.firstName.trim() || !req.lastName.trim()) throw new Error('Enter the pupil’s first and last name.');
    if (!teacher.classIds.includes(req.classId)) throw new Error('You can only add a pupil to one of your own classes.');
    const pupil = { firstName: req.firstName.trim(), lastName: req.lastName.trim(), admissionNumber: req.admissionNumber.trim().toUpperCase(), classId: req.classId };
    await setDoc(ref, { ...base, kind: 'pupil', subject: null, pupil } satisfies TeacherRequest);
  }
}

/** Head teacher decides a request. Approving a subject adds it to the teacher; approving a pupil creates the pupil with the usual duplicate check. */
export async function decideTeacherRequest(req: TeacherRequest, approve: boolean, reason?: string): Promise<void> {
  if (req.status !== 'pending') throw new Error('This request has already been decided.');
  if (!approve && !reason?.trim()) throw new Error('Write a short reason for rejecting this request.');
  if (approve) {
    if (req.kind === 'subject' && req.subject) {
      const t = await getDoc(doc(db, 'teachers', req.teacherId));
      if (!t.exists()) throw new Error('This teacher no longer exists.');
      const subjects = cleanSubjects([...((t.data().subjects ?? []) as string[]), req.subject]);
      await updateDoc(doc(db, 'teachers', req.teacherId), { subjects });
    }
    if (req.kind === 'pupil' && req.pupil) await createPupil(req.pupil);
  }
  await updateDoc(doc(db, 'teacherRequests', req.id), {
    status: approve ? 'approved' : 'rejected', reason: approve ? null : reason!.trim(), decidedAt: Date.now(),
  });
  await audit('teacherRequest.decide', req.id, approve ? `Approved ${req.kind}` : `Rejected ${req.kind}: ${reason}`);
}

/* ---------- teacher access sync: sign-in profile and class rosters ---------- */

/** Copies the teacher's classes and subjects onto their sign-in profile, and refreshes each class roster. */
export async function syncTeacherAccess(t: Teacher): Promise<void> {
  const teaching = { classIds: t.classIds, subjects: t.subjects };
  await setDoc(doc(db, 'teacherInvites', t.email.toLowerCase()), { email: t.email.toLowerCase(), teaching, teacherId: t.id }, { merge: true });
  const users = await getDocs(query(collection(db, 'users'), where('email', '==', t.email.toLowerCase())));
  for (const u of users.docs) {
    await updateDoc(u.ref, { teaching });
  }
  for (const classId of t.classIds) await rebuildRoster(classId);
}

export async function rebuildRoster(classId: string): Promise<void> {
  const pupils = await getDocs(query(collection(db, 'pupils'), where('classId', '==', classId)));
  const list = pupils.docs.map((d) => {
    const p = d.data() as { firstName: string; lastName: string; admissionNumber: string };
    return { id: d.id, name: `${p.firstName} ${p.lastName}`, admissionNumber: p.admissionNumber };
  });
  await setDoc(doc(db, 'classRosters', classId), { classId, pupils: list });
}

/* ---------- result sheets (Stage 3) ---------- */

export async function createResultSheet(base: Omit<ResultSheet, 'id' | 'status' | 'reason' | 'submittedAt' | 'decidedAt' | 'createdAt'>): Promise<string> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again.');
  const ref = doc(collection(db, 'resultSheets'));
  await setDoc(ref, { ...base, id: ref.id, status: 'draft', reason: null, submittedAt: null, decidedAt: null, createdAt: Date.now() } satisfies ResultSheet);
  return ref.id;
}

/** Saves a draft, or sends it for approval (rows must all be complete and valid). */
export async function saveResultRows(sheetId: string, rows: ResultRow[], send: boolean): Promise<void> {
  await updateDoc(doc(db, 'resultSheets', sheetId), {
    rows,
    status: send ? 'pending' : 'draft',
    submittedAt: send ? Date.now() : null,
  });
  await audit(send ? 'resultSheet.submit' : 'resultSheet.draft', sheetId, send ? 'Sent for approval' : 'Draft saved');
}

/**
 * Head teacher decides a sheet. Approval publishes each pupil's result (replacing the previous published one)
 * and keeps the approved version in history. Rejection needs a reason; the teacher then sends a new version.
 */
export async function decideResultSheet(sheet: ResultSheet, approve: boolean, reason?: string): Promise<void> {
  if (sheet.status !== 'pending') throw new Error('This sheet has already been decided.');
  if (!approve && !reason?.trim()) throw new Error('Write a short reason, so the teacher knows what to correct.');
  const batch = writeBatch(db);
  const now = Date.now();
  if (approve) {
    for (const r of sheet.rows) {
      if (r.test === null || r.exam === null || r.test < 0 || r.test > 40 || r.exam < 0 || r.exam > 60) {
        throw new Error(`${r.name} has a score that is missing or outside the limits. Reject the sheet so the teacher can correct it.`);
      }
      const total = r.test + r.exam;
      const resultId = `${r.pupilId}_${sheet.termId}_${subjectKey(sheet.subject)}`;
      const published: PublishedResult = {
        id: resultId, pupilId: r.pupilId, classId: sheet.classId, sessionId: sheet.sessionId, termId: sheet.termId,
        subject: sheet.subject, test: r.test, exam: r.exam, total, grade: gradeFor(total),
        sheetId: sheet.id, version: sheet.version, approvedAt: now,
      };
      batch.set(doc(db, 'results', resultId), published);
      batch.set(doc(db, 'resultVersions', `${sheet.id}_${r.pupilId}`), published);
      batch.set(doc(db, 'pupilResults', r.pupilId), { pupilId: r.pupilId, items: { [`${sheet.termId}|${subjectKey(sheet.subject)}`]: published } }, { merge: true });
    }
  }
  batch.update(doc(db, 'resultSheets', sheet.id), {
    status: approve ? 'approved' : 'rejected', reason: approve ? null : reason!.trim(), decidedAt: now,
  });
  await batch.commit();
  await audit('resultSheet.decide', sheet.id, approve ? `Approved version ${sheet.version}` : `Rejected version ${sheet.version}: ${reason}`);
}

/* ---------- account statements (Stage 4) ---------- */

/**
 * Issues a statement with a new number (STMT-YYYY-000001...). The number comes from a counter updated in a
 * transaction, so two people cannot receive the same number. The statement is saved as a record and never changed.
 */
export async function issueStatement(args: {
  pupilId: string; pupilName: string; admissionNumber: string; from: string; to: string; statement: Statement;
}): Promise<StatementRecord> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again to create a statement.');
  const counter = doc(db, 'counters', 'statements');
  const n = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counter);
    const current = snap.exists() ? Number(snap.data().next) : 1;
    tx.set(counter, { next: current + 1 });
    return current;
  });
  const ref = doc(collection(db, 'statements'));
  const st = args.statement;
  const record: StatementRecord = {
    id: ref.id,
    statementNo: `STMT-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`,
    pupilId: args.pupilId, pupilName: args.pupilName, admissionNumber: args.admissionNumber,
    from: args.from, to: args.to,
    generatedBy: me.uid, generatedByName: me.displayName || me.email || 'Unknown', generatedAt: Date.now(),
    opening: st.opening, debits: st.debits, credits: st.credits, closing: st.closing,
    lines: st.lines.map((l) => ({ date: l.date, txId: l.txId, receiptNo: l.receiptNo, description: l.description, debit: l.debit, credit: l.credit, balance: l.balance, note: l.note })),
  };
  await setDoc(ref, record);
  await audit('statement.issue', ref.id, `${record.statementNo} for ${args.admissionNumber}, ${args.from} to ${args.to}`);
  return record;
}

/* ---------- bank details (set only by the head teacher) ---------- */

export async function saveBankDetails(input: { bankName: string; accountName: string; accountNumber: string }): Promise<void> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again.');
  const bankName = input.bankName.trim();
  const accountName = input.accountName.trim();
  const accountNumber = input.accountNumber.replace(/\s+/g, '');
  if (!bankName || !accountName) throw new Error('Enter the bank name and the account name.');
  if (!/^\d{10}$/.test(accountNumber)) throw new Error('The account number must be 10 digits.');
  const before = await getDoc(doc(db, 'schoolSettings', 'bank'));
  await setDoc(doc(db, 'schoolSettings', 'bank'), { bankName, accountName, accountNumber, updatedBy: me.uid, updatedAt: Date.now() } satisfies BankDetails);
  await audit('bank.update', 'schoolSettings/bank', before.exists()
    ? `Changed from ${(before.data() as BankDetails).accountNumber} to ${accountNumber}`
    : `Set to ${accountNumber}`);
}

/* ---------- report card extras: behaviour stars and comments (head teacher) ---------- */

export interface ReportExtras {
  id: string;             // `${pupilId}_${sessionId}`
  pupilId: string;
  sessionId: string;
  classId: string;
  teacherUid: string;
  teacherName: string;
  status: 'pending' | 'approved' | 'rejected';
  behaviour: { punctuality: number; neatness: number; cooperation: number; participation: number };
  teacherComment: string | null;
  headComment: string | null;
  reviewReason: string | null;
  updatedBy: string;
  updatedAt: number;
}

function checkStars(b: ReportExtras['behaviour']) {
  for (const v of Object.values(b)) {
    if (!Number.isInteger(v) || v < 0 || v > 5) throw new Error('Stars are rated from 0 to 5.');
  }
}

/** A teacher sends stars and comments for one pupil to the head teacher. Status is pending until reviewed. */
export async function submitReportComments(args: { pupilId: string; sessionId: string; classId: string; teacherName: string; behaviour: ReportExtras['behaviour']; teacherComment: string }): Promise<void> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again.');
  checkStars(args.behaviour);
  const id = `${args.pupilId}_${args.sessionId}`;
  await setDoc(doc(db, 'reportExtras', id), {
    id, pupilId: args.pupilId, sessionId: args.sessionId, classId: args.classId,
    teacherUid: me.uid, teacherName: args.teacherName, status: 'pending', behaviour: args.behaviour,
    teacherComment: args.teacherComment.trim() || null, headComment: null, reviewReason: null,
    updatedBy: me.uid, updatedAt: Date.now(),
  } satisfies ReportExtras);
  await audit('reportExtras.submit', id, 'Sent stars and comments for review');
}

/** Head teacher approves (shown to the parent) or sends back with a reason (the teacher corrects and sends again). */
export async function reviewReportExtras(x: ReportExtras, approve: boolean, reason?: string): Promise<void> {
  if (!approve && !reason?.trim()) throw new Error('Write a short reason, so the teacher knows what to correct.');
  await updateDoc(doc(db, 'reportExtras', x.id), approve
    ? { status: 'approved', reviewReason: null, updatedAt: Date.now() }
    : { status: 'rejected', reviewReason: reason!.trim(), updatedAt: Date.now() });
  await audit(approve ? 'reportExtras.approve' : 'reportExtras.reject', x.id, approve ? 'Approved the report card comments' : `Sent back: ${reason}`);
}

/** Head teacher edits a card. The edit is recorded with the old and new comments, and the card stays approved. */
export async function editReportExtras(x: ReportExtras, changes: { behaviour: ReportExtras['behaviour']; teacherComment: string; headComment: string }): Promise<void> {
  checkStars(changes.behaviour);
  await updateDoc(doc(db, 'reportExtras', x.id), {
    behaviour: changes.behaviour, teacherComment: changes.teacherComment.trim() || null,
    headComment: changes.headComment.trim() || null, status: 'approved', updatedAt: Date.now(),
  });
  await audit('reportExtras.edit', x.id, `Edited the card (was teacher’s comment: “${x.teacherComment ?? ''}”, head teacher’s comment: “${x.headComment ?? ''}”)`);
}

export async function saveReportExtras(args: { pupilId: string; sessionId: string; behaviour: ReportExtras['behaviour']; teacherComment: string; headComment: string }): Promise<void> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again.');
  checkStars(args.behaviour);
  const id = `${args.pupilId}_${args.sessionId}`;
  const existing = await getDoc(doc(db, 'reportExtras', id));
  const classId = existing.exists() ? (existing.data() as ReportExtras).classId : '';
  await setDoc(doc(db, 'reportExtras', id), {
    id, pupilId: args.pupilId, sessionId: args.sessionId, classId,
    teacherUid: me.uid, teacherName: me.displayName || me.email || 'Head Teacher', status: 'approved', behaviour: args.behaviour,
    teacherComment: args.teacherComment.trim() || null, headComment: args.headComment.trim() || null, reviewReason: null,
    updatedBy: me.uid, updatedAt: Date.now(),
  } satisfies ReportExtras);
  await audit('reportExtras.save', id, 'Updated stars and comments');
}

/** Repair: copies pending transfers sent before per-child records existed. Safe to run again. */
export async function rebuildPendingClaims(): Promise<number> {
  const pend = await getDocs(query(collection(db, 'paymentSubmissions'), where('status', '==', 'pending')));
  let n = 0;
  for (const sub of pend.docs) {
    const d = sub.data() as PaymentSubmission;
    const pupilIds = Array.from(new Set([...d.allocations.map((x) => x.pupilId), ...(d.advancePupilId ? [d.advancePupilId] : [])]));
    for (const pid of pupilIds) {
      const forChild = d.allocations.filter((x) => x.pupilId === pid).reduce((t, x) => t + x.amount, 0)
        + (d.advancePupilId === pid ? (d.advanceKobo ?? 0) : 0);
      await setDoc(doc(db, 'childClaims', `${sub.id}_${pid}`), {
        id: `${sub.id}_${pid}`, submissionId: sub.id, pupilId: pid, parentUid: d.parentUid,
        payerName: d.payerName, transferDate: d.transferDate, bankReference: d.bankReference,
        amountForChild: forChild, status: 'pending', createdAt: d.createdAt ?? Date.now(),
      } satisfies ChildClaim, { merge: true });
      n++;
    }
  }
  await audit('childClaims.rebuild', 'paymentSubmissions', `Wrote ${n} pending transfer record(s)`);
  return n;
}


/* ---------- advance money and child-level records (Stage 6) ---------- */

/** Applies held advance money to one of the child's fees. No new money, so no receipt. Checked in the same transaction as any payment. */
export async function applyAdvance(args: { creditId: string; chargeId: string; amount: Kobo }): Promise<void> {
  const credit = await getDoc(doc(db, 'advanceCredits', args.creditId));
  if (!credit.exists()) throw new Error('This advance no longer exists.');
  const c = credit.data() as AdvanceCredit;
  const charge = await getDoc(doc(db, 'charges', args.chargeId));
  if (!charge.exists()) throw new Error('That fee no longer exists.');
  const ch = charge.data() as Charge;
  if (ch.pupilId !== c.pupilId) throw new Error('That fee belongs to another child.');
  await confirmPayment({
    submission: null, payerName: c.payerName, payerUid: c.payerUid ?? '', amount: args.amount,
    paymentDate: new Date().toISOString().slice(0, 10), bankReference: `Advance applied (${args.creditId.slice(0, 8)})`,
    allocations: [{ pupilId: c.pupilId, sessionId: ch.sessionId, termId: ch.termId, category: ch.category, chargeId: ch.id, amount: args.amount }],
    allowedPupilIds: new Set([c.pupilId]), kind: 'advance_application', creditId: args.creditId,
  });
}

/** One-off: creates child-level copies for payments recorded before this stage. Safe to run more than once. */
export async function rebuildChildPayments(): Promise<number> {
  const payments = await getDocs(collection(db, 'payments'));
  let written = 0;
  for (const p of payments.docs) {
    const d = p.data() as ConfirmedPayment;
    const pupilIds = Array.from(new Set(d.allocations.map((x) => x.pupilId)));
    for (const pid of pupilIds) {
      await setDoc(doc(db, 'childPayments', `${pid}_${p.id}`), {
        id: `${pid}_${p.id}`, pupilId: pid, paymentId: p.id, kind: d.kind ?? 'payment',
        payerName: d.payerName, paymentDate: d.paymentDate, bankReference: d.bankReference,
        receiptNumber: d.receiptNumber ?? null, allocations: d.allocations.filter((x) => x.pupilId === pid),
        advanceKobo: 0,
      } satisfies ChildPaymentRecord, { merge: true });
      written++;
    }
  }
  await audit('childPayments.rebuild', 'payments', `Wrote ${written} child-level records`);
  return written;
}

/* ---------- head teacher access: only an existing head teacher can grant or remove it ---------- */

export async function setRoleByEmail(email: string, role: 'admin' | 'parent'): Promise<void> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again.');
  const clean = email.trim().toLowerCase();
  const found = await getDocs(query(collection(db, 'users'), where('email', '==', clean)));
  if (found.empty) throw new Error('No account exists for this email yet. The person must create an account first.');
  const target = found.docs[0];
  if (target.id === me.uid && role !== 'admin') throw new Error('You cannot remove your own head teacher access.');
  await updateDoc(target.ref, { role });
  await audit(role === 'admin' ? 'access.grantHeadTeacher' : 'access.removeHeadTeacher', target.id, `${clean} is now ${role === 'admin' ? 'a Head Teacher' : 'not a Head Teacher'}`);
}

/* ---------- payment corrections (Stage 10) ---------- */

/** The allocations that cancel a payment: every amount negated. Pure, so it can be tested. */
export function reversalAllocations(allocs: Allocation[]): Allocation[] {
  return allocs.map((a) => ({ ...a, amount: -a.amount }));
}

/**
 * Corrects a wrong payment by recording a reversal that cancels it. The original payment and receipt stay in history.
 * Then the head teacher records the correct payment with the usual form. Balances follow the fee assignments.
 */
export async function reversePayment(paymentId: string, reason: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in again.');
  const why = reason.trim();
  if (why.length < 5) throw new Error('Write the reason for the correction (at least a few words).');
  const snap = await getDoc(doc(db, 'payments', paymentId));
  if (!snap.exists()) throw new Error('This payment no longer exists.');
  const p = snap.data() as ConfirmedPayment;
  if (p.kind === 'reversal') throw new Error('A correction cannot be corrected. Record the correct payment instead.');
  const already = await getDocs(query(collection(db, 'payments'), where('reversesPaymentId', '==', paymentId)));
  if (!already.empty) throw new Error('This payment has already been corrected.');

  const ref = doc(collection(db, 'payments'));
  const negated = reversalAllocations(p.allocations);
  const total = negated.reduce((t, a) => t + a.amount, 0);
  await setDoc(ref, {
    amount: total, allocations: negated, kind: 'reversal', reversesPaymentId: paymentId, reversalReason: why,
    payerName: p.payerName, payerUid: (p as ConfirmedPayment & { payerUid?: string }).payerUid ?? null, paymentDate: new Date().toISOString().slice(0, 10),
    bankReference: `Correction of ${paymentId.slice(0, 8)}`, receiptNumber: null,
    recordedBy: me.uid, recordedAt: Date.now(),
  });
  const pupilIds = Array.from(new Set(negated.map((a) => a.pupilId)));
  for (const pid of pupilIds) {
    await setDoc(doc(db, 'childPayments', `${pid}_${ref.id}`), {
      id: `${pid}_${ref.id}`, pupilId: pid, paymentId: ref.id, kind: 'reversal',
      payerName: p.payerName, paymentDate: new Date().toISOString().slice(0, 10), bankReference: `Correction of ${paymentId.slice(0, 8)}`,
      receiptNumber: null, allocations: negated.filter((a) => a.pupilId === pid), advanceKobo: 0,
    } satisfies ChildPaymentRecord);
  }
  await audit('payment.correct', paymentId, `Cancelled by correction ${ref.id}. Reason: ${why}`);
}
