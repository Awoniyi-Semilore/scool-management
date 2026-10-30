import { useEffect, useState } from 'react';
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import { formatNaira, sumKobo } from '../../lib/money';
import { pupilTotals } from '../../lib/ledger';
import type { Charge, ConfirmedPayment, Pupil, Receipt, SchoolClass, Term, PaymentSubmission } from '../../types';

export default function ReceiptsReports() {
  const [payments, setPayments] = useState<ConfirmedPayment[] | null>(null);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [pending, setPending] = useState<PaymentSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'payments'), (s) => setPayments(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ConfirmedPayment)), fail),
      onSnapshot(collection(db, 'receipts'), (s) => setReceipts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Receipt)), fail),
      onSnapshot(collection(db, 'charges'), (s) => setCharges(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Charge)), fail),
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
      onSnapshot(collection(db, 'terms'), (s) => setTerms(s.docs.map((d) => d.data() as Term)), fail),
      onSnapshot(collection(db, 'paymentSubmissions'), (s) => setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentSubmission).filter((x) => x.status === 'pending')), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!firebaseConfigured) return <Notice kind="error">The portal is not ready yet. Contact the school administrator for help.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;
  const loading = !payments || !receipts || !charges || !pupils || !classes || !terms || !pending;

  // Confirmed collections only. Pending submissions are shown separately and never added here.
  const confirmedTotal = sumKobo((payments ?? []).map((p) => p.amount));
  const pendingTotal = sumKobo((pending ?? []).map((p) => p.amount));

  const byTerm = (terms ?? []).map((t) => {
    const amt = sumKobo((payments ?? []).flatMap((p) => p.allocations).filter((a) => a.termId === t.id).map((a) => a.amount));
    return { term: t, amount: amt };
  });

  const outstandingByClass = (classes ?? []).map((c) => {
    const pupilIds = (pupils ?? []).filter((p) => p.classId === c.id);
    const total = sumKobo(pupilIds.map((p) => {
      const mine = (charges ?? []).filter((x) => x.pupilId === p.id);
      const allocs = (payments ?? []).flatMap((x) => x.allocations).filter((a) => a.pupilId === p.id);
      return pupilTotals(mine, allocs, []).outstanding;
    }));
    return { cls: c, outstanding: total, pupilCount: pupilIds.length };
  });

  function exportCsv(filename: string, rows: (string | number)[][]) {
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Receipts and reports" subtitle="Collection totals include confirmed payments only. Pending transfers are shown separately." />
      {loading ? <Loading text="Preparing reports…" /> : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card"><p className="text-sm text-inkMuted">Confirmed collections (all time)</p><p className="text-2xl font-bold">{formatNaira(confirmedTotal)}</p></div>
            <div className="card border-t-4 border-marigold-500"><p className="text-sm text-inkMuted">Pending transfers (not counted)</p><p className="text-2xl font-bold">{formatNaira(pendingTotal)}</p></div>
            <div className="card"><p className="text-sm text-inkMuted">Receipts issued</p><p className="text-2xl font-bold">{receipts!.length}</p></div>
          </div>

          <section className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Collections by term</h2>
              <button className="btn-secondary" onClick={() => exportCsv('collections-by-term.csv', [['Term ID', 'Term', 'Confirmed amount (NGN)'], ...byTerm.map((x) => [x.term.id, x.term.name, (x.amount / 100).toFixed(2)])])}>Download CSV</button>
            </div>
            <div className="table-wrap"><table className="table w-full"><thead><tr><th>Term</th><th className="text-right">Confirmed</th></tr></thead><tbody>
              {byTerm.map((x) => <tr key={x.term.id}><td>{x.term.id}</td><td className="text-right">{formatNaira(x.amount)}</td></tr>)}
            </tbody></table></div>
          </section>

          <section className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Outstanding by class</h2>
              <button className="btn-secondary" onClick={() => exportCsv('outstanding-by-class.csv', [['Class', 'Pupils', 'Outstanding (NGN)'], ...outstandingByClass.map((x) => [x.cls.name, x.pupilCount, (x.outstanding / 100).toFixed(2)])])}>Download CSV</button>
            </div>
            {outstandingByClass.length === 0 ? <Empty title="No classes yet" /> : (
              <div className="table-wrap"><table className="table w-full"><thead><tr><th>Class</th><th className="text-right">Pupils</th><th className="text-right">Outstanding</th></tr></thead><tbody>
                {outstandingByClass.map((x) => <tr key={x.cls.id}><td>{x.cls.name}</td><td className="text-right">{x.pupilCount}</td><td className="text-right">{formatNaira(x.outstanding)}</td></tr>)}
              </tbody></table></div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="mb-2 text-lg font-semibold">Receipt register</h2>
            {receipts!.length === 0 ? <Empty title="No receipts yet" hint="A receipt is issued after each payment is confirmed." /> : (
              <div className="table-wrap"><table className="table w-full"><thead><tr><th>Receipt no.</th><th className="text-right">Amount</th><th>Issued</th><th>Status</th></tr></thead><tbody>
                {[...receipts!].sort((a, b) => b.issuedAt - a.issuedAt).map((r) => (
                  <tr key={r.id}><td className="font-mono text-xs">{r.id}</td><td className="text-right">{formatNaira(r.amount)}</td><td>{new Date(r.issuedAt).toLocaleString('en-NG')}</td><td>{r.voided ? 'Voided' : 'Valid'}</td></tr>
                ))}
              </tbody></table></div>
            )}
          </section>
        </>
      )}
    </>
  );
}
