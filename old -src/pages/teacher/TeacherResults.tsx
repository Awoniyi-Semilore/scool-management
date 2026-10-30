import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Loading, Notice, PageHeader, Empty } from '../../components/ui';
import { createResultSheet, saveResultRows } from '../../services/data';
import { MAX_EXAM, MAX_TEST, gradeFor, markProblem, parseMark, termTotal } from '../../lib/results';
import type { ClassRoster, ResultRow, ResultSheet, SchoolClass, Teacher, Term } from '../../types';

type Msg = { kind: 'success' | 'error'; text: string } | null;
type Marks = Record<string, { test: string; exam: string }>;

export default function TeacherResults() {
  const { firebaseUser, profile } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [roster, setRoster] = useState<ClassRoster | null | undefined>(undefined);
  const [sheets, setSheets] = useState<ResultSheet[] | null>(null);
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [marks, setMarks] = useState<Marks>({});
  const [loadedKey, setLoadedKey] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!firebaseConfigured || !profile?.email || !firebaseUser) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'teachers'), where('email', '==', profile.email.toLowerCase())),
        (s) => setTeacher(s.docs.length ? ({ id: s.docs[0].id, ...s.docs[0].data() } as Teacher) : null), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
      onSnapshot(query(collection(db, 'terms'), where('active', '==', true)), (s) => setTerms(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Term)), fail),
      onSnapshot(query(collection(db, 'resultSheets'), where('teacherUid', '==', firebaseUser.uid)),
        (s) => setSheets(s.docs.map((d) => d.data() as ResultSheet)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.email, firebaseUser]);

  const myClasses = useMemo(() => (teacher ? classes.filter((c) => teacher.classIds.includes(c.id)) : []), [teacher, classes]);
  const mySubjects = teacher?.subjects ?? [];
  const term = terms[0] ?? null;

  // Default selections: first class and first subject the teacher has.
  useEffect(() => {
    if (!classId && myClasses.length) setClassId(myClasses[0].id);
    if (!subject && mySubjects.length) setSubject(mySubjects[0]);
  }, [myClasses, mySubjects, classId, subject]);

  // Roster for the chosen class.
  useEffect(() => {
    if (!firebaseConfigured || !classId) return;
    setRoster(undefined);
    return onSnapshot(doc(db, 'classRosters', classId),
      (s) => setRoster(s.exists() ? (s.data() as ClassRoster) : null),
      (e) => setMsg({ kind: 'error', text: e.message }));
  }, [classId]);

  // The latest version of this sheet (class, subject, term).
  const latest = useMemo(() => {
    if (!sheets || !term || !classId || !subject) return null;
    return sheets
      .filter((s) => s.classId === classId && s.subject === subject && s.termId === term.id)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }, [sheets, classId, subject, term]);

  // Fill the table from the latest version, once per selection.
  const key = `${classId}|${subject}|${term?.id ?? ''}|${latest?.id ?? 'none'}`;
  useEffect(() => {
    if (key === loadedKey || !roster) return;
    const next: Marks = {};
    for (const p of roster.pupils ?? []) {
      const r = latest?.rows.find((x) => x.pupilId === p.id);
      next[p.id] = { test: r?.test == null ? '' : String(r.test), exam: r?.exam == null ? '' : String(r.exam) };
    }
    setMarks(next);
    setLoadedKey(key);
  }, [key, roster, latest, loadedKey]);

  const rows: ResultRow[] = (roster?.pupils ?? []).map((p) => ({
    pupilId: p.id, name: p.name, admissionNumber: p.admissionNumber,
    test: parseMark(marks[p.id]?.test ?? ''), exam: parseMark(marks[p.id]?.exam ?? ''),
  }));
  const problems = rows.map((r) => ({ r, p: markProblem(r.test, r.exam) })).filter((x) => x.p);
  const locked = latest?.status === 'pending';
  const approved = latest?.status === 'approved';
  const rejected = latest?.status === 'rejected';

  async function saveDraft(send: boolean) {
    if (!teacher || !term || !roster) return;
    setBusy(true); setMsg(null);
    try {
      if (send && problems.length) throw new Error(`Fix ${problems.length} row(s) first. The highlighted scores are wrong or missing.`);
      let sheetId = latest && latest.status === 'draft' ? latest.id : null;
      if (!sheetId) {
        if (latest?.status === 'pending') throw new Error('This sheet is waiting for the Head Teacher. You cannot change it now.');
        const cls = classes.find((c) => c.id === classId);
        sheetId = await createResultSheet({
          teacherUid: firebaseUser!.uid, teacherName: teacher.fullName, classId, className: cls?.name ?? '',
          subject, sessionId: term.sessionId, termId: term.id, termName: term.name,
          version: (latest?.version ?? 0) + 1, rows,
        });
      } else {
        await saveResultRows(sheetId, rows, send);
      }
      if (sheetId && !(latest?.status === 'draft')) {
        // a new version was created above with the rows already; send it now if asked
        if (send) await saveResultRows(sheetId, rows, true);
      }
      setMsg({ kind: 'success', text: send ? 'Sent to the Head Teacher for approval.' : 'Draft saved.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  if (teacher === undefined || sheets === null) return <Loading />;
  if (teacher === null) return <Notice kind="error">Your classes have not been added yet. Ask the Head Teacher to add you.</Notice>;

  return (
    <div className="space-y-5">
      <PageHeader title="Enter results" subtitle="Test is out of 40. Exam is out of 60. The total and grade are worked out for you." />
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      {!term && <Notice kind="error">No term is active yet. The Head Teacher must set the current term first.</Notice>}

      <div className="card grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="tr-class">Class</label>
          <select id="tr-class" className="field" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="tr-subject">Subject</label>
          <select id="tr-subject" className="field" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {mySubjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div><label className="label">Term</label><p className="field flex items-center">{term?.name ?? '—'}</p></div>
      </div>

      {myClasses.length === 0 || mySubjects.length === 0 ? (
        <Empty title="Nothing to enter yet" hint="You need at least one class and one subject. Ask the Head Teacher to add them, or send a request from My home." />
      ) : roster === undefined ? <Loading /> : roster === null || rows.length === 0 ? (
        <Empty title="No pupils in this class yet" hint="Pupils appear here once they are added to the class." />
      ) : (
        <>
          {locked && <Notice kind="success">This sheet is with the Head Teacher. You cannot change it until it is approved or sent back.</Notice>}
          {approved && <Notice kind="success">Approved. Parents see these marks. To correct them, use Make a correction. Parents keep seeing the approved marks until the correction is approved.</Notice>}
          {rejected && <Notice kind="error">Sent back by the Head Teacher: {latest?.reason}. Correct the marks and send again.</Notice>}

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-left">
                <tr>
                  <th className="px-3 py-2">Child</th>
                  <th className="px-3 py-2">Admission no.</th>
                  <th className="px-3 py-2">Test /40</th>
                  <th className="px-3 py-2">Exam /60</th>
                  <th className="px-3 py-2">Total /100</th>
                  <th className="px-3 py-2">Grade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = markProblem(r.test, r.exam);
                  const total = r.test !== null && r.exam !== null && !p ? termTotal(r.test, r.exam) : null;
                  return (
                    <tr key={r.pupilId} className="border-t border-line">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-inkMuted">{r.admissionNumber}</td>
                      <td className="px-3 py-2">
                        <input aria-label={`Test for ${r.name}, out of ${MAX_TEST}`} inputMode="numeric" disabled={locked}
                          className={`field w-24 text-right ${marks[r.pupilId]?.test && r.test !== null && (r.test < 0 || r.test > MAX_TEST) ? 'border-red-500' : ''}`}
                          value={marks[r.pupilId]?.test ?? ''}
                          onChange={(e) => setMarks({ ...marks, [r.pupilId]: { test: e.target.value, exam: marks[r.pupilId]?.exam ?? '' } })} />
                      </td>
                      <td className="px-3 py-2">
                        <input aria-label={`Exam for ${r.name}, out of ${MAX_EXAM}`} inputMode="numeric" disabled={locked}
                          className={`field w-24 text-right ${marks[r.pupilId]?.exam && r.exam !== null && (r.exam < 0 || r.exam > MAX_EXAM) ? 'border-red-500' : ''}`}
                          value={marks[r.pupilId]?.exam ?? ''}
                          onChange={(e) => setMarks({ ...marks, [r.pupilId]: { test: marks[r.pupilId]?.test ?? '', exam: e.target.value } })} />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{total ?? '–'}</td>
                      <td className="px-3 py-2">{total !== null ? gradeFor(total) : <span className="text-inkMuted">{p ? 'Check this row' : '–'}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {problems.length > 0 && !locked && (
            <Notice kind="error">{problems.length} row(s) need attention: {problems.slice(0, 3).map((x) => `${x.r.name} — ${x.p}`).join(' ')}</Notice>
          )}

          {!locked && (
            <div className="flex flex-wrap gap-2">
              {approved ? (
                <button className="btn-primary" disabled={busy || !term} onClick={() => saveDraft(false)}>Make a correction</button>
              ) : (
                <>
                  <button className="btn-secondary" disabled={busy || !term} onClick={() => saveDraft(false)}>Save draft</button>
                  <button className="btn-primary" disabled={busy || !term || problems.length > 0} onClick={() => saveDraft(true)}>
                    {busy ? 'Sending…' : rejected ? 'Correct and send again' : 'Send for approval'}
                  </button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-inkMuted" aria-live="polite">{loadedKey === key ? 'Loaded.' : ''}</p>
        </>
      )}
    </div>
  );
}
