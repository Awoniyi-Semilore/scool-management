// Run with: firebase emulators:exec --only firestore,storage "node --test rules-tests/"
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, addDoc, collection, getDocs, query, where, deleteDoc, Timestamp } from 'firebase/firestore';

let env;
const ADMIN = 'admin1', PARENT_A = 'parentA', PARENT_B = 'parentB';
const profile = (uid, role) => ({ uid, email: `${uid}@x.test`, displayName: uid, role, createdAt: 1 });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-school-fees',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', ADMIN), profile(ADMIN, 'admin'));
    await setDoc(doc(db, 'users', PARENT_A), profile(PARENT_A, 'parent'));
    await setDoc(doc(db, 'users', PARENT_B), profile(PARENT_B, 'parent'));
    await setDoc(doc(db, 'pupils', 'pupilA'), { firstName: 'A', classId: 'c1', admissionNumber: '1' });
    await setDoc(doc(db, 'pupils', 'pupilB'), { firstName: 'B', classId: 'c1', admissionNumber: '2' });
    await setDoc(doc(db, 'parentLinks', `${PARENT_A}_pupilA`), { parentUid: PARENT_A, pupilId: 'pupilA', status: 'approved' });
    await setDoc(doc(db, 'charges', 'ch1'), {
      pupilId: 'pupilA', amount: 5000000, paidKobo: 0, kind: 'fee', createdBy: ADMIN, sessionId: 's', termId: 't', category: 'tuition', description: 'Tuition',
    });
    await setDoc(doc(db, 'paymentSubmissions', 'sub1'), {
      parentUid: PARENT_A, amount: 100, status: 'pending', allocations: [{ chargeId: 'ch1', amount: 100, pupilId: 'pupilA' }],
    });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const asStorage = (uid) => env.authenticatedContext(uid).storage();

// ---- Requirement 1-3: access and role escalation ----
test('parent cannot read a pupil they are not linked to', async () => {
  await assertFails(getDoc(doc(as(PARENT_A), 'pupils', 'pupilB')));
});
test('parent can read a pupil they are linked to (approved link)', async () => {
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'pupils', 'pupilA')));
});
test('parent cannot read another family\'s charges', async () => {
  await assertFails(getDoc(doc(as(PARENT_B), 'charges', 'ch1')));
});
test('parent cannot self-promote to admin', async () => {
  await assertFails(updateDoc(doc(as(PARENT_A), 'users', PARENT_A), { role: 'admin' }));
});
test('parent cannot create a profile as admin', async () => {
  await assertFails(setDoc(doc(as('newbie'), 'users', 'newbie'), profile('newbie', 'admin')));
});
test('parent cannot create a pupil', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'pupils', 'x'), { firstName: 'x' }));
});
test('parent cannot create a parent-pupil link to themselves', async () => {
  await assertFails(setDoc(doc(as(PARENT_B), 'parentLinks', `${PARENT_B}_pupilB`), { parentUid: PARENT_B, pupilId: 'pupilB', status: 'approved' }));
});

// ---- Requirement 6: parents cannot create or alter confirmed financial records ----
test('parent cannot create a confirmed payment', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'payments', 'p1'), { amount: 100, allocations: [], receiptNumber: 'R1', recordedBy: PARENT_A }));
});
test('parent cannot issue a receipt', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'receipts', 'R1'), { amount: 100, payerUid: PARENT_A }));
});
test('parent cannot change a charge amount', async () => {
  await assertFails(updateDoc(doc(as(PARENT_A), 'charges', 'ch1'), { amount: 1 }));
});
test('parent cannot approve their own submission', async () => {
  await assertFails(updateDoc(doc(as(PARENT_A), 'paymentSubmissions', 'sub1'), { status: 'confirmed' }));
});
test('parent cannot read another parent\'s submission', async () => {
  await assertFails(getDoc(doc(as(PARENT_B), 'paymentSubmissions', 'sub1')));
});
test('parent cannot change allocations of their own submission (admin-only)', async () => {
  await assertFails(updateDoc(doc(as(PARENT_A), 'paymentSubmissions', 'sub1'), { allocations: [] }));
});
test('parent cannot submit a claim with too many allocations', async () => {
  const many = Array.from({ length: 26 }, (_, i) => ({ chargeId: 'ch1', amount: 1, pupilId: 'pupilA' }));
  await assertFails(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 26, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, allocations: many }));
});
test('parent cannot submit a claim already marked confirmed', async () => {
  await assertFails(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 100, status: 'confirmed', decidedBy: null, decidedAt: null, rejectionReason: null, allocations: [{ chargeId: 'ch1', amount: 100, pupilId: 'pupilA' }] }));
});
test('a valid parent claim is accepted (pending, own uid)', async () => {
  await assertSucceeds(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 100, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, allocations: [{ chargeId: 'ch1', amount: 100, pupilId: 'pupilA' }] }));
});
test('a parent cannot file a claim under another parent\'s uid', async () => {
  await assertFails(addDoc(collection(as(PARENT_B), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 100, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, allocations: [{ chargeId: 'ch1', amount: 100, pupilId: 'pupilA' }] }));
});

// ---- Admin powers and audit integrity ----
test('admin can approve a submission', async () => {
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'paymentSubmissions', 'sub1'), { status: 'confirmed' }));
});
test('admin cannot edit a confirmed payment (immutable)', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'payments', 'p9'), { amount: 1, allocations: [], receiptNumber: 'R9', recordedBy: ADMIN }));
  await assertFails(updateDoc(doc(as(ADMIN), 'payments', 'p9'), { amount: 2 }));
});
test('admin cannot delete a confirmed payment', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'payments', 'p8'), { amount: 1 }));
  await assertFails(deleteDoc(doc(as(ADMIN), 'payments', 'p8')));
});
test('audit events cannot be edited or deleted by anyone', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'auditEvents', 'a1'), { actorUid: ADMIN, action: 'x' }));
  await assertFails(updateDoc(doc(as(ADMIN), 'auditEvents', 'a1'), { action: 'y' }));
  await assertFails(deleteDoc(doc(as(ADMIN), 'auditEvents', 'a1')));
});
test('a charge can only have paidKobo raised, never lowered', async () => {
  await env.withSecurityRulesDisabled(async (c) => updateDoc(doc(c.firestore(), 'charges', 'ch1'), { paidKobo: 500 }));
  await assertFails(updateDoc(doc(as(ADMIN), 'charges', 'ch1'), { paidKobo: 100 }));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'charges', 'ch1'), { paidKobo: 600 }));
});
test('signed-out visitors can read nothing', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pupils', 'pupilA')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classes', 'x')));
});
test('default deny: unknown collection is closed to everyone', async () => {
  await assertFails(setDoc(doc(as(ADMIN), 'secrets', 's'), { v: 1 }));
});

// ---- Receipt number counter: admin only ----
test('parent cannot read or change the receipt counter', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'counters', 'receipts'), { next: 5 }));
  await assertFails(getDoc(doc(as(PARENT_A), 'counters', 'receipts')));
  await assertFails(setDoc(doc(as(PARENT_A), 'counters', 'receipts'), { next: 1 }));
});
test('admin can read and advance the receipt counter', async () => {
  await assertSucceeds(getDoc(doc(as(ADMIN), 'counters', 'receipts')));
  await assertSucceeds(setDoc(doc(as(ADMIN), 'counters', 'receipts'), { next: 6 }));
});

// ---- Stage 1: role requests (teacher / staff) ----
const asEmail = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.test` }).firestore();
const reqProfile = (uid, extra) => ({ uid, email: `${uid}@x.test`, displayName: uid, role: 'parent', createdAt: 1, ...extra });

test('a new parent may ask for a pending teacher role on their own profile', async () => {
  await assertSucceeds(setDoc(doc(asEmail('tNew'), 'users', 'tNew'), reqProfile('tNew', { requestedRole: 'teacher', requestStatus: 'pending' })));
});
test('a new person cannot create their profile already as teacher', async () => {
  await assertFails(setDoc(doc(asEmail('tBad'), 'users', 'tBad'), reqProfile('tBad', { role: 'teacher' })));
});
test('a new person cannot create a request that is already approved', async () => {
  await assertFails(setDoc(doc(asEmail('tApp'), 'users', 'tApp'), reqProfile('tApp', { requestedRole: 'teacher', requestStatus: 'approved' })));
});
test('a new person cannot ask for the head teacher role', async () => {
  await assertFails(setDoc(doc(asEmail('hAsk'), 'users', 'hAsk'), reqProfile('hAsk', { requestedRole: 'admin', requestStatus: 'pending' })));
});
test('a person cannot change their own request status', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'users', 'tSelf'), reqProfile('tSelf', { requestedRole: 'teacher', requestStatus: 'pending' })));
  await assertFails(updateDoc(doc(env.authenticatedContext('tSelf', { email: 'tSelf@x.test' }).firestore(), 'users', 'tSelf'), { requestStatus: 'approved' }));
});
test('a person cannot change their own role', async () => {
  await assertFails(updateDoc(doc(asEmail(PARENT_A), 'users', PARENT_A), { role: 'teacher' }));
});
test('the head teacher can approve a request by setting the role', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'users', 'tOk'), reqProfile('tOk', { requestedRole: 'teacher', requestStatus: 'pending' })));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', 'tOk'), { role: 'teacher', requestStatus: 'approved' }));
});
test('the head teacher can reject a request without changing the role', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'users', 'tNo'), reqProfile('tNo', { requestedRole: 'staff', requestStatus: 'pending' })));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', 'tNo'), { requestStatus: 'rejected' }));
});
test('the head teacher cannot grant an unknown role', async () => {
  await assertFails(updateDoc(doc(as(ADMIN), 'users', PARENT_A), { role: 'superuser' }));
});
test('a parent cannot list pending requests from other people', async () => {
  await assertFails(getDocs(query(collection(as(PARENT_A), 'users'), where('requestStatus', '==', 'pending'))));
});
test('the head teacher can list pending requests', async () => {
  await assertSucceeds(getDocs(query(collection(as(ADMIN), 'users'), where('requestStatus', '==', 'pending'))));
});

// ---- Stage 2: teachers and teacher requests ----
const teacherCtx = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.test` }).firestore();
async function seedTeacher() {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', 'tch1'), { uid: 'tch1', email: 'tch1@x.test', displayName: 'Teacher One', role: 'teacher', createdAt: 1 });
    await setDoc(doc(db, 'teachers', 'T1'), { id: 'T1', fullName: 'Teacher One', email: 'tch1@x.test', workType: 'full', classIds: ['c1'], subjects: ['Mathematics'], createdAt: 1 });
    await setDoc(doc(db, 'teachers', 'T2'), { id: 'T2', fullName: 'Other Teacher', email: 'tch2@x.test', workType: 'part', classIds: ['c2'], subjects: [], createdAt: 1 });
  });
}
const subjectRequest = (uid, teacherId) => ({
  id: 'R1', requesterUid: uid, teacherId, teacherName: 'Teacher One', kind: 'subject', subject: 'Commerce', pupil: null,
  status: 'pending', reason: null, createdAt: 1, decidedAt: null,
});

test('a teacher can read their own teacher record', async () => {
  await seedTeacher();
  await assertSucceeds(getDoc(doc(teacherCtx('tch1'), 'teachers', 'T1')));
});
test('a teacher cannot read another teacher record', async () => {
  await seedTeacher();
  await assertFails(getDoc(doc(teacherCtx('tch1'), 'teachers', 'T2')));
});
test('a parent cannot read teacher records', async () => {
  await seedTeacher();
  await assertFails(getDoc(doc(teacherCtx(PARENT_A), 'teachers', 'T1')));
});
test('only the head teacher can create or change teacher records', async () => {
  await seedTeacher();
  await assertFails(updateDoc(doc(teacherCtx('tch1'), 'teachers', 'T1'), { subjects: ['Anything'] }));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'teachers', 'T1'), { subjects: ['Mathematics', 'Commerce'] }));
});
test('a teacher can request a subject for their own record', async () => {
  await seedTeacher();
  await assertSucceeds(setDoc(doc(teacherCtx('tch1'), 'teacherRequests', 'R1'), subjectRequest('tch1', 'T1')));
});
test('a teacher cannot request on behalf of another teacher', async () => {
  await seedTeacher();
  await assertFails(setDoc(doc(teacherCtx('tch1'), 'teacherRequests', 'R2'), subjectRequest('tch1', 'T2')));
});
test('a parent cannot create a teacher request', async () => {
  await seedTeacher();
  await assertFails(setDoc(doc(teacherCtx(PARENT_A), 'teacherRequests', 'R3'), subjectRequest(PARENT_A, 'T1')));
});
test('a request cannot be created already approved', async () => {
  await seedTeacher();
  await assertFails(setDoc(doc(teacherCtx('tch1'), 'teacherRequests', 'R4'), { ...subjectRequest('tch1', 'T1'), status: 'approved' }));
});
test('a teacher cannot approve their own request', async () => {
  await seedTeacher();
  await assertSucceeds(setDoc(doc(teacherCtx('tch1'), 'teacherRequests', 'R5'), subjectRequest('tch1', 'T1')));
  await assertFails(updateDoc(doc(teacherCtx('tch1'), 'teacherRequests', 'R5'), { status: 'approved' }));
});
test('the head teacher can approve or reject a request', async () => {
  await seedTeacher();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'teacherRequests', 'R6'), subjectRequest('tch1', 'T1')));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'teacherRequests', 'R6'), { status: 'rejected', reason: 'Not needed', decidedAt: 2 }));
});
test('a teacher reads only their own requests', async () => {
  await seedTeacher();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'teacherRequests', 'R7'), subjectRequest('tch1', 'T1')));
  await assertSucceeds(getDoc(doc(teacherCtx('tch1'), 'teacherRequests', 'R7')));
  await assertFails(getDoc(doc(teacherCtx(PARENT_A), 'teacherRequests', 'R7')));
});

// ---- Stage 3: results ----
async function seedResults() {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', 'tch1'), { uid: 'tch1', email: 'tch1@x.test', displayName: 'Teacher One', role: 'teacher', createdAt: 1,
      teaching: { classIds: ['c1'], subjects: ['Mathematics'] } });
    await setDoc(doc(db, 'users', 'tch2'), { uid: 'tch2', email: 'tch2@x.test', displayName: 'Teacher Two', role: 'teacher', createdAt: 1,
      teaching: { classIds: ['c2'], subjects: ['English'] } });
    await setDoc(doc(db, 'classRosters', 'c1'), { classId: 'c1', pupils: [{ id: 'pupilA', name: 'A', admissionNumber: 'A1' }] });
  });
}
const sheet = (over = {}) => ({
  id: 'S1', teacherUid: 'tch1', teacherName: 'Teacher One', classId: 'c1', className: 'Primary 3 · Gold',
  subject: 'Mathematics', sessionId: 's', termId: 't', termName: 'Second term', version: 1, status: 'draft',
  rows: [{ pupilId: 'pupilA', name: 'A', admissionNumber: 'A1', test: 35, exam: 60 }],
  reason: null, createdAt: 1, submittedAt: null, decidedAt: null, ...over,
});

test('a teacher can start a draft for their own class and subject', async () => {
  await seedResults();
  await assertSucceeds(setDoc(doc(as('tch1'), 'resultSheets', 'S1'), sheet()));
});
test('a teacher cannot start a sheet for a class they do not teach', async () => {
  await seedResults();
  await assertFails(setDoc(doc(as('tch1'), 'resultSheets', 'S2'), sheet({ classId: 'c2' })));
});
test('a teacher cannot start a sheet for a subject they do not teach', async () => {
  await seedResults();
  await assertFails(setDoc(doc(as('tch1'), 'resultSheets', 'S3'), sheet({ subject: 'English' })));
});
test('a sheet cannot be created already sent or approved', async () => {
  await seedResults();
  await assertFails(setDoc(doc(as('tch1'), 'resultSheets', 'S4'), sheet({ status: 'approved' })));
});
test('a teacher can send their draft for approval', async () => {
  await seedResults();
  await setDoc(doc(as('tch1'), 'resultSheets', 'S5'), sheet({ id: 'S5' }));
  await assertSucceeds(updateDoc(doc(as('tch1'), 'resultSheets', 'S5'), { status: 'pending', submittedAt: 2 }));
});
test('a teacher cannot change a sheet once it is sent', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'resultSheets', 'S6'), sheet({ id: 'S6', status: 'pending', submittedAt: 2 })));
  await assertFails(updateDoc(doc(as('tch1'), 'resultSheets', 'S6'), { rows: [] }));
});
test('a teacher cannot change the version of a draft', async () => {
  await seedResults();
  await setDoc(doc(as('tch1'), 'resultSheets', 'S7'), sheet({ id: 'S7' }));
  await assertFails(updateDoc(doc(as('tch1'), 'resultSheets', 'S7'), { version: 9 }));
});
test('the head teacher can approve a pending sheet', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'resultSheets', 'S8'), sheet({ id: 'S8', status: 'pending', submittedAt: 2 })));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'resultSheets', 'S8'), { status: 'approved', decidedAt: 3 }));
});
test('the head teacher must give a reason to reject', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'resultSheets', 'S9'), sheet({ id: 'S9', status: 'pending', submittedAt: 2 })));
  await assertFails(updateDoc(doc(as(ADMIN), 'resultSheets', 'S9'), { status: 'rejected', decidedAt: 3 }));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'resultSheets', 'S9'), { status: 'rejected', reason: 'Two scores are over 40', decidedAt: 3 }));
});
test('the head teacher cannot send a sheet back to draft', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'resultSheets', 'S10'), sheet({ id: 'S10', status: 'pending', submittedAt: 2 })));
  await assertFails(updateDoc(doc(as(ADMIN), 'resultSheets', 'S10'), { status: 'draft' }));
});
test('a teacher reads only their own sheets', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'resultSheets', 'S11'), sheet({ id: 'S11' })));
  await assertSucceeds(getDoc(doc(as('tch1'), 'resultSheets', 'S11')));
  await assertFails(getDoc(doc(as('tch2'), 'resultSheets', 'S11')));
  await assertFails(getDoc(doc(as(PARENT_A), 'resultSheets', 'S11')));
});
test('a parent reads a published result for a linked child', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'results', 'pupilA_t_mathematics'), { pupilId: 'pupilA', total: 95, grade: 'Excellent' }));
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'results', 'pupilA_t_mathematics')));
});
test('a parent cannot read a result for an unlinked child', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'results', 'pupilB_t_mathematics'), { pupilId: 'pupilB', total: 50, grade: 'Good' }));
  await assertFails(getDoc(doc(as(PARENT_A), 'results', 'pupilB_t_mathematics')));
});
test('a teacher cannot publish a result directly', async () => {
  await seedResults();
  await assertFails(setDoc(doc(as('tch1'), 'results', 'x'), { pupilId: 'pupilA', total: 99, grade: 'Excellent' }));
});
test('a parent cannot read the approval history', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'resultVersions', 'v1'), { pupilId: 'pupilA' }));
  await assertFails(getDoc(doc(as(PARENT_A), 'resultVersions', 'v1')));
  await assertSucceeds(getDoc(doc(as(ADMIN), 'resultVersions', 'v1')));
});
test('approval history cannot be edited', async () => {
  await seedResults();
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'resultVersions', 'v2'), { pupilId: 'pupilA' }));
  await assertFails(updateDoc(doc(as(ADMIN), 'resultVersions', 'v2'), { pupilId: 'x' }));
});
test('a teacher reads the roster of their own class only', async () => {
  await seedResults();
  await assertSucceeds(getDoc(doc(as('tch1'), 'classRosters', 'c1')));
  await assertFails(getDoc(doc(as('tch2'), 'classRosters', 'c1')));
  await assertFails(getDoc(doc(as(PARENT_A), 'classRosters', 'c1')));
});

// ---- Stage 4: advance money, statements, statement numbers ----
test('a claim with advance money is accepted', async () => {
  await assertSucceeds(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 15000, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, advanceKobo: 5000, advancePupilId: 'pupilA', note: 'Ada next term', allocations: [{ chargeId: 'ch1', amount: 10000, pupilId: 'pupilA' }] }));
});
test('a claim with a negative advance is refused', async () => {
  await assertFails(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 10000, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, advanceKobo: -5, allocations: [{ chargeId: 'ch1', amount: 10000, pupilId: 'pupilA' }] }));
});
test('a parent may take the next statement number, one step at a time', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'counters', 'statements'), { next: 3 }));
  await assertSucceeds(updateDoc(doc(as(PARENT_A), 'counters', 'statements'), { next: 4 }));
  await assertFails(updateDoc(doc(as(PARENT_A), 'counters', 'statements'), { next: 9 }));
});
test('a parent cannot change other counters', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'counters', 'receipts'), { next: 3 }));
  await assertFails(updateDoc(doc(as(PARENT_A), 'counters', 'receipts'), { next: 4 }));
});
test('a parent may create a statement for their linked child', async () => {
  await assertSucceeds(setDoc(doc(as(PARENT_A), 'statements', 'st1'), { pupilId: 'pupilA', generatedBy: PARENT_A, opening: 0, closing: 0, debits: 0, credits: 0 }));
});
test('a parent cannot create a statement for an unlinked child', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'statements', 'st2'), { pupilId: 'pupilB', generatedBy: PARENT_A, opening: 0, closing: 0, debits: 0, credits: 0 }));
});
test('a saved statement cannot be changed or deleted', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'statements', 'st3'), { pupilId: 'pupilA', generatedBy: PARENT_A, opening: 0, closing: 5, debits: 5, credits: 0 }));
  await assertFails(updateDoc(doc(as(PARENT_A), 'statements', 'st3'), { closing: 0 }));
  await assertFails(deleteDoc(doc(as(ADMIN), 'statements', 'st3')));
});
test('a parent reads their own statements, not other families', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'statements', 'st4'), { pupilId: 'pupilB', generatedBy: 'someoneElse', opening: 0, closing: 0, debits: 0, credits: 0 }));
  await assertFails(getDoc(doc(as(PARENT_A), 'statements', 'st4')));
  await assertSucceeds(getDoc(doc(as(ADMIN), 'statements', 'st4')));
});

// ---- Stage 5: report cards ----
test('a linked parent reads their child\'s published results in one document', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'pupilResults', 'pupilA'), { pupilId: 'pupilA', items: {} }));
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'pupilResults', 'pupilA')));
});
test('a parent cannot read published results of an unlinked child', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'pupilResults', 'pupilB'), { pupilId: 'pupilB', items: {} }));
  await assertFails(getDoc(doc(as(PARENT_A), 'pupilResults', 'pupilB')));
});
test('a parent cannot write published results', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'pupilResults', 'pupilA'), { items: { x: { total: 100 } } }));
});
test('a linked parent reads behaviour and comments, not other families', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'reportExtras', 'pupilA_s'), { pupilId: 'pupilA', sessionId: 's', classId: 'c1', teacherUid: 'tch1', status: 'approved', behaviour: { punctuality: 5 } });
    await setDoc(doc(c.firestore(), 'reportExtras', 'pupilB_s'), { pupilId: 'pupilB', sessionId: 's', classId: 'c2', teacherUid: 'tch2', status: 'approved', behaviour: { punctuality: 3 } });
  });
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'reportExtras', 'pupilA_s')));
  await assertFails(getDoc(doc(as(PARENT_A), 'reportExtras', 'pupilB_s')));
});
test('only the head teacher writes behaviour and comments', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'reportExtras', 'pupilA_s2'), { pupilId: 'pupilA', sessionId: 's2', behaviour: {} }));
  await assertSucceeds(setDoc(doc(as(ADMIN), 'reportExtras', 'pupilA_s2'), { pupilId: 'pupilA', sessionId: 's2', behaviour: { punctuality: 4 } }));
});

// ---- Stage 6: child-level payments, pending per child, advances ----
test('a linked parent reads the child-level payment record, an unlinked parent does not', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'childPayments', 'pupilA_P1'), { pupilId: 'pupilA', paymentId: 'P1', payerName: 'Dad', allocations: [] });
    await setDoc(doc(c.firestore(), 'childPayments', 'pupilB_P2'), { pupilId: 'pupilB', paymentId: 'P2', payerName: 'Dad', allocations: [] });
  });
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'childPayments', 'pupilA_P1')));
  await assertFails(getDoc(doc(as(PARENT_A), 'childPayments', 'pupilB_P2')));
});
test('only the head teacher writes child-level payment records', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'childPayments', 'pupilA_X'), { pupilId: 'pupilA', allocations: [] }));
  await assertSucceeds(setDoc(doc(as(ADMIN), 'childPayments', 'pupilA_X'), { pupilId: 'pupilA', allocations: [] }));
});
test('a linked parent records a pending transfer for their child', async () => {
  await assertSucceeds(setDoc(doc(as(PARENT_A), 'childClaims', 'S1_pupilA'), { pupilId: 'pupilA', parentUid: PARENT_A, status: 'pending', submissionId: 'S1' }));
});
test('a parent cannot record a pending transfer for an unlinked child, or mark it confirmed', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'childClaims', 'S2_pupilB'), { pupilId: 'pupilB', parentUid: PARENT_A, status: 'pending', submissionId: 'S2' }));
  await assertFails(setDoc(doc(as(PARENT_A), 'childClaims', 'S3_pupilA'), { pupilId: 'pupilA', parentUid: PARENT_A, status: 'confirmed', submissionId: 'S3' }));
});
test('only the head teacher confirms or rejects a pending transfer', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'childClaims', 'S4_pupilA'), { pupilId: 'pupilA', parentUid: PARENT_A, status: 'pending', submissionId: 'S4' }));
  await assertFails(updateDoc(doc(as(PARENT_A), 'childClaims', 'S4_pupilA'), { status: 'confirmed' }));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'childClaims', 'S4_pupilA'), { status: 'confirmed' }));
});
test('a parent reads an advance they paid, or one for a linked child, not others', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'advanceCredits', 'A1'), { pupilId: 'pupilA', payerUid: PARENT_A, amount: 5000, appliedKobo: 0 });
    await setDoc(doc(c.firestore(), 'advanceCredits', 'A2'), { pupilId: 'pupilB', payerUid: 'someoneElse', amount: 5000, appliedKobo: 0 });
  });
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'advanceCredits', 'A1')));
  await assertFails(getDoc(doc(as(PARENT_A), 'advanceCredits', 'A2')));
});
test('only the head teacher creates or applies an advance', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'advanceCredits', 'A3'), { pupilId: 'pupilA', payerUid: PARENT_A, amount: 1, appliedKobo: 0 }));
  await assertSucceeds(setDoc(doc(as(ADMIN), 'advanceCredits', 'A3'), { pupilId: 'pupilA', payerUid: PARENT_A, amount: 1, appliedKobo: 0 }));
});
test('an advance applied to a fee may have no receipt; an ordinary payment must have one', async () => {
  await assertSucceeds(setDoc(doc(as(ADMIN), 'payments', 'applied1'), { amount: 5000, allocations: [], kind: 'advance_application', recordedBy: ADMIN }));
  await assertFails(setDoc(doc(as(ADMIN), 'payments', 'plain1'), { amount: 5000, allocations: [], recordedBy: ADMIN }));
});
test('an advance on a claim must name a child linked to the parent', async () => {
  await assertSucceeds(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 15000, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, advanceKobo: 5000, advancePupilId: 'pupilA', allocations: [{ chargeId: 'ch1', amount: 10000, pupilId: 'pupilA' }] }));
  await assertFails(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 15000, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, advanceKobo: 5000, advancePupilId: 'pupilB', allocations: [{ chargeId: 'ch1', amount: 10000, pupilId: 'pupilA' }] }));
  await assertFails(addDoc(collection(as(PARENT_A), 'paymentSubmissions'), { parentUid: PARENT_A, amount: 15000, status: 'pending', decidedBy: null, decidedAt: null, rejectionReason: null, advanceKobo: 5000, allocations: [{ chargeId: 'ch1', amount: 10000, pupilId: 'pupilA' }] }));
});

// ---- Stage 7: invited teachers, actions visibility ----
test('an invited teacher signs up straight in as an approved teacher, with exactly the invited rights', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'teacherInvites', 'new@x.test'), { email: 'new@x.test', teaching: { classIds: ['c1'], subjects: ['Mathematics'] } }));
  const ctx = env.authenticatedContext('newT', { email: 'new@x.test' }).firestore();
  await assertSucceeds(setDoc(doc(ctx, 'users', 'newT'), { uid: 'newT', email: 'new@x.test', displayName: 'New', role: 'teacher', createdAt: 1, teaching: { classIds: ['c1'], subjects: ['Mathematics'] } }));
});
test('an invited teacher cannot give themselves more classes than the head teacher invited', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'teacherInvites', 'greedy@x.test'), { email: 'greedy@x.test', teaching: { classIds: ['c1'], subjects: [] } }));
  const ctx = env.authenticatedContext('greedy', { email: 'greedy@x.test' }).firestore();
  await assertFails(setDoc(doc(ctx, 'users', 'greedy'), { uid: 'greedy', email: 'greedy@x.test', displayName: 'G', role: 'teacher', createdAt: 1, teaching: { classIds: ['c1', 'c2'], subjects: [] } }));
});
test('someone with no invitation cannot sign up as a teacher', async () => {
  const ctx = env.authenticatedContext('nobody', { email: 'nobody@x.test' }).firestore();
  await assertFails(setDoc(doc(ctx, 'users', 'nobody'), { uid: 'nobody', email: 'nobody@x.test', displayName: 'N', role: 'teacher', createdAt: 1, teaching: { classIds: [], subjects: [] } }));
});
test('a parent reads only their own actions', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'auditEvents', 'e1'), { actorUid: PARENT_A, action: 'x' });
    await setDoc(doc(c.firestore(), 'auditEvents', 'e2'), { actorUid: 'someoneElse', action: 'y' });
  });
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'auditEvents', 'e1')));
  await assertFails(getDoc(doc(as(PARENT_A), 'auditEvents', 'e2')));
  await assertSucceeds(getDoc(doc(as(ADMIN), 'auditEvents', 'e2')));
});
test('only the head teacher manages invitations', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'teacherInvites', 'x@x.test'), { email: 'x@x.test', teaching: { classIds: [], subjects: [] } }));
});

// ---- Stage 8: report comments review ----
test('a teacher writes stars and comments for their class as pending', async () => {
  await seedResults();
  await assertSucceeds(setDoc(doc(as('tch1'), 'reportExtras', 'pupilA_s9'), { pupilId: 'pupilA', sessionId: 's9', classId: 'c1', teacherUid: 'tch1', status: 'pending', behaviour: { punctuality: 4, neatness: 4, cooperation: 4, participation: 4 } }));
});
test('a teacher cannot write comments for a class they do not teach', async () => {
  await seedResults();
  await assertFails(setDoc(doc(as('tch1'), 'reportExtras', 'pupilB_s9'), { pupilId: 'pupilB', sessionId: 's9', classId: 'c2', teacherUid: 'tch1', status: 'pending', behaviour: {} }));
});
test('a teacher cannot publish their own comments', async () => {
  await seedResults();
  await setDoc(doc(as('tch1'), 'reportExtras', 'pupilA_s10'), { pupilId: 'pupilA', sessionId: 's10', classId: 'c1', teacherUid: 'tch1', status: 'pending', behaviour: {} });
  await assertFails(updateDoc(doc(as('tch1'), 'reportExtras', 'pupilA_s10'), { status: 'approved' }));
});
test('a parent reads comments only once approved', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'reportExtras', 'pupilA_s11'), { pupilId: 'pupilA', sessionId: 's11', classId: 'c1', teacherUid: 'tch1', status: 'pending', behaviour: {} });
    await setDoc(doc(c.firestore(), 'reportExtras', 'pupilA_s12'), { pupilId: 'pupilA', sessionId: 's12', classId: 'c1', teacherUid: 'tch1', status: 'approved', behaviour: {} });
  });
  await assertFails(getDoc(doc(as(PARENT_A), 'reportExtras', 'pupilA_s11')));
  await assertSucceeds(getDoc(doc(as(PARENT_A), 'reportExtras', 'pupilA_s12')));
});
test('the head teacher approves, rejects or edits any card', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'reportExtras', 'pupilA_s13'), { pupilId: 'pupilA', sessionId: 's13', classId: 'c1', teacherUid: 'tch1', status: 'pending', behaviour: {} }));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'reportExtras', 'pupilA_s13'), { status: 'approved' }));
});

// ---- Stage 10: payment corrections ----
test('the head teacher records a correction: negative, naming the payment, with a reason', async () => {
  await assertSucceeds(setDoc(doc(as(ADMIN), 'payments', 'rev1'), { amount: -5000, allocations: [{ pupilId: 'pupilA', chargeId: 'ch1', amount: -5000, category: 'Tuition', sessionId: 's', termId: 't' }], kind: 'reversal', reversesPaymentId: 'p0', reversalReason: 'Wrong child', recordedBy: ADMIN }));
});
test('a correction with no reason is refused', async () => {
  await assertFails(setDoc(doc(as(ADMIN), 'payments', 'rev2'), { amount: -5000, allocations: [], kind: 'reversal', reversesPaymentId: 'p0', reversalReason: '', recordedBy: ADMIN }));
});
test('a correction cannot be positive', async () => {
  await assertFails(setDoc(doc(as(ADMIN), 'payments', 'rev3'), { amount: 5000, allocations: [], kind: 'reversal', reversesPaymentId: 'p0', reversalReason: 'x', recordedBy: ADMIN }));
});
test('a parent cannot record a correction', async () => {
  await assertFails(setDoc(doc(as(PARENT_A), 'payments', 'rev4'), { amount: -5000, allocations: [], kind: 'reversal', reversesPaymentId: 'p0', reversalReason: 'x', recordedBy: PARENT_A }));
});

