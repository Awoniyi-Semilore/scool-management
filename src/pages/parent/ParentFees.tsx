import { linkedListeners } from '../../services/parentListeners';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, auth, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import { formatNaira } from '../../lib/money';
import { pupilTotals } from '../../lib/ledger';
import type { Charge, ConfirmedPayment, ParentPupilLink, Pupil, PaymentSubmission } from '../../types';

export default function ParentFees() {
  const [links, setLinks] = useState<ParentPupilLink[] | null>(null);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<ConfirmedPayment[] | null>(null);
  const [pending, setPending] = useState<PaymentSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'parentLinks'), where('parentUid', '==', uid)), (s) => setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ParentPupilLink)), fail),
      ...linkedListeners(uid, { setPupils, setCharges, setPayments, fail }),
                  onSnapshot(query(collection(db, 'paymentSubmissions'), where('parentUid', '==', uid)), (s) => setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentSubmission).filter((x) => x.status === 'pending')), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!firebaseConfigured) return <Notice kind="error">Firebase is not configured.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;
  const loading = !links || !pupils || !charges || !payments || !pending;
  const approvedIds = new Set((links ?? []).filter((l) => l.status === 'approved').map((l) => l.pupilId));
  const myPupils = (pupils ?? []).filter((p) => approvedIds.has(p.id));

  return (
    <>
      <PageHeader title="Fees & Balances" subtitle="See what is owed for each child. A transfer only changes the official balance after the school confirms it." actions={<Link className="btn-secondary" to="/parent/submit">Make a payment</Link>} />
      {loading ? <Loading /> : myPupils.length === 0 ? (
        <Empty title="No approved children yet" hint="Once the head teacher approves a child, their fees appear here." />
      ) : myPupils.map((p) => {
        const mine = (charges ?? []).filter((c) => c.pupilId === p.id);
        const allocs = (payments ?? []).flatMap((x) => x.allocations).filter((a) => a.pupilId === p.id);
        const pendAllocs = (pending ?? []).flatMap((s) => s.allocations).filter((a) => a.pupilId === p.id);
        const t = pupilTotals(mine, allocs, []);
        const pendingAmt = pendAllocs.reduce((s, a) => s + a.amount, 0);
        return (
          <section key={p.id} className="card mb-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-bold">{p.firstName} {p.lastName} <span className="text-sm font-normal text-inkMuted">· {p.admissionNumber}</span></h2>
              <p className="font-semibold">Outstanding: {formatNaira(t.outstanding)}</p>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4 text-sm">
              <Box label="Total fees" value={formatNaira(t.totalCharges)} />
              <Box label="Discounts" value={formatNaira(t.discounts)} />
              <Box label="Paid (confirmed)" value={formatNaira(t.confirmedPaid)} />
              <Box label="Awaiting confirmation" value={formatNaira(pendingAmt)} />
            </div>
            {mine.length === 0 ? <Empty title="No fees recorded yet" /> : (
              <div className="table-wrap">
                <table className="table w-full">
                  <thead><tr><th>Term</th><th>Fee</th><th>Type</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {[...mine].sort((a, b) => a.termId.localeCompare(b.termId)).map((c) => (
                      <tr key={c.id}>
                        <td>{c.termId.replace('_', ' · term ')}</td>
                        <td>{c.description}</td>
                        <td>{c.kind === 'discount' ? 'Discount' : c.kind === 'opening_balance' ? 'Brought forward' : 'Fee'}</td>
                        <td className="text-right">{c.kind === 'discount' ? `− ${formatNaira(c.amount)}` : formatNaira(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-brand-50 p-2">
      <p className="text-xs text-inkMuted">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
