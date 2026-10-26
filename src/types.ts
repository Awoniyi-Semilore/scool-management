import type { Kobo } from './lib/money';

export type Role = 'admin' | 'parent' | 'teacher';
/** Roles a person may ask for at registration. Admin is never requested; the school grants it. */
export type RequestableRole = 'teacher';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

/** A fee name chosen by the school, e.g. "Tuition", "Books", "Art club". Free text. */
export type FeeCategory = string;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: number;
  requestedRole?: RequestableRole | null;
  requestStatus?: RequestStatus | null;
  /** Copied from the teacher record by the head teacher, so security rules can check it. */
  teaching?: { classIds: string[]; subjects: string[] };
}

/** Pupils of a class, copied for the teacher of that class. */
export interface ClassRoster {
  classId: string;
  pupils: { id: string; name: string; admissionNumber: string }[];
}

export interface ResultRow {
  pupilId: string;
  name: string;
  admissionNumber: string;
  test: number | null;   // out of 40
  exam: number | null;   // out of 60
}

export type SheetStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/** One batch of marks for one class, subject and term. Every correction is a new version. */
export interface ResultSheet {
  id: string;
  teacherUid: string;
  teacherName: string;
  classId: string;
  className: string;
  subject: string;
  sessionId: string;
  termId: string;
  termName: string;
  version: number;
  status: SheetStatus;
  rows: ResultRow[];
  reason: string | null;
  createdAt: number;
  submittedAt: number | null;
  decidedAt: number | null;
}

/** A published result for one pupil, subject and term. Parents read this, only after approval. */
export interface PublishedResult {
  id: string;
  pupilId: string;
  classId: string;
  sessionId: string;
  termId: string;
  subject: string;
  test: number;
  exam: number;
  total: number;
  grade: string;
  sheetId: string;
  version: number;
  approvedAt: number;
}

export interface SchoolClass {
  id: string;
  name: string;          // e.g. "Primary 3 · Gold"
  level?: string;        // e.g. "Primary 3"
  colour?: string;       // e.g. "Gold"
}

export type WorkType = 'full' | 'part';

/** A staff member who teaches. Linked to their sign-in by email. */
export interface Teacher {
  id: string;
  fullName: string;
  email: string;         // lower case; must match the email used to sign in as Teacher
  workType: WorkType;
  classIds: string[];    // a teacher can teach several classes
  subjects: string[];    // and several subjects
  createdAt: number;
}

export type TeacherRequestKind = 'subject' | 'pupil';

export interface TeacherRequest {
  id: string;
  requesterUid: string;
  teacherId: string;
  teacherName: string;
  kind: TeacherRequestKind;
  subject: string | null;
  pupil: { firstName: string; lastName: string; admissionNumber: string; classId: string } | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: number;
  decidedAt: number | null;
}

export interface Pupil {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  classId: string;
  createdAt: number;
}

export interface ParentPupilLink {
  id: string;            // `${parentUid}_${pupilId}`
  parentUid: string;
  pupilId: string;
  status: 'approved' | 'revoked';
  decidedBy: string;
  decidedAt: number;
}

export interface LinkRequest {
  id: string;
  parentUid: string;
  parentEmail: string;
  pupilFirstName: string;
  pupilLastName: string;
  admissionNumber: string;
  classHint: string;
  status: 'pending' | 'approved' | 'rejected';
  duplicateWarning: string | null;
  createdAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
  rejectionReason: string | null;
}

export interface AcademicSession {
  id: string;
  label: string;
  active: boolean;
}

export type TermName = 'First Term' | 'Second Term' | 'Third Term';
export const TERM_NAMES: TermName[] = ['First Term', 'Second Term', 'Third Term'];

export interface Term {
  id: string;           // `${sessionId}_${ordinal}`
  sessionId: string;
  name: TermName;
  ordinal: 1 | 2 | 3;
  startDate: string;
  endDate: string;
  active: boolean;
}

/** A historical charge line. Never overwritten; corrections create new lines. */
export interface Charge {
  id: string;
  pupilId: string;
  sessionId: string;
  termId: string;
  category: FeeCategory;
  description: string;
  kind: 'fee' | 'discount' | 'opening_balance';
  amount: Kobo;            // always positive; a discount is kind 'discount'
  createdBy: string;
  createdAt: number;
  reason: string | null;
  paidKobo?: Kobo;        // running total confirmed against this charge (set to 0 on creation)
}

export interface Allocation {
  pupilId: string;
  sessionId: string;
  termId: string;
  category: FeeCategory;
  chargeId: string;
  amount: Kobo;
}

export interface PaymentSubmission {
  id: string;
  parentUid: string;
  payerName: string;
  amount: Kobo;
  transferDate: string;
  bankReference: string;
  evidencePath: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  allocations: Allocation[];
  duplicateWarning: string | null;
  /** Money for the next term. Part of the total paid, but assigned to no fee until the school applies it. */
  advanceKobo?: Kobo;
  advancePupilId?: string | null;
  note?: string | null;
  rejectionReason: string | null;
  createdAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
}

/** Copy of a confirmed payment for ONE child. Every linked guardian sees the same child-level record. */
export interface ChildPaymentRecord {
  id: string;                 // `${pupilId}_${paymentId}`
  pupilId: string;
  paymentId: string;
  kind: 'payment' | 'advance_application' | 'reversal';
  payerName: string;
  paymentDate: string;
  bankReference: string;
  receiptNumber: string | null;
  allocations: Allocation[];  // only this child's allocations
  advanceKobo: Kobo;          // advance received with this payment, for this child (not yet applied)
}

/** A transfer not yet confirmed, for one child. Shown in its own section; never counted. */
export interface ChildClaim {
  id: string;                 // `${submissionId}_${pupilId}`
  submissionId: string;
  pupilId: string;
  parentUid: string;
  payerName: string;
  transferDate: string;
  bankReference: string;
  amountForChild: Kobo;       // this child's fees plus advance, if the advance is for this child
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: number;
}

/** Advance money held for one child, to be applied to a fee later. */
export interface AdvanceCredit {
  id: string;                 // payment id
  paymentId: string;
  pupilId: string;
  payerUid: string;
  payerName: string;
  amount: Kobo;
  appliedKobo: Kobo;
  createdAt: number;
}

export interface ConfirmedPayment {
  id: string;
  submissionId: string | null;
  payerName: string;
  amount: Kobo;
  paymentDate: string;
  bankReference: string;
  allocations: Allocation[];
  recordedBy: string;
  recordedAt: number;
  receiptNumber: string | null;   // null for an advance applied to a fee (no new money, so no receipt)
  advanceKobo?: Kobo;
  kind?: 'payment' | 'advance_application' | 'reversal';
  reversesPaymentId?: string;
  reversalReason?: string;
}

/** The school's bank details, shown to parents. Set only by the head teacher. */
export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  updatedBy: string;
  updatedAt: number;
}

/** A saved account statement. Immutable: a later statement gets a new number. */
export interface StatementRecord {
  id: string;
  statementNo: string;
  pupilId: string;
  pupilName: string;
  admissionNumber: string;
  from: string;
  to: string;
  generatedBy: string;
  generatedByName: string;
  generatedAt: number;
  opening: Kobo;
  debits: Kobo;
  credits: Kobo;
  closing: Kobo;
  lines: { date: string; txId: string; receiptNo: string | null; description: string; debit: Kobo; credit: Kobo; balance: Kobo; note: string | null }[];
}

export interface Receipt {
  id: string;             // receipt number, e.g. RCP-2026-AB12CD34
  paymentId: string;
  payerUid: string | null;
  pupilIds: string[];
  amount: Kobo;
  issuedAt: number;
  voided: boolean;
  replacesReceiptId: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string;
  at: number;
  targetId: string;
  details: string;
}

/** Standard fees for one class in one term. Copied onto each new pupil in that class. */
export interface ClassFeeSet {
  id: string;          // `${classId}_${termId}`
  classId: string;
  sessionId: string;
  termId: string;
  items: { name: string; amount: Kobo }[];
}
