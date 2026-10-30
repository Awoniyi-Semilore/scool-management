import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Loading, Notice, Empty, PageHeader } from '../../components/ui';
import { createTeacherRequest } from '../../services/data';
import { greetingNow } from '../../lib/greeting';
import type { SchoolClass, Teacher, TeacherRequest } from '../../types';

type Msg = { kind: 'success' | 'error'; text: string } | null;

export default function TeacherHome() {
  const { firebaseUser, profile } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [requests, setRequests] = useState<TeacherRequest[] | null>(null);
  const [form, setForm] = useState<'subject' | 'pupil' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState('');
  const [pupil, setPupil] = useState({ firstName: '', lastName: '', admissionNumber: '', classId: '' });

  useEffect(() => {
    if (!firebaseConfigured || !profile?.email) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'teachers'), where('email', '==', profile.email.toLowerCase())),
        (s) => setTeacher(s.docs.length ? (s.docs[0].data() as Teacher) : null), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
    ];
    if (firebaseUser) {
      unsubs.push(onSnapshot(query(collection(db, 'teacherRequests'), where('requesterUid', '==', firebaseUser.uid)),
        (s) => setRequests(s.docs.map((d) => d.data() as TeacherRequest).sort((a, b) => b.createdAt - a.createdAt)), fail));
    }
    return () => unsubs.forEach((u) => u());
  }, [profile?.email, firebaseUser]);

  const myClasses = teacher ? classes.filter((c) => teacher.classIds.includes(c.id)) : [];

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!teacher || !form) return;
    setBusy(true); setMsg(null);
    try {
      if (form === 'subject') await createTeacherRequest(teacher, { kind: 'subject', subject });
      else await createTeacherRequest(teacher, { kind: 'pupil', ...pupil });
      setForm(null); setSubject(''); setPupil({ firstName: '', lastName: '', admissionNumber: '', classId: '' });
      setMsg({ kind: 'success', text: 'Request sent. The Head Teacher will approve or reject it.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  const statusTag = (s: TeacherRequest['status']) =>
    s === 'approved' ? <span className="tag t-good">Approved</span>
      : s === 'rejected' ? <span className="tag t-bad">Not approved</span>
      : <span className="tag t-warn">Waiting for approval</span>;

  if (teacher === undefined) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title={`${greetingNow()}, ${profile?.displayName?.split(' ')[0] ?? 'there'}`} subtitle="Your classes, subjects and requests." />
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}

      {teacher === null ? (
        <Notice kind="error">Your account is approved as Teacher, but the Head Teacher has not added your classes yet. Ask the school to add you with the same email you sign in with.</Notice>
      ) : (
        <>
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">My classes and subjects</h2>
              <span className="tag t-info">{teacher.workType === 'full' ? 'Full time' : 'Part time'}</span>
            </div>
            <div>
              <p className="section-label mb-1">Classes</p>
              {myClasses.length ? <div className="flex flex-wrap gap-2">{myClasses.map((c) => <span key={c.id} className="chip">{c.name}</span>)}</div> : <p className="text-sm text-inkMuted">No classes assigned yet.</p>}
            </div>
            <div>
              <p className="section-label mb-1">Subjects</p>
              {teacher.subjects.length ? <div className="flex flex-wrap gap-2">{teacher.subjects.map((s) => <span key={s} className="chip">{s}</span>)}</div> : <p className="text-sm text-inkMuted">No subjects assigned yet.</p>}
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">Ask the Head Teacher</h2>
            <p className="text-sm text-inkMuted">You cannot add a pupil or a subject yourself. Send a request, and it is added once approved.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setForm(form === 'subject' ? null : 'subject')}>Request a subject</button>
              <button className="btn-secondary" onClick={() => setForm(form === 'pupil' ? null : 'pupil')} disabled={myClasses.length === 0}>Request a pupil</button>
            </div>
            {form === 'subject' && (
              <form onSubmit={send} className="space-y-3 rounded-xl border border-line p-4">
                <label className="label" htmlFor="rq-subject">Subject name</label>
                <input id="rq-subject" className="field" placeholder="e.g. Commerce" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
              </form>
            )}
            {form === 'pupil' && (
              <form onSubmit={send} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="rq-first">First name</label><input id="rq-first" className="field" value={pupil.firstName} onChange={(e) => setPupil({ ...pupil, firstName: e.target.value })} /></div>
                <div><label className="label" htmlFor="rq-last">Last name</label><input id="rq-last" className="field" value={pupil.lastName} onChange={(e) => setPupil({ ...pupil, lastName: e.target.value })} /></div>
                <div><label className="label" htmlFor="rq-adm">Admission number</label><input id="rq-adm" className="field" value={pupil.admissionNumber} onChange={(e) => setPupil({ ...pupil, admissionNumber: e.target.value })} /></div>
                <div><label className="label" htmlFor="rq-class">Class</label>
                  <select id="rq-class" className="field" value={pupil.classId} onChange={(e) => setPupil({ ...pupil, classId: e.target.value })}>
                    <option value="">Choose a class</option>
                    {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></div>
              </form>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">My requests</h2>
            {requests === null ? <Loading /> : requests.length === 0 ? (
              <Empty title="No requests yet" hint="Requests you send appear here with their status." />
            ) : (
              <ul className="divide-y divide-line">
                {requests.map((r) => (
                  <li key={r.id} className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{r.kind === 'subject' ? `Subject: ${r.subject}` : `Pupil: ${r.pupil?.firstName} ${r.pupil?.lastName}`}</p>
                      {statusTag(r.status)}
                    </div>
                    {r.status === 'rejected' && r.reason && <p className="text-sm text-inkMuted">Reason: {r.reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
