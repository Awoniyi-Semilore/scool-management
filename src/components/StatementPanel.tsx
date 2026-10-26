import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Notice, Empty, Loading } from './ui';
import { formatNaira, parseNairaToKobo, type Kobo } from '../lib/money';
import { buildStatement, pendingFor } from '../lib/statement';
import { availableForNewSubmission } from '../lib/ledger';
import { applyAdvance, issueStatement } from '../services/data';
import { buildStatementPdf } from '../utils/statementPdf';
import type { AdvanceCredit, Charge, ChildClaim, ChildPaymentRecord, Pupil, StatementRecord } from '../types';

type Msg = { kind: 'success' | 'error'; text: string } | null;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * One statement per child. Every linked guardian gets the same figures, because they come from the child's own records.
 * Transfers not yet confirmed are listed in their own section and are never counted in the balance.
 */
export default function StatementPanel({ pupils, charges, records, claims, advances, mode }: {
  pupils: Pupil[]; charges: Charge[]; records: ChildPaymentRecord[]; claims: ChildClaim[]; advances: AdvanceCredit[]; mode: 'admin' | 'parent';
}) {
  const { firebaseUser } = useAuth();
  const year = new Date().getFullYear();
  const [pupilId, setPupilId] = useState('');
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [saved, setSaved] = useState<StatementRecord[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<AdvanceCredit | null>(null);
  const [applyCharge, setApplyCharge] = useState('');
  const [applyText, setApplyText] = useState('');

  useEffect(() => { if (!pupilId && pupils.length) setPupilId(pupils[0].id); }, [pupils, pupilId]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseUser) return;
    const q = mode === 'admin'
      ? query(collection(db, 'statements'), where('pupilId', '==', pupilId))
      : query(collection(db, 'statements'), where('generatedBy', '==', firebaseUser.uid));
    const u: Unsubscribe = onSnapshot(q, (s) => setSaved(s.docs.map((d) => d.data() as StatementRecord)
      .filter((r) => r.pupilId === pupilId)
      .sort((a, b) => b.generatedAt - a.generatedAt)), (e) => setMsg({ kind: 'error', text: e.message }));
    return u;
  }, [pupilId, mode, firebaseUser]);

  const pupil = pupils.find((p) => p.id === pupilId) ?? null;
  const childCharges = useMemo(() => charges.filter((c) => c.pupilId === pupilId), [charges, pupilId]);
  const childRecords = useMemo(() => records.filter((r) => r.pupilId === pupilId), [records, pupilId]);
  const childAllocs = useMemo(() => childRecords.flatMap((r) => r.allocations), [childRecords]);
  const childAdvances = useMemo(() => advances.filter((a) => a.pupilId === pupilId && a.amount - a.appliedKobo > 0), [advances, pupilId]);
  const childPending = useMemo(() => pendingFor(pupilId, claims), [pupilId, claims]);

  const statement = useMemo(() => {
    if (!pupil) return null;
    try { return buildStatement({ pupilId: pupil.id, charges, records, from, to }); }
    catch (e) { return { error: (e as Error).message } as const; }
  }, [pupil, charges, records, from, to]);

  async function issue() {
    if (!pupil || !statement || 'error' in statement) return;
    if (!window.confirm(`Create the statement for ${pupil.firstName} ${pupil.lastName}, ${from} to ${to}? It gets its own number and cannot be changed afterwards.`)) return;
    setBusy(true); setMsg(null);
    try {
      const rec = await issueStatement({ pupilId: pupil.id, pupilName: `${pupil.firstName} ${pupil.lastName}`, admissionNumber: pupil.admissionNumber, from, to, statement });
      setMsg({ kind: 'success', text: `Statement ${rec.statementNo} created.` });
      download(buildStatementPdf(rec), `${rec.statementNo}.pdf`);
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  // Fees of this child that still have something owed, for applying an advance.
  const owedFees = childCharges
    .filter((c) => c.kind !== 'discount')
    .map((c) => ({ c, owed: availableForNewSubmission(c, childAllocs, []) }))
    .filter((x) => x.owed > 0);

  async function doApply() {
    if (!applying) return;
    const amount: Kobo | null = parseNairaToKobo(applyText);
    const fee = owedFees.find((x) => x.c.id === applyCharge);
    if (!fee) return setMsg({ kind: 'error', text: 'Choose the fee to apply the advance to.' });
    if (amount === null || amount <= 0) return setMsg({ kind: 'error', text: 'Enter the amount to apply.' });
    if (amount > applying.amount - applying.appliedKobo) return setMsg({ kind: 'error', text: 'That is more than the advance still held.' });
    if (amount > fee.owed) return setMsg({ kind: 'error', text: `That fee only owes ${formatNaira(fee.owed)}.` });
    if (!window.confirm(`Apply ${formatNaira(amount)} of advance money to ${fee.c.category} for ${pupil?.firstName} ${pupil?.lastName}? No new money is received, so no receipt is issued.`)) return;
    setBusy(true); setMsg(null);
    try {
      await applyAdvance({ creditId: applying.id, chargeId: fee.c.id, amount });
      setMsg({ kind: 'success', text: `Applied ${formatNaira(amount)} to ${fee.c.category}.` });
      setApplying(null); setApplyCharge(''); setApplyText('');
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (pupils.length === 0) return <Empty title="No children linked yet" hint="Statements are available once a child is linked to your account." />;

  return (
    <div className="space-y-6">
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      <section className="card grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><label className="label" htmlFor="st-pupil">Child</label>
          <select id="st-pupil" className="field" value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
            {pupils.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName} · {p.admissionNumber}</option>)}
          </select></div>
        <div><label className="label" htmlFor="st-from">From</label><input id="st-from" type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="st-to">To</label><input id="st-to" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </section>

      {!statement ? <Loading /> : 'error' in statement ? (
        <Notice kind="error">{statement.error}</Notice>
      ) : (
        <section className="card space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="card"><p className="lbl">Brought forward</p><p className="metric">{formatNaira(statement.opening)}</p></div>
            <div className="card"><p className="lbl">Owed in period</p><p className="metric">{formatNaira(statement.debits)}</p></div>
            <div className="card"><p className="lbl">Paid in period</p><p className="metric">{formatNaira(statement.credits)}</p></div>
            <div className="card"><p className="lbl">Closing balance</p><p className="metric">{formatNaira(statement.closing)}</p><p className="metric-sub">{statement.closing > 0 ? 'Still owed' : 'Paid in full'}</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-left">
                <tr><th className="px-2 py-2">Date</th><th className="px-2 py-2">Transaction ID</th><th className="px-2 py-2">Receipt</th><th className="px-2 py-2">Paid by</th><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Owed +</th><th className="px-2 py-2 text-right">Paid −</th><th className="px-2 py-2 text-right">Balance</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-line"><td className="px-2 py-2" colSpan={7}>Brought forward</td><td className="px-2 py-2 text-right tabular-nums">{formatNaira(statement.opening)}</td></tr>
                {statement.lines.map((l, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="px-2 py-2">{l.date}</td>
                    <td className="px-2 py-2 font-mono text-xs">{l.txId}</td>
                    <td className="px-2 py-2">{l.receiptNo ?? '–'}</td>
                    <td className="px-2 py-2">{l.payer ?? '–'}</td>
                    <td className="px-2 py-2">{l.description}{l.note && <p className="text-xs text-inkMuted">{l.note}</p>}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.debit ? formatNaira(l.debit) : '–'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.credit ? formatNaira(l.credit) : '–'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatNaira(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-inkMuted">Owed + means the amount owed went up. Paid − means it went down. Only confirmed payments are counted.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={issue}>{busy ? 'Creating…' : 'Create statement and download PDF'}</button>
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Not yet confirmed</h2>
        <p className="text-sm text-inkMuted">Transfers sent but not yet checked by the school. These are not counted in the balance.</p>
        {childPending.length === 0 ? <p className="text-sm text-inkMuted">Nothing waiting.</p> : (
          <ul className="divide-y divide-line">
            {childPending.map((p) => (
              <li key={p.ref + p.date} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>{p.date} · {p.payer} · ref {p.ref}</span>
                <span className="font-semibold tabular-nums">{formatNaira(p.amount)} · waiting</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Advance money held</h2>
        <p className="text-sm text-inkMuted">Paid ahead for a future term. It changes no balance until the school applies it to a fee.</p>
        {childAdvances.length === 0 ? <p className="text-sm text-inkMuted">None held.</p> : (
          <ul className="divide-y divide-line">
            {childAdvances.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{a.payerName} · held {formatNaira(a.amount - a.appliedKobo)} of {formatNaira(a.amount)}</span>
                {mode === 'admin' && (
                  <button className="btn-secondary" onClick={() => { setApplying(a); setApplyCharge(''); setApplyText(''); }}>Apply to a fee</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {applying && mode === 'admin' && (
          <div className="rounded-xl border border-line p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="ap-fee">Fee to apply it to</label>
                <select id="ap-fee" className="field" value={applyCharge} onChange={(e) => setApplyCharge(e.target.value)}>
                  <option value="">Choose a fee</option>
                  {owedFees.map((x) => <option key={x.c.id} value={x.c.id}>{x.c.termId.split('_').pop() === '1' ? 'First' : x.c.termId.split('_').pop() === '2' ? 'Second' : 'Third'} term · {x.c.category} · still owed {formatNaira(x.owed)}</option>)}
                </select></div>
              <div><label className="label" htmlFor="ap-amt">Amount to apply (₦)</label>
                <input id="ap-amt" inputMode="decimal" className="field" value={applyText} onChange={(e) => setApplyText(e.target.value)} /></div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy} onClick={doApply}>Apply advance</button>
              <button className="btn-secondary" onClick={() => setApplying(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Statements already created</h2>
        {saved === null ? <Loading /> : saved.length === 0 ? <p className="text-sm text-inkMuted">None yet for this child.</p> : (
          <ul className="divide-y divide-line">
            {saved.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="text-sm">
                  <p className="font-medium">{r.statementNo}</p>
                  <p className="text-inkMuted">{r.from} to {r.to} · closing {formatNaira(r.closing)} · by {r.generatedByName} on {new Date(r.generatedAt).toLocaleDateString('en-GB')}</p>
                </div>
                <button className="btn-secondary" onClick={() => download(buildStatementPdf(r), `${r.statementNo}.pdf`)}>Download again</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
