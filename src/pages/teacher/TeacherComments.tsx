import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Loading, Notice, PageHeader, Empty } from '../../components/ui';
import { submitReportComments, type ReportExtras } from '../../services/data';
import type { AcademicSession, ClassRoster, SchoolClass, Teacher, Term } from '../../types';

type Stars = ReportExtras['behaviour'];
const EMPTY: Stars = { punctuality: 5, neatness: 5, cooperation: 5, participation: 5 };
const LABELS: { key: keyof Stars; label: string }[] = [
  { key: 'punctuality', label: 'Punctuality' }, { key: 'neatness', label: 'Neatness' },
  { key: 'cooperation', label: 'Cooperation' }, { key: 'participation', label: 'Participation' },
];

/** Teacher enters stars and a comment for each child in their class. The head teacher then reviews every card. */
export default function TeacherComments() {
  const { profile } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classId, setClassId] = useState('');
  const [roster, setRoster] = useState<ClassRoster | null | undefined>(undefined);
  const [rows, setRows] = useState<Record<string, { stars: Stars; comment: string; saved?: ReportExtras | null }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || !profile?.email) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'teachers'), where('email', '==', profile.email.toLowerCase())),
        (s) => setTeacher(s.docs.length ? ({ id: s.docs[0].id, ...s.docs[0].data() } as Teacher) : null), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
      onSnapshot(query(collection(db, 'terms'), where('active', '==', true)), (s) => setTerms(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Term)), fail),
      onSnapshot(collection(db, 'sessions'), (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AcademicSession)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.email]);

  const myClasses = useMemo(() => (teacher ? classes.filter((c) => teacher.classIds.includes(c.id)) : []), [teacher, classes]);
  useEffect(() => { if (!classId && myClasses.length) setClassId(myClasses[0].id); }, [myClasses, classId]);
  const term = terms[0] ?? null;
  const sessionId = term?.sessionId ?? sessions.find((s) => s.active)?.id ?? '';

  useEffect(() => {
    if (!firebaseConfigured || !classId) return;
    setRoster(undefined);
    return onSnapshot(doc(db, 'classRosters', classId), (s) => setRoster(s.exists() ? (s.data() as ClassRoster) : null));
  }, [classId]);

  // Load what was already sent for each child in this class and session.
  useEffect(() => {
    if (!roster || !sessionId) return;
    (async () => {
      const next: typeof rows = {};
      for (const p of roster.pupils) {
        const snap = await getDoc(doc(db, 'reportExtras', `${p.id}_${sessionId}`));
        const saved = snap.exists() ? (snap.data() as ReportExtras) : null;
        next[p.id] = { stars: saved?.behaviour ?? EMPTY, comment: saved?.teacherComment ?? '', saved };
      }
      setRows(next);
    })().catch((e) => setMsg({ kind: 'error', text: (e as Error).message }));
  }, [roster, sessionId]);

  async function sendAll() {
    if (!teacher || !roster || !sessionId) return;
    setBusy(true); setMsg(null);
    try {
      let n = 0;
      for (const p of roster.pupils) {
        const r = rows[p.id];
        if (!r || r.saved?.status === 'approved') continue;   // approved cards are changed by the head teacher only
        await submitReportComments({ pupilId: p.id, sessionId, classId, teacherName: teacher.fullName, behaviour: r.stars, teacherComment: r.comment });
        n++;
      }
      setMsg({ kind: 'success', text: `${n} card(s) sent to the Head Teacher for review.` });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally { setBusy(false); }
  }

  if (teacher === undefined) return <Loading />;
  if (teacher === null) return <Notice kind="error">Your classes have not been added yet. Ask the Head Teacher to add you.</Notice>;

  return (
    <div className="space-y-6">
      <PageHeader title="Report comments" subtitle="Give each child stars out of 5 and a comment. The Head Teacher checks every card before parents see it." />
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      {!term && <Notice kind="error">No term is active yet. The Head Teacher must set the current term first.</Notice>}
      {myClasses.length === 0 ? <Empty title="No classes yet" hint="Ask the Head Teacher to add your class." /> : (
        <>
          <div className="card grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="tc-class">Class</label>
              <select id="tc-class" className="field" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="label">Session</label><p className="field flex items-center">{sessions.find((s) => s.id === sessionId)?.label ?? '—'}</p></div>
          </div>
          {roster === undefined ? <Loading /> : !roster || roster.pupils.length === 0 ? (
            <Empty title="No children in this class yet" hint="Children appear here once they are added to the class." />
          ) : (
            <div className="space-y-4">
              {roster.pupils.map((p) => {
                const r = rows[p.id];
                const locked = r?.saved?.status === 'approved';
                return (
                  <section key={p.id} className="card space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="font-semibold">{p.name}</p><p className="text-sm text-inkMuted">{p.admissionNumber || 'No admission number'}</p></div>
                      <StatusTag status={r?.saved?.status ?? null} />
                    </div>
                    {r?.saved?.status === 'rejected' && r.saved.reviewReason && (
                      <Notice kind="error">Sent back by the Head Teacher: {r.saved.reviewReason}</Notice>
                    )}
                    {r && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {LABELS.map((l) => (
                          <div key={l.key}>
                            <label className="label" htmlFor={`${p.id}-${l.key}`}>{l.label} (0 to 5)</label>
                            <input id={`${p.id}-${l.key}`} type="number" min={0} max={5} className="field" disabled={locked} value={r.stars[l.key]}
                              onChange={(e) => setRows({ ...rows, [p.id]: { ...r, stars: { ...r.stars, [l.key]: Number(e.target.value) } } })} />
                          </div>
                        ))}
                        <div className="sm:col-span-2">
                          <label className="label" htmlFor={`${p.id}-comment`}>Teacher’s comment</label>
                          <textarea id={`${p.id}-comment`} rows={2} className="field" disabled={locked} value={r.comment}
                            onChange={(e) => setRows({ ...rows, [p.id]: { ...r, comment: e.target.value } })} />
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
              <div className="flex justify-end">
                <button className="btn-primary" disabled={busy || !term} onClick={sendAll}>{busy ? 'Sending…' : 'Send all for review'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function StatusTag({ status }: { status: ReportExtras['status'] | null }) {
  if (status === 'approved') return <span className="tag t-good">Approved</span>;
  if (status === 'pending') return <span className="tag t-warn">Waiting for review</span>;
  if (status === 'rejected') return <span className="tag t-bad">Sent back</span>;
  return <span className="tag t-info">Not sent yet</span>;
}

