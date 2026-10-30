import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty, StatusBadge } from '../../components/ui';
import { formatNaira, sumKobo } from '../../lib/money';
import { confirmPayment, rejectSubmission } from '../../services/data';
import type { PaymentSubmission, Pupil } from '../../types';

export default function VerifyPayments() {
  const [subs, setSubs] = useState<PaymentSubmission[] | null>(null);
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'paymentSubmissions'), where('status', '==', 'pending')), (s) => setSubs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentSubmission)), fail),
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!firebaseConfigured) return <Notice kind="error">The portal is not ready yet. Contact the school administrator for help.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;

  const nameOf = (id: string) => {
    const p = pupils.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName} (${p.admissionNumber})` : 'Unknown pupil';
  };

  async function approve(s: PaymentSubmission) {
    if (!window.confirm(`Confirm ${formatNaira(s.amount)} from ${s.payerName}? This records the payment and issues a receipt.`)) return;
    setBusyId(s.id);
    setMessage(null);
    try {
      const allowed = new Set(s.allocations.map((a) => a.pupilId));
      await confirmPayment({
        submission: s,
        payerName: s.payerName,
        payerUid: s.parentUid,
        amount: s.amount,
        paymentDate: s.transferDate,
        bankReference: s.bankReference,
        allocations: s.allocations,
        allowedPupilIds: allowed,
        advanceKobo: s.advanceKobo ?? 0,
        advancePupilId: s.advancePupilId ?? null,
      });
      setMessage({ kind: 'success', text: `Confirmed ${formatNaira(s.amount)}. Receipt issued.` });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(s: PaymentSubmission) {
    setBusyId(s.id);
    try {
      await rejectSubmission(s.id, reason);
      setMessage({ kind: 'success', text: 'Submission rejected. The parent can see the reason and resubmit.' });
      setRejecting(null);
      setReason('');
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Review payments" subtitle="Compare each submitted transfer with the school’s bank records before confirming it." />
      {message && <div className="mb-4"><Notice kind={message.kind}>{message.text}</Notice></div>}
      {subs === null ? <Loading /> : subs.length === 0 ? (
        <Empty title="No payments to review" hint="Parent-submitted transfers will appear here." />
      ) : (
        <div className="space-y-4">
          {subs.map((s) => (
            <div key={s.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{formatNaira(s.amount)} from {s.payerName}</p>
                  <p className="text-sm text-inkMuted">Transfer date {s.transferDate} · Reference {s.bankReference || 'not given'}</p>
                  <p className="text-xs text-inkMuted">Submitted {new Date(s.createdAt).toLocaleString('en-NG')}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>

              {s.duplicateWarning && (
                <div className="mt-3"><Notice kind="info">This transfer may be a duplicate: {s.duplicateWarning}. Check the bank record before confirming it.</Notice></div>
              )}

              <div className="mt-4 table-wrap">
                <table className="table w-full">
                  <thead><tr><th>Pupil</th><th>Term</th><th>Fee</th><th className="text-right">Allocated</th></tr></thead>
                  <tbody>
                    {s.allocations.map((a, i) => (
                      <tr key={i}>
                        <td>{nameOf(a.pupilId)}</td><td>{a.termId}</td><td className="capitalize">{a.category}</td>
                        <td className="text-right">{formatNaira(a.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} className="font-semibold">Total allocated</td>
                      <td className="text-right font-semibold">{formatNaira(sumKobo(s.allocations.map((a) => a.amount)))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {rejecting === s.id ? (
                <div className="mt-4 space-y-2">
                  <label className="label" htmlFor={`reason-${s.id}`}>Reason for rejecting this payment (the parent will see this)</label>
                  <textarea id={`reason-${s.id}`} className="field" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn-danger" disabled={busyId === s.id || !reason.trim()} onClick={() => reject(s)}>Reject payment</button>
                    <button className="btn-secondary" onClick={() => { setRejecting(null); setReason(''); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={busyId === s.id} onClick={() => approve(s)}>{busyId === s.id ? 'Working…' : 'Confirm payment'}</button>
                  <button className="btn-secondary" disabled={busyId === s.id} onClick={() => setRejecting(s.id)}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
