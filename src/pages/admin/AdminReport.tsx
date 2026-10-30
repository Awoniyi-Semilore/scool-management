import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import ReportCard from '../../components/ReportCard';
import BehaviourEditor from '../../components/BehaviourEditor';
import { buildReport } from '../../lib/reportCard';
import type { ReportExtras } from '../../services/data';
import type { AcademicSession, PublishedResult, Pupil, SchoolClass } from '../../types';

export default function AdminReport() {
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [pupilId, setPupilId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [items, setItems] = useState<Record<string, PublishedResult> | null | undefined>(undefined);
  const [extras, setExtras] = useState<ReportExtras | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
      onSnapshot(collection(db, 'sessions'), (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AcademicSession)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

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

  const pupil = pupils?.find((p) => p.id === pupilId) ?? null;
  const report = useMemo(() => buildReport(Object.values(items ?? {}), sessionId), [items, sessionId]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!pupils) return <Loading />;
  if (pupils.length === 0) return <Empty title="No pupils yet" hint="Add pupils before creating report cards." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Report cards" subtitle="Report cards use approved results. Add each child’s personal development ratings and comments here." />
      <section className="card grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="rp-pupil">Child</label>
          <select id="rp-pupil" className="field" value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
            {pupils.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName} · {p.admissionNumber}</option>)}
          </select></div>
        <div><label className="label" htmlFor="rp-session">Session</label>
          <select id="rp-session" className="field" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select></div>
      </section>
      {items === undefined || !pupil ? <Loading /> : (
        <>
          <ReportCard pupilName={`${pupil.firstName} ${pupil.lastName}`} admissionNumber={pupil.admissionNumber}
            className={classes.find((c) => c.id === pupil.classId)?.name ?? ''} sessionLabel={sessions.find((s) => s.id === sessionId)?.label ?? ''}
            report={report} extras={extras} />
          <BehaviourEditor key={`${pupilId}_${sessionId}`} pupilId={pupilId} sessionId={sessionId} current={extras} />
        </>
      )}
    </div>
  );
}
