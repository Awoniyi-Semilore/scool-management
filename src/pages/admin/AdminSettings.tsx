import { useEffect, useState, type FormEvent } from 'react';
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { createTeacher, updateTeacher, decideTeacherRequest, saveBankDetails, rebuildChildPayments, rebuildPendingClaims, setRoleByEmail } from '../../services/data';
import { cleanSubjects } from '../../lib/schoolLevels';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import { createSession, setActiveTerm, saveClass, decideAccessRequest } from '../../services/data';
import type { AcademicSession, SchoolClass, Term, UserProfile, Teacher, TeacherRequest, WorkType, BankDetails } from '../../types';

export default function AdminSettings() {
  const [sessions, setSessions] = useState<AcademicSession[] | null>(null);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'sessions'), (s) => setSessions(s.docs.map((d) => d.data() as AcademicSession)), fail),
      onSnapshot(collection(db, 'terms'), (s) => setTerms(s.docs.map((d) => d.data() as Term)), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!firebaseConfigured) return <Notice kind="error">The portal is not ready yet. Contact the school administrator for help.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;

  return (
    <>
      <PageHeader title="Settings" subtitle="Set up school sessions and terms, manage classes and access, and update payment details." />
      <HeadTeacherAccess />
      <BankDetailsPanel />
      <ChildRecordsPanel />
      <ResetGuide />
      {message && <div className="mb-4"><Notice kind={message.kind}>{message.text}</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <SessionForm onMessage={setMessage} />
        <ClassList classes={classes} onMessage={setMessage} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Sessions and terms</h2>
        {sessions === null || terms === null ? <Loading /> : sessions.length === 0 ? (
          <Empty title="No academic sessions yet" hint="Create a session to set up its terms, for example 2026-2027." />
        ) : (
          <div className="space-y-4">
            {[...sessions].sort((a, b) => b.id.localeCompare(a.id)).map((s) => (
              <div key={s.id} className="card">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-semibold">{s.label} {s.active && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">Current session</span>}</p>
                </div>
                <div className="table-wrap">
                  <table className="table w-full">
                    <thead><tr><th>Term</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {terms.filter((t) => t.sessionId === s.id).sort((a, b) => a.ordinal - b.ordinal).map((t) => (
                        <tr key={t.id}>
                          <td>{t.name}</td>
                          <td>{t.startDate || '—'}</td>
                          <td>{t.endDate || '—'}</td>
                          <td>{t.active ? <strong>Active term</strong> : 'Not active'}</td>
                          <td className="text-right">
                            {!t.active && (
                              <button className="btn-secondary px-3 py-1" onClick={async () => {
                                if (!window.confirm(`Make ${t.name} ${s.id} the active term? Payments entered in the register will default to it.`)) return;
                                try { await setActiveTerm(t.id, s.id); setMessage({ kind: 'success', text: `${t.name} is now the active term.` }); }
                                catch (e) { setMessage({ kind: 'error', text: (e as Error).message }); }
                              }}>Make active</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function SessionForm({ onMessage }: { onMessage: (m: { kind: 'success' | 'error'; text: string } | null) => void }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await createSession(label || id, id);
      setId(''); setLabel('');
      onMessage({ kind: 'success', text: 'Session created with First, Second and Third Term.' });
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    }
  }
  return (
    <form className="card space-y-3" onSubmit={submit}>
      <h2 className="font-semibold">Create an academic session</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="sid">Session ID</label><input id="sid" className="field" placeholder="2026-2027" value={id} onChange={(e) => setId(e.target.value)} /></div>
        <div><label className="label" htmlFor="slabel">Label</label><input id="slabel" className="field" placeholder="2026/2027 Session" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      </div>
      <button className="btn-primary" type="submit">Create session</button>
    </form>
  );
}

function ClassList({ classes, onMessage }: { classes: SchoolClass[] | null; onMessage: (m: { kind: 'success' | 'error'; text: string } | null) => void }) {
  const [name, setName] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    try { await saveClass(name); setName(''); onMessage({ kind: 'success', text: 'Class added.' }); }
    catch (err) { onMessage({ kind: 'error', text: (err as Error).message }); }
  }
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Classes</h2>
      {classes === null ? <Loading /> : (
        <ul className="list-disc pl-5 text-sm">
          {classes.map((c) => <li key={c.id}>{c.name}</li>)}
          {classes.length === 0 && <li className="list-none pl-0 text-inkMuted">No classes yet.</li>}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={add}>
        <input aria-label="New class name" className="field" placeholder="e.g. Primary 4" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" type="submit">Add</button>
      </form>
    </div>
  );
}

/** Teacher and staff sign-up requests. Only the head teacher can approve or reject them. */
export function AccessRequests() {
  const [requests, setRequests] = useState<UserProfile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(query(collection(db, 'users'), where('requestStatus', '==', 'pending')),
      (s) => setRequests(s.docs.map((d) => d.data() as UserProfile)),
      (e) => setMsg({ kind: 'error', text: e.message }));
  }, []);

  async function decide(uid: string, approve: boolean) {
    setBusy(uid); setMsg(null);
    try {
      await decideAccessRequest(uid, approve);
      setMsg({ kind: 'success', text: approve ? 'Approved. They can now sign in with that role.' : 'Request rejected.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(null); }
  }

  return (
    <section className="card mb-6">
      <h2 className="mb-1 text-lg font-semibold">Access requests</h2>
      <p className="mb-4 text-sm text-inkMuted">Review requests from people who want to sign in as a teacher or staff member. Approve only people you recognise.</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {requests === null ? <Loading /> : requests.length === 0 ? (
        <Empty title="No access requests to review" hint="New requests to join as a teacher or staff member will appear here." />
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => (
            <li key={r.uid} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{r.displayName || r.email}</p>
                <p className="text-sm text-inkMuted">{r.email} · requested access as <b>{r.requestedRole === 'teacher' ? 'Teacher' : 'Staff'}</b></p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={busy === r.uid} onClick={() => decide(r.uid, false)}>Reject</button>
                <button className="btn-primary" disabled={busy === r.uid} onClick={() => decide(r.uid, true)}>{busy === r.uid ? 'Saving…' : 'Approve'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Teachers: full or part time, several classes and subjects each. */
export function TeachersPanel() {
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const u1 = onSnapshot(collection(db, 'teachers'), (s) => setTeachers(s.docs.map((d) => d.data() as Teacher)), fail);
    const u2 = onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail);
    return () => { u1(); u2(); };
  }, []);

  const classNameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? 'Class removed';

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-inkMuted">{teachers ? `${teachers.length} teacher${teachers.length === 1 ? '' : 's'}` : ''}</p>
        <button className="btn-primary" onClick={() => setEditing('new')}>Add a teacher</button>
      </div>
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      {editing && (
        <TeacherForm
          key={editing === 'new' ? 'new' : editing.id}
          teacher={editing === 'new' ? null : editing}
          classes={classes}
          onDone={(text) => { setEditing(null); setMsg({ kind: 'success', text }); }}
          onCancel={() => setEditing(null)}
          onError={(text) => setMsg({ kind: 'error', text })}
        />
      )}
      {teachers === null ? <Loading /> : teachers.length === 0 ? (
        <Empty title="No teachers yet" hint="Add a teacher here or while creating a class." />
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead><tr><th>Name</th><th>Email</th><th>Subjects</th><th>Work type</th><th>Classes</th><th></th></tr></thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.fullName}</td>
                  <td>{t.email}</td>
                  <td>{t.subjects.length ? t.subjects.join(', ') : '—'}</td>
                  <td><span className="tag t-info">{t.workType === 'full' ? 'Full time' : 'Part time'}</span></td>
                  <td>{t.classIds.length ? t.classIds.map(classNameOf).join(', ') : '—'}</td>
                  <td><button className="btn-secondary px-3 py-1.5" onClick={() => setEditing(t)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TeacherForm({ teacher, classes, onDone, onCancel, onError }: {
  teacher: Teacher | null; classes: SchoolClass[];
  onDone: (text: string) => void; onCancel: () => void; onError: (text: string) => void;
}) {
  const [fullName, setFullName] = useState(teacher?.fullName ?? '');
  const [email, setEmail] = useState(teacher?.email ?? '');
  const [workType, setWorkType] = useState<WorkType>(teacher?.workType ?? 'full');
  const [classIds, setClassIds] = useState<string[]>(teacher?.classIds ?? []);
  const [subjectText, setSubjectText] = useState((teacher?.subjects ?? []).join(', '));
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const subjects = cleanSubjects(subjectText.split(','));
    try {
      if (teacher) {
        await updateTeacher(teacher.id, { workType, classIds, subjects });
        onDone(`${teacher.fullName} updated.`);
      } else {
        await createTeacher({ fullName, email, workType, classIds, subjects });
        onDone(`${fullName.trim()} added. They sign in as Teacher with ${email.trim().toLowerCase()}.`);
      }
    } catch (err) {
      onError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="mb-4 space-y-4 rounded-xl border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="t-name">Full name</label>
          <input id="t-name" className="field" value={fullName} disabled={!!teacher} onChange={(e) => setFullName(e.target.value)} /></div>
        <div><label className="label" htmlFor="t-email">Email (for sign-in)</label>
          <input id="t-email" type="email" className="field" value={email} disabled={!!teacher} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="t-work">Work type</label>
          <select id="t-work" className="field" value={workType} onChange={(e) => setWorkType(e.target.value as WorkType)}>
            <option value="full">Full time</option><option value="part">Part time</option>
          </select></div>
      </div>
      <fieldset>
        <legend className="label">Classes they teach</legend>
        {classes.length === 0 ? <p className="text-sm text-inkMuted">Add a class first.</p> : (
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <label key={c.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${classIds.includes(c.id) ? 'border-brand-600 bg-brand-50 font-semibold text-brand-900' : 'border-line'}`}>
                <input type="checkbox" className="mr-2" checked={classIds.includes(c.id)}
                  onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((x) => x !== c.id))} />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div>
        <label className="label" htmlFor="t-subjects">Subjects they teach</label>
        <input id="t-subjects" className="field" placeholder="e.g. Commerce, Basic Technology, Mathematics" value={subjectText} onChange={(e) => setSubjectText(e.target.value)} />
        <p className="mt-1 text-xs text-inkMuted">Separate subjects with commas.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : teacher ? 'Save changes' : 'Add teacher'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** Subject and pupil requests from teachers. Approve, or reject with a reason. */
export function TeacherRequests() {
  const [requests, setRequests] = useState<TeacherRequest[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(query(collection(db, 'teacherRequests'), where('status', '==', 'pending')),
      (s) => setRequests(s.docs.map((d) => d.data() as TeacherRequest)),
      (e) => setMsg({ kind: 'error', text: e.message }));
  }, []);

  async function decide(r: TeacherRequest, approve: boolean) {
    setBusy(r.id); setMsg(null);
    try {
      await decideTeacherRequest(r, approve, reasons[r.id]);
      setMsg({ kind: 'success', text: approve ? 'Approved.' : 'Sent back to the teacher with your reason.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(null); }
  }

  return (
    <section className="card mb-6">
      <h2 className="mb-1 text-lg font-semibold">Teacher requests</h2>
      <p className="mb-4 text-sm text-inkMuted">Teachers ask here to add a subject or a pupil. Only you can add them.</p>
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      {requests === null ? <Loading /> : requests.length === 0 ? (
        <Empty title="No teacher requests to review" hint="Requests to add subjects or pupils will appear here." />
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => (
            <li key={r.id} className="space-y-2 py-3">
              <p className="font-medium">{r.teacherName} requests to {r.kind === 'subject' ? <>add the subject <b>{r.subject}</b></> : <>add the pupil <b>{r.pupil?.firstName} {r.pupil?.lastName}</b>{r.pupil?.admissionNumber ? ` (${r.pupil.admissionNumber})` : ''}</>}</p>
              <input className="field" placeholder="Reason, only if you reject (required to reject)" value={reasons[r.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} aria-label={`Reason for ${r.teacherName}`} />
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={busy === r.id} onClick={() => decide(r, false)}>Reject</button>
                <button className="btn-primary" disabled={busy === r.id} onClick={() => decide(r, true)}>Approve</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The school's bank details. Parents see these when they make a payment. Only the head teacher can change them. */
function BankDetailsPanel() {
  const [current, setCurrent] = useState<BankDetails | null | undefined>(undefined);
  const [form, setForm] = useState({ bankName: '', accountName: '', accountNumber: '' });
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(doc(db, 'schoolSettings', 'bank'),
      (s) => setCurrent(s.exists() ? (s.data() as BankDetails) : null),
      (e) => setMsg({ kind: 'error', text: e.message }));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const f = current ? form : form;
    if (!window.confirm(`Change the bank details parents see to ${f.accountName || '—'}, account ${f.accountNumber || '—'}? Check the account number carefully. This is recorded in the history.`)) return;
    setBusy(true); setMsg(null);
    try {
      await saveBankDetails(f);
      setMsg({ kind: 'success', text: 'Bank details saved.' });
      setForm({ bankName: '', accountName: '', accountNumber: '' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <section className="card mb-6">
      <h2 className="mb-1 text-lg font-semibold">School bank details</h2>
      <p className="mb-4 text-sm text-inkMuted">Parents transfer money to this account. Only you can change it, and each change is recorded.</p>
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      {current === undefined ? <Loading /> : (
        <>
          <p className="mb-4 rounded-xl bg-brand-50 p-3 text-sm">
            {current ? <>Currently: <b>{current.bankName}</b> · {current.accountName} · <b>{current.accountNumber}</b></> : 'Not set yet. Parents will see a message until you add the details.'}
          </p>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="bk-bank">Bank name</label><input id="bk-bank" className="field" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
            <div><label className="label" htmlFor="bk-name">Account name</label><input id="bk-name" className="field" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} /></div>
            <div><label className="label" htmlFor="bk-num">Account number (10 digits)</label><input id="bk-num" inputMode="numeric" className="field" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></div>
            <div className="sm:col-span-3"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save bank details'}</button></div>
          </form>
        </>
      )}
    </section>
  );
}

/** One-off repair for payments recorded before per-child records existed. Safe to run again. */
function ChildRecordsPanel() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  async function run() {
    if (!window.confirm('Create the per-child payment records for every earlier payment? This only adds records. It is safe to run again.')) return;
    setBusy(true); setMsg(null);
    try {
      const n = await rebuildChildPayments();
      const m = await rebuildPendingClaims();
      setMsg({ kind: 'success', text: `Done. ${n} payment record(s) and ${m} pending transfer record(s) written.` });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }
  return (
    <section className="card mb-6">
      <h2 className="mb-1 text-lg font-semibold">Child payment records</h2>
      <p className="mb-4 text-sm text-inkMuted">This one-time update adds a separate record for each child on older payments, so those payments appear on every linked guardian’s statement. It does not create new payments and is safe to run again.</p>
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      <button className="btn-secondary" disabled={busy} onClick={run}>{busy ? 'Working…' : 'Create missing child records'}</button>
    </section>
  );
}

/** Head Teacher access. Only an existing Head Teacher can grant or remove it. Every change asks for a second confirmation. */
export function HeadTeacherAccess() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  async function change(role: 'admin' | 'parent') {
    const clean = email.trim().toLowerCase();
    if (!clean) return setMsg({ kind: 'error', text: 'Enter the email address of the person.' });
    const verb = role === 'admin' ? 'give Head Teacher access to' : 'remove Head Teacher access from';
    if (!window.confirm(`Are you sure you want to ${verb} ${clean}?\n\nA Head Teacher can see and change everything in the portal.`)) return;
    if (!window.confirm(`Please confirm once more: ${role === 'admin' ? 'give' : 'remove'} Head Teacher access for ${clean}. This is recorded in Actions.`)) return;
    setBusy(true); setMsg(null);
    try {
      await setRoleByEmail(clean, role);
      setMsg({ kind: 'success', text: role === 'admin' ? `${clean} now has Head Teacher access.` : `${clean} no longer has Head Teacher access.` });
      setEmail('');
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }
  return (
    <section className="card mb-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Head Teacher access</h2>
        <p className="text-sm text-inkMuted">Only a Head Teacher can grant or remove this access. The person must already have an account. Every change is recorded in Actions.</p>
      </div>
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div><label className="label" htmlFor="ha-email">Account email address</label>
          <input id="ha-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn-primary self-end" disabled={busy} onClick={() => change('admin')}>Give access</button>
        <button className="btn-secondary self-end" disabled={busy} onClick={() => change('parent')}>Remove access</button>
      </div>
    </section>
  );
}

/** Start a new term, or remove test data. Deleting payments, statements and audit records is deliberately not possible in the app. */
function ResetGuide() {
  return (
    <section className="card mb-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Start a new term or clear test data</h2>
        <p className="text-sm text-inkMuted">The portal does not let you delete payment, statement or action history. To clear test data, use the Firebase Console and follow these steps carefully.</p>
      </div>
      <div className="note-card">
        <p className="font-semibold">Before you delete anything</p>
        <p>Export any records you need first: in Firebase Console, open Firestore Database and choose Export, or copy the figures to a spreadsheet. Deletion is permanent. Only clear data from a test project.</p>
      </div>
      <ol className="list-decimal space-y-2 pl-6 text-sm">
        <li><b>New term (keeps history):</b> add the next term in Settings → Terms, then set it as the active term. Older terms stay.</li>
        <li><b>Remove test people:</b> Firebase Console → Authentication → Users. Tick the test accounts and delete them. Keep your own head teacher account.</li>
        <li><b>Remove test records:</b> Firebase Console → Firestore Database. Delete the documents in these collections, in this order: receipts, payments, childPayments, childClaims, advanceCredits, paymentSubmissions, charges, parentLinks, linkRequests, classFees, classRosters, pupils, reportExtras, resultSheets, results, pupilResults, resultVersions, statements, counters, teacherRequests, teacherInvites, teachers.</li>
        <li><b>Keep:</b> users (other than test accounts), classes, sessions, terms, schoolSettings (bank details), and auditEvents if you want the history.</li>
        <li>Restart the receipt count only if no receipts are kept: delete the counters document “receipts”. Then the next receipt is TCS-000001.</li>
      </ol>
    </section>
  );
}
