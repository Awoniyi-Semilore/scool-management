import { linkedListeners } from '../../services/parentListeners';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, auth, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import { formatNaira } from '../../lib/money';
import { buildReceiptPdf, loadLogo } from '../../utils/receipt';
import type { ConfirmedPayment, Pupil, Receipt } from '../../types';

export default function ParentReceipts() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [payments, setPayments] = useState<ConfirmedPayment[] | null>(null);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'receipts'), where('payerUid', '==', uid)), (s) => setReceipts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Receipt)), fail),
      onSnapshot(query(collection(db, 'payments'), where('payerUid', '==', uid)), (s) => setPayments(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ConfirmedPayment)), fail),
      ...linkedListeners(uid, { setPupils, fail }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!firebaseConfigured) return <Notice kind="error">The portal is not ready yet. Contact the school administrator for help.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;

  async function download(r: Receipt) {
    const pay = payments?.find((p) => p.id === r.paymentId);
    if (!pay) return setMessage({ kind: 'error', text: 'The payment record for this receipt could not be found.' });
    setBusy(r.id);
    setMessage(null);
    try {
      const logo = await loadLogo();
      const lines = pay.allocations.map((a) => {
        const p = pupils?.find((x) => x.id === a.pupilId);
        const who = p ? `${p.firstName} ${p.lastName}` : 'Pupil';
        return { label: `${who}: ${a.category}`, amountKobo: a.amount };
      });
      const issued = new Date(r.issuedAt);
      const blob = buildReceiptPdf({
        receiptNumber: r.id,
        date: issued.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        payerName: pay.payerName,
        amountKobo: pay.amount,
        lines: pay.advanceKobo ? [...lines, { label: 'Advance payment for next term (not yet applied)', amountKobo: pay.advanceKobo }] : lines,
        outstandingKobo: null,
      }, logo);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${r.id}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setMessage({ kind: 'success', text: 'Receipt downloaded.' });
    } catch {
      setMessage({ kind: 'error', text: 'The receipt could not be generated. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Receipts" subtitle="Download receipts for payments the school has confirmed." />
      {message && <div className="mb-4"><Notice kind={message.kind}>{message.text}</Notice></div>}
      {receipts === null || payments === null ? <Loading /> : receipts.length === 0 ? (
        <Empty title="No receipts yet" hint="A receipt will be available here after the school confirms a payment." />
      ) : (
        <div className="table-wrap">
          <table className="table w-full">
            <thead><tr><th>Receipt no.</th><th>Issued</th><th className="text-right">Amount</th><th></th></tr></thead>
            <tbody>
              {[...receipts].sort((a, b) => b.issuedAt - a.issuedAt).map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.id}</td>
                  <td>{new Date(r.issuedAt).toLocaleDateString('en-NG')}</td>
                  <td className="text-right">{formatNaira(r.amount)}</td>
                  <td className="text-right"><button className="btn-secondary px-3 py-1" disabled={busy === r.id} onClick={() => download(r)}>{busy === r.id ? 'Preparing…' : 'Download PDF'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
