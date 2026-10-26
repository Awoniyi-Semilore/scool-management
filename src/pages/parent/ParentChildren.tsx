import { linkedListeners } from '../../services/parentListeners';
import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot, query, where, addDoc, getDocs, type Unsubscribe } from 'firebase/firestore';
import { db, auth, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty, StatusBadge } from '../../components/ui';
import type { LinkRequest, ParentPupilLink, Pupil, SchoolClass } from '../../types';

export default function ParentChildren() {
  const [links, setLinks] = useState<ParentPupilLink[] | null>(null);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [requests, setRequests] = useState<LinkRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'parentLinks'), where('parentUid', '==', uid)), (s) => setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ParentPupilLink)), fail),
      onSnapshot(query(collection(db, 'linkRequests'), where('parentUid', '==', uid)), (s) => setRequests(s.docs.map((d) => ({ id: d.id, ...d.data() }) as LinkRequest)), fail),
      ...linkedListeners(uid, { setPupils, fail }),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!firebaseConfigured) return <Notice kind="error">Firebase is not configured.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;

  const approved = (links ?? []).filter((l) => l.status === 'approved');
  const myPupils = approved.map((l) => pupils?.find((p) => p.id === l.pupilId)).filter(Boolean) as Pupil[];
  const className = (id: string) => classes?.find((c) => c.id === id)?.name ?? '';

  return (
    <>
      <PageHeader title="My Children" subtitle="Pupils the school has approved for your account." />
      {message && <div className="mb-4"><Notice kind={message.kind}>{message.text}</Notice></div>}
      {links === null || pupils === null ? <Loading /> : myPupils.length === 0 ? (
        <Empty title="No approved pupils yet" hint="Add your child below. The head teacher will review the request before you can see their fees." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {myPupils.map((p) => (
            <div key={p.id} className="card">
              <p className="text-lg font-bold">{p.firstName} {p.lastName}</p>
              <p className="text-sm text-inkMuted">Admission no. {p.admissionNumber} · {className(p.classId) || 'Class not set'}</p>
            </div>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Ask to add a child</h2>
        <AddChildForm onMessage={setMessage} existing={requests ?? []} />
      </section>

      {requests && requests.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Your requests</h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="card">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.pupilFirstName} {r.pupilLastName}</p>
                  <StatusBadge status={r.status} />
                </div>
                {r.status === 'rejected' && r.rejectionReason && (
                  <p className="mt-2 text-sm text-red-800 dark:text-red-200">Reason: {r.rejectionReason}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function AddChildForm({ onMessage, existing }: { onMessage: (m: { kind: 'success' | 'error'; text: string } | null) => void; existing: LinkRequest[] }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', admissionNumber: '', classHint: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    onMessage(null);
    if (!form.firstName.trim() || !form.lastName.trim()) return onMessage({ kind: 'error', text: 'Enter the child\'s first and last name.' });
    if (!auth.currentUser) return onMessage({ kind: 'error', text: 'You are signed out. Sign in again.' });
    const adm = form.admissionNumber.trim().toUpperCase();
    // Prevent repeated submissions for the same child.
    const dupe = existing.find((r) => r.status !== 'rejected' && r.pupilLastName.toLowerCase() === form.lastName.trim().toLowerCase() && r.pupilFirstName.toLowerCase() === form.firstName.trim().toLowerCase());
    if (dupe) return onMessage({ kind: 'error', text: 'You already have a request for this child. Wait for the head teacher\'s decision.' });
    setBusy(true);
    try {
      const pending = await getDocs(query(collection(db, 'linkRequests'), where('parentUid', '==', auth.currentUser.uid), where('status', '==', 'pending')));
      if (pending.docs.some((d) => d.data().pupilLastName?.toLowerCase() === form.lastName.trim().toLowerCase())) {
        throw new Error('You already have a pending request for this child.');
      }
      await addDoc(collection(db, 'linkRequests'), {
        parentUid: auth.currentUser.uid,
        parentEmail: auth.currentUser.email ?? '',
        pupilFirstName: form.firstName.trim(),
        pupilLastName: form.lastName.trim(),
        admissionNumber: adm,
        classHint: form.classHint.trim(),
        status: 'pending',
        duplicateWarning: null,
        createdAt: Date.now(),
        decidedBy: null,
        decidedAt: null,
        rejectionReason: null,
      });
      setForm({ firstName: '', lastName: '', admissionNumber: '', classHint: '' });
      onMessage({ kind: 'success', text: 'Request sent. The head teacher will review it.' });
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <div><label className="label" htmlFor="cf">Child's first name</label><input id="cf" className="field" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
      <div><label className="label" htmlFor="cl">Child's last name</label><input id="cl" className="field" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
      <div><label className="label" htmlFor="ca">Admission number (if known)</label><input id="ca" className="field" value={form.admissionNumber} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} /></div>
      <div><label className="label" htmlFor="cc">Class (if known)</label><input id="cc" className="field" placeholder="e.g. Primary 3" value={form.classHint} onChange={(e) => setForm({ ...form, classHint: e.target.value })} /></div>
      <div className="sm:col-span-2"><button className="btn-primary" disabled={busy} type="submit">{busy ? 'Sending…' : 'Send request'}</button></div>
    </form>
  );
}
