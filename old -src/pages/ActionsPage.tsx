import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, Notice, Empty } from '../components/ui';
import { describeAction } from '../lib/actionText';
import type { AuditEvent } from '../types';

/** Everything recorded in the portal. The head teacher sees all actions; everyone else sees their own. */
export default function ActionsPage() {
  const { firebaseUser, role } = useAuth();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseUser || !role) return;
    const fail = (e: Error) => setError(e.message);
    const q = role === 'admin'
      ? collection(db, 'auditEvents')
      : query(collection(db, 'auditEvents'), where('actorUid', '==', firebaseUser.uid));
    const u: Unsubscribe = onSnapshot(q, (s) => {
      setEvents(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditEvent).sort((a, b) => b.at - a.at).slice(0, 300));
    }, fail);
    return u;
  }, [firebaseUser, role]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!events) return <Loading />;
  const shown = events.filter((e) => !filter.trim() || describeAction(e).toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <PageHeader title="Actions" subtitle={role === 'admin' ? 'Everything done in the portal, by whom and when.' : 'Everything you have done in the portal.'} />
      <input className="field max-w-md" placeholder="Search actions, e.g. payment or Miss Gbemi" aria-label="Search actions" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {shown.length === 0 ? (
        <Empty title="No actions yet" hint="Actions appear here as people use the portal." />
      ) : (
        <ul className="card divide-y divide-line p-0">
          {shown.map((e) => (
            <li key={e.id} className="px-5 py-4">
              <p className="text-base">{describeAction(e)}</p>
              <p className="mt-1 text-sm text-inkMuted">{new Date(e.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
