import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import { AccessRequests, TeacherRequests } from './AdminSettings';
import { RequestCard } from './PupilsClasses';
import type { LinkRequest, Pupil, SchoolClass } from '../../types';

/** Everything waiting for the head teacher in one place: parent access, pupil requests, teacher sign-ups and teacher requests. */
export default function Approvals() {
  const [links, setLinks] = useState<LinkRequest[] | null>(null);
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'linkRequests'), where('status', '==', 'pending')), (s) => setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as LinkRequest)), fail),
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? 'Class';

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" subtitle="Review parent requests to link children, teacher sign-ups, and requests from teachers. Access or changes take effect only after you approve them." />
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Parent requests to link a child</h2>
        {links === null ? <Loading /> : links.length === 0 ? <Empty title="No parent requests to review" hint="New requests to link a child will appear here." /> : (
          <div className="space-y-4">
            {links.map((r) => (
              <RequestCard key={r.id} req={r} pupils={pupils} classes={classes} className={className} onMessage={setMsg} />
            ))}
          </div>
        )}
      </section>

      <AccessRequests />
      <TeacherRequests />
    </div>
  );
}
