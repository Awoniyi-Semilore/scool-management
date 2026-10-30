import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { linkedListeners } from '../../services/parentListeners';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import ReportCard from '../../components/ReportCard';
import { buildReport } from '../../lib/reportCard';
import type { ReportExtras } from '../../services/data';
import type { AcademicSession, PublishedResult, Pupil, SchoolClass } from '../../types';
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

export default function ParentReport() {
  const { firebaseUser } = useAuth();
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [pupilId, setPupilId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [items, setItems] = useState<Record<string, PublishedResult> | null | undefined>(undefined);
  const [extras, setExtras] = useState<ReportExtras | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubs: Unsubscribe[] = linkedListeners(firebaseUser.uid, { setPupils, fail: (e) => setError(e.message) });
    unsubs.push(onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), () => {}));
    unsubs.push(onSnapshot(collection(db, 'sessions'), (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AcademicSession)), () => {}));
    return () => unsubs.forEach((u) => u());
  }, [firebaseUser]);

  useEffect(() => {
    if (!pupilId && pupils?.length) setPupilId(pupils[0].id);
    if (!sessionId && sessions.length) setSessionId((sessions.find((s) => s.active) ?? sessions[0]).id);
  }, [pupils, sessions, pupilId, sessionId]);

  useEffect(() => {
    if (!pupilId || !sessionId) return;
    setItems(undefined);
    getDoc(doc(db, 'pupilResults', pupilId)).then((s) => setItems(s.exists() ? (s.data().items as Record<string, PublishedResult>) : null))
      .catch((e) => setError((e as Error).message));
    getDoc(doc(db, 'reportExtras', `${pupilId}_${sessionId}`)).then((s) => setExtras(s.exists() ? (s.data() as ReportExtras) : null))
      .catch(() => setExtras(null));
  }, [pupilId, sessionId]);

  const report = useMemo(() => buildReport(Object.values(items ?? {}), sessionId), [items, sessionId]);
  const pupil = pupils?.find((p) => p.id === pupilId) ?? null;

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!pupils) return <Loading />;
  if (pupils.length === 0) return <Empty title="No children linked yet" hint="Report cards will appear after the school links a child to your account." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Report cards" subtitle="View results after the school has reviewed and approved them." />
      <section className="card grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="pr-pupil">Child</label>
          <select id="pr-pupil" className="field" value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
            {pupils.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
          </select></div>
        <div><label className="label" htmlFor="pr-session">Session</label>
          <select id="pr-session" className="field" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select></div>
      </section>
      {items === undefined || !pupil ? <Loading /> : (
        <ReportCard pupilName={`${pupil.firstName} ${pupil.lastName}`} admissionNumber={pupil.admissionNumber}
          className={classes.find((c) => c.id === pupil.classId)?.name ?? ''} sessionLabel={sessions.find((s) => s.id === sessionId)?.label ?? ''}
          report={report} extras={extras} />
      )}
    </div>
  );
}
