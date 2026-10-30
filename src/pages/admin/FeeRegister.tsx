import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice } from '../../components/ui';
import { formatNaira, parseNairaToKobo, type Kobo } from '../../lib/money';
import { computeChargeBalances, pupilTotals } from '../../lib/ledger';
import { OUTSTANDING_FEE } from '../../lib/feeNames';
import { addCharge, confirmPayment, reversePayment, saveClassFees, setFeeAmount } from '../../services/data';
import type { AcademicSession, Allocation, Charge, ClassFeeSet, ConfirmedPayment, Pupil, SchoolClass, Term } from '../../types';

type Msg = { kind: 'success' | 'error'; text: string } | null;

/** One child's figures for the chosen term, built from the shared ledger rules. */
interface Summary {
  pupil: Pupil;
  charges: Charge[];
  balances: ReturnType<typeof computeChargeBalances>;
  payable: Kobo;
  paid: Kobo;
  balance: Kobo;
  byName: Map<string, { standard: Kobo; toPay: Kobo; paid: Kobo; balance: Kobo }>;
}

function summarise(p: Pupil, termCharges: Charge[], allAllocations: Allocation[]): Summary {
  const charges = termCharges.filter((c) => c.pupilId === p.id);
  const ids = new Set(charges.map((c) => c.id));
  const allocs = allAllocations.filter((a) => ids.has(a.chargeId));
  const balances = computeChargeBalances(charges, allocs, []);
  const totals = pupilTotals(charges, allocs, []);
  const byName = new Map<string, { standard: Kobo; toPay: Kobo; paid: Kobo; balance: Kobo }>();
  const byId = new Map(charges.map((c) => [c.id, c]));
  for (const b of balances) {
    const c = byId.get(b.chargeId);
    if (!c || c.kind === 'discount') continue;
    const row = byName.get(c.category) ?? { standard: 0, toPay: 0, paid: 0, balance: 0 };
    row.standard += c.amount;
    row.toPay += b.gross;
    row.paid += b.paid;
    row.balance += b.outstanding;
    byName.set(c.category, row);
  }
  return { pupil: p, charges, balances, payable: totals.amountPayable, paid: totals.confirmedPaid, balance: totals.outstanding, byName };
}

function cellText(s: Summary, name: string): string {
  const row = s.byName.get(name);
  if (!row) return '–';
  if (row.toPay === 0) return 'Not charged';
  return formatNaira(row.toPay);
}

const fullName = (p: Pupil) => `${p.lastName} ${p.firstName}`;

export default function FeeRegister() {
  const [sessions, setSessions] = useState<AcademicSession[] | null>(null);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<ConfirmedPayment[] | null>(null);
  const [classFees, setClassFees] = useState<ClassFeeSet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<Msg>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'sessions'), (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AcademicSession)), fail),
      onSnapshot(collection(db, 'terms'), (s) => setTerms(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Term)), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
      onSnapshot(collection(db, 'charges'), (s) => setCharges(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Charge)), fail),
      onSnapshot(collection(db, 'payments'), (s) => setPayments(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ConfirmedPayment)), fail),
      onSnapshot(collection(db, 'classFees'), (s) => setClassFees(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ClassFeeSet)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Start on the active session, active term, and the first class.
  useEffect(() => {
    if (!sessions || !terms) return;
    if (!sessionId) {
      const s = sessions.find((x) => x.active) ?? sessions[0];
      if (s) setSessionId(s.id);
    }
    if (!termId) {
      const t = terms.find((x) => x.active) ?? terms[0];
      if (t) setTermId(t.id);
    }
  }, [sessions, terms, sessionId, termId]);

  useEffect(() => {
    if (!classId && classes && classes.length) {
      setClassId([...classes].sort((a, b) => a.name.localeCompare(b.name))[0].id);
    }
  }, [classes, classId]);

  const termsForSession = useMemo(
    () => (terms ?? []).filter((t) => t.sessionId === sessionId).sort((a, b) => a.ordinal - b.ordinal),
    [terms, sessionId],
  );
  const classList = useMemo(() => [...(classes ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [classes]);
  const classPupils = useMemo(
    () => (pupils ?? []).filter((p) => p.classId === classId).sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [pupils, classId],
  );
  const termCharges = useMemo(
    () => (charges ?? []).filter((c) => c.sessionId === sessionId && c.termId === termId),
    [charges, sessionId, termId],
  );
  const allAllocations = useMemo(() => (payments ?? []).flatMap((p) => p.allocations ?? []), [payments]);
  const classFee = classFees.find((f) => f.id === `${classId}_${termId}`) ?? null;

  const summaries = useMemo(
    () => classPupils.map((p) => summarise(p, termCharges, allAllocations)),
    [classPupils, termCharges, allAllocations],
  );
  const visible = summaries.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || fullName(s.pupil).toLowerCase().includes(q) || s.pupil.admissionNumber.toLowerCase().includes(q);
  });

  // Fee columns: the class's standard fees first, then any other fee found on these pupils.
  const feeNames = useMemo(() => {
    const names: string[] = [];
    const add = (n: string) => { if (n && n !== OUTSTANDING_FEE && !names.includes(n)) names.push(n); };
    classFee?.items.forEach((i) => add(i.name));
    const ids = new Set(classPupils.map((p) => p.id));
    termCharges.filter((c) => ids.has(c.pupilId) && c.kind !== 'discount').forEach((c) => add(c.category));
    return names;
  }, [classFee, classPupils, termCharges]);

  const selected = summaries.find((s) => s.pupil.id === selectedId) ?? null;
  const history = useMemo(
    () => selected ? (payments ?? []).filter((p) => (p.allocations ?? []).some((a) => a.pupilId === selected.pupil.id)) : [],
    [payments, selected],
  );

  const totals = summaries.reduce(
    (t, s) => ({ payable: t.payable + s.payable, paid: t.paid + s.paid, balance: t.balance + s.balance }),
    { payable: 0, paid: 0, balance: 0 },
  );

  if (!firebaseConfigured) return <Notice kind="error">The portal is not ready yet. Contact the school administrator for help.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!sessions || !terms || !classes || !pupils || !charges || !payments) return <Loading />;

  const sessionLabel = sessions.find((s) => s.id === sessionId)?.label ?? '';
  const termLabel = termsForSession.find((t) => t.id === termId)?.name ?? '';
  const className = classes.find((c) => c.id === classId)?.name ?? '';

  return (
    <div className="space-y-5">
      <PageHeader title="Fee register" subtitle="Review each pupil’s fees and balances. Select a class and term to get started." />

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div className="card grid gap-3 sm:grid-cols-4">
        <div><label className="label" htmlFor="reg-session">Session</label>
          <select id="reg-session" className="field" value={sessionId} onChange={(e) => { setSessionId(e.target.value); setTermId(''); setSelectedId(null); }}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.active ? ' (current)' : ''}</option>)}
          </select></div>
        <div><label className="label" htmlFor="reg-term">Term</label>
          <select id="reg-term" className="field" value={termId} onChange={(e) => { setTermId(e.target.value); setSelectedId(null); }}>
            {termsForSession.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? ' (current)' : ''}</option>)}
          </select></div>
        <div><label className="label" htmlFor="reg-class">Class</label>
          <select id="reg-class" className="field" value={classId} onChange={(e) => { setClassId(e.target.value); setSelectedId(null); }}>
            {classList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="reg-search">Find a pupil</label>
          <input id="reg-search" className="field" placeholder="Enter a name or admission number" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>

      {classes.length === 0 &&       <Notice kind="info">Add a class on the Pupils or Classes page before using the fee register.</Notice>}
      {classId && termId && (
        <ClassFeeEditor
          key={`${classId}_${termId}`}
          classId={classId} className={className} sessionId={sessionId} termId={termId} termLabel={termLabel}
          saved={classFee?.items ?? []} termCharges={termCharges} classPupilIds={new Set(classPupils.map((p) => p.id))}
          onMessage={setMessage}
        />
      )}

      {!termId ? (
        <Notice kind="info">Create an academic session and term in Settings before using the fee register.</Notice>
      ) : classPupils.length === 0 ? (
        <div className="card text-sm text-inkMuted">There are no pupils in {className} yet. Add pupils on the Pupils page.</div>
      ) : (
        <div className="card p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="font-semibold">{className} · {termLabel} · {sessionLabel}</h2>
            <p className="text-sm text-inkMuted">Select a pupil to review their fees, record a payment or update their balance.</p>
          </div>
          <div className="table-wrap">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>Child</th>
                  <th>{OUTSTANDING_FEE}</th>
                  {feeNames.map((n) => <th key={n}>{n}</th>)}
                  <th>Total to pay</th>
                  <th>Paid so far</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.pupil.id} className={s.pupil.id === selectedId ? 'bg-brand-50' : ''}>
                    <td>
                      <button type="button" className="text-left font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900" onClick={() => setSelectedId(s.pupil.id)}>
                        {fullName(s.pupil)}
                      </button>
                      <div className="text-xs text-inkMuted">{s.pupil.admissionNumber}</div>
                    </td>
                    <td>{cellText(s, OUTSTANDING_FEE)}</td>
                    {feeNames.map((n) => <td key={n}>{cellText(s, n)}</td>)}
                    <td>{formatNaira(s.payable)}</td>
                    <td>{formatNaira(s.paid)}</td>
                    <td className="font-semibold">{s.balance === 0 ? <span className="text-brand-900">Paid in full</span> : formatNaira(s.balance)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-semibold">
                  <td>Total ({visible.length} child{visible.length === 1 ? '' : 'ren'})</td>
                  <td colSpan={feeNames.length + 1} />
                  <td>{formatNaira(totals.payable)}</td>
                  <td>{formatNaira(totals.paid)}</td>
                  <td>{formatNaira(totals.balance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <PupilPanel
          key={selected.pupil.id}
          s={selected}
          sessionId={sessionId}
          termId={termId}
          feeNames={feeNames}
          termLabel={termLabel}
          history={history}
          onMessage={setMessage}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/* ---------- one child: fees, changes, payments ---------- */

function PupilPanel({ s, sessionId, termId, feeNames, termLabel, history, onMessage, onClose }: {
  s: Summary; sessionId: string; termId: string; feeNames: string[]; termLabel: string; history: ConfirmedPayment[];
  onMessage: (m: Msg) => void; onClose: () => void;
}) {
  const p = s.pupil;
  const [changing, setChanging] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [addName, setAddName] = useState('');
  const [addText, setAddText] = useState('');
  const [addReason, setAddReason] = useState('');
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<ConfirmedPayment | null>(null);
  const [correctReason, setCorrectReason] = useState('');
  const correctedIds = new Set(history.map((h) => h.reversesPaymentId).filter(Boolean) as string[]);

  async function confirmCorrection() {
    if (!correcting) return;
    if (correctReason.trim().length < 5) return onMessage({ kind: 'error', text: 'Write the reason for the correction (at least a few words).' });
    if (!window.confirm(`Correct the payment of ${formatNaira(correcting.amount)} from ${correcting.payerName}?\n\nThe old payment stays in the history. A correction cancels it, so the amount owed goes back up.`)) return;
    if (!window.confirm('Please confirm once more. After this, record the correct payment with the form below.')) return;
    setBusy(true);
    try {
      await reversePayment(correcting.id, correctReason);
      onMessage({ kind: 'success', text: 'Corrected. Now record the correct payment below.' });
      setCorrecting(null); setCorrectReason(''); setPaying(true);
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  const lines = [...s.byName.entries()];

  async function saveChange(name: string) {
    const row = s.byName.get(name);
    if (!row) return;
    const newAmount = parseNairaToKobo(newText);
    if (newAmount === null) return onMessage({ kind: 'error', text: 'Enter the new amount in naira, e.g. 35,000. Enter 0 for not charged.' });
    if (newAmount === row.toPay) return onMessage({ kind: 'error', text: 'That is already the amount being paid.' });
    const word = newAmount === 0 ? 'NOT CHARGED' : `${formatNaira(newAmount)}`;
    if (!window.confirm(`Change ${fullName(p)}'s ${name} for ${termLabel} from ${formatNaira(row.toPay)} to ${word}?\n\nThis is recorded in the history. Nothing is deleted.`)) return;
    setBusy(true);
    try {
      await setFeeAmount({ pupilId: p.id, sessionId, termId, category: name, currentDue: row.toPay, newAmount, reason: changeReason || null });
      setChanging(null); setNewText(''); setChangeReason('');
      onMessage({ kind: 'success', text: `${name} updated for ${fullName(p)}.` });
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  async function addFee(e: FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    const amount = parseNairaToKobo(addText);
    if (!name) return onMessage({ kind: 'error', text: 'Type the name of the fee, e.g. Books.' });
    if (amount === null || amount <= 0) return onMessage({ kind: 'error', text: 'Enter the amount in naira, e.g. 15,000.' });
    if (!window.confirm(`Add ${name} of ${formatNaira(amount)} for ${fullName(p)} in ${termLabel}?`)) return;
    setBusy(true);
    try {
      await addCharge({ pupilId: p.id, sessionId, termId, category: name, kind: 'fee', amount, description: name, reason: addReason.trim() || null });
      setAddName(''); setAddText(''); setAddReason('');
      onMessage({ kind: 'success', text: `${name} added for ${fullName(p)}.` });
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <section className="card space-y-5" aria-label={`Fees for ${fullName(p)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{fullName(p)}</h2>
          <p className="text-sm text-inkMuted">Admission no. {p.admissionNumber} · {termLabel}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
      </div>

      <div className="table-wrap">
        <table className="table w-full text-sm">
          <thead>
            <tr><th>Fee</th><th>Standard</th><th>Discount</th><th>To pay</th><th>Paid so far</th><th>Balance</th><th></th></tr>
          </thead>
          <tbody>
            {lines.map(([name, row]) => (
              <tr key={name}>
                <td className="font-medium">{name}</td>
                <td>{formatNaira(row.standard)}</td>
                <td>{row.standard - row.toPay > 0 ? formatNaira(row.standard - row.toPay) : '–'}</td>
                <td>{row.toPay === 0 ? 'Not charged' : formatNaira(row.toPay)}</td>
                <td>{formatNaira(row.paid)}</td>
                <td>{row.balance === 0 ? 'Paid' : formatNaira(row.balance)}</td>
                <td>
                  <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => { setChanging(name); setNewText(''); setChangeReason(''); }}>
                    Change amount
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-line font-semibold">
              <td>Total</td><td /><td /><td>{formatNaira(s.payable)}</td><td>{formatNaira(s.paid)}</td><td>{formatNaira(s.balance)}</td><td />
            </tr>
          </tbody>
        </table>
      </div>

      {changing && (
        <form className="rounded-xl border border-line p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); saveChange(changing); }}>
          <h3 className="font-semibold">Change {changing} for {fullName(p)}</h3>
          <p className="text-sm text-inkMuted">Currently {formatNaira(s.byName.get(changing)?.toPay ?? 0)}. Enter 0 to mark it not charged.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="new-amt">New amount to pay (₦)</label>
              <input id="new-amt" inputMode="decimal" className="field" value={newText} onChange={(e) => setNewText(e.target.value)} /></div>
            <div><label className="label" htmlFor="chg-reason">Reason (optional)</label>
              <input id="chg-reason" className="field" placeholder="e.g. second child discount" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save change'}</button>
            <button type="button" className="btn-secondary" onClick={() => setChanging(null)}>Cancel</button>
          </div>
        </form>
      )}

      <form className="rounded-xl border border-line p-4 space-y-3" onSubmit={addFee}>
        <h3 className="font-semibold">Add a fee for this child</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="add-name">Fee name</label>
            <input id="add-name" list="fee-names" className="field" placeholder="e.g. Books" value={addName} onChange={(e) => setAddName(e.target.value)} />
            <datalist id="fee-names">{feeNames.map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label className="label" htmlFor="add-amt">Amount (₦)</label>
            <input id="add-amt" inputMode="decimal" className="field" value={addText} onChange={(e) => setAddText(e.target.value)} /></div>
          <div><label className="label" htmlFor="add-reason">Reason (optional)</label>
            <input id="add-reason" className="field" value={addReason} onChange={(e) => setAddReason(e.target.value)} /></div>
        </div>
        <button type="submit" className="btn-secondary" disabled={busy}>Add fee</button>
      </form>

      <RecordPayment s={s} termLabel={termLabel} open={paying} setOpen={setPaying} onMessage={onMessage} />

      {correcting && (
        <div className="rounded-xl border border-line p-4 space-y-3">
          <h3 className="font-semibold">Correct this payment</h3>
          <p className="text-sm text-inkMuted">{formatNaira(correcting.amount)} from {correcting.payerName} on {correcting.paymentDate}. The old payment stays in the history, and the correction is recorded next to it.</p>
          <div>
            <label className="label" htmlFor="corr-reason">Reason for the correction</label>
            <input id="corr-reason" className="field" placeholder="e.g. Wrong child selected" value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={confirmCorrection}>{busy ? 'Correcting…' : 'Correct payment'}</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setCorrecting(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 font-semibold">Payments so far</h3>
        {history.length === 0 ? (
          <p className="text-sm text-inkMuted">No payments recorded for this child in any term yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table w-full text-sm">
              <thead><tr><th>Date</th><th>Paid by</th><th>Amount</th><th>Reference</th><th>Receipt</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {history.map((h) => {
                  const isCorrection = h.kind === 'reversal';
                  const corrected = correctedIds.has(h.id);
                  return (
                    <tr key={h.id}>
                      <td>{h.paymentDate}</td><td>{h.payerName}</td>
                      <td className="tabular-nums">{formatNaira(h.amount)}</td>
                      <td>{h.bankReference}</td>
                      <td>{h.receiptNumber ?? '–'}</td>
                      <td>
                        {isCorrection ? <span className="tag t-warn">Correction</span>
                          : corrected ? <span className="tag t-bad">Corrected</span>
                          : <span className="tag t-good">Confirmed</span>}
                        {isCorrection && h.reversalReason && <p className="text-xs text-inkMuted">Reason: {h.reversalReason}</p>}
                      </td>
                      <td>
                        {!isCorrection && !corrected && (
                          <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => { setCorrecting(h); setCorrectReason(''); }}>Correct</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- record a payment, split across this child's fees ---------- */

function RecordPayment({ s, termLabel, open, setOpen, onMessage }: {
  s: Summary; termLabel: string; open: boolean; setOpen: (v: boolean) => void; onMessage: (m: Msg) => void;
}) {
  const p = s.pupil;
  const rows = s.balances
    .map((b) => ({ b, c: s.charges.find((x) => x.id === b.chargeId)! }))
    .filter(({ b, c }) => c && c.kind !== 'discount' && b.outstanding > 0);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState('');
  const [reference, setReference] = useState('');
  const [split, setSplit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const amount = parseNairaToKobo(amountText) ?? 0;
  const allocated = rows.reduce((t, { b }) => t + (parseNairaToKobo(split[b.chargeId] ?? '') ?? 0), 0);

  function fillInOrder() {
    let left = amount;
    const next: Record<string, string> = {};
    for (const { b } of rows) {
      const take = Math.min(left, b.outstanding);
      next[b.chargeId] = take > 0 ? (take / 100).toString() : '';
      left -= take;
    }
    setSplit(next);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (amount <= 0) return onMessage({ kind: 'error', text: 'Enter the amount paid.' });
    if (!paidBy.trim()) return onMessage({ kind: 'error', text: 'Enter who paid.' });
    const allocations: Allocation[] = [];
    for (const { b, c } of rows) {
      const v = parseNairaToKobo(split[b.chargeId] ?? '') ?? 0;
      if (v < 0) return onMessage({ kind: 'error', text: 'Amounts cannot be negative.' });
      if (v > b.outstanding) return onMessage({ kind: 'error', text: `${c.category} can take at most ${formatNaira(b.outstanding)}.` });
      if (v > 0) allocations.push({ pupilId: p.id, sessionId: c.sessionId, termId: c.termId, category: c.category, chargeId: c.id, amount: v });
    }
    if (allocations.reduce((t, a) => t + a.amount, 0) !== amount) {
      return onMessage({ kind: 'error', text: `The fees add up to ${formatNaira(allocated)}, but the payment is ${formatNaira(amount)}. They must match exactly.` });
    }
    if (!window.confirm(`Record ${formatNaira(amount)} paid by ${paidBy.trim()} for ${fullName(p)}?\n\nOnce saved, a payment cannot be edited.`)) return;
    setBusy(true);
    try {
      await confirmPayment({
        submission: null, payerName: paidBy.trim(), payerUid: '', amount, paymentDate: date,
        bankReference: reference.trim() || 'Recorded by school', allocations, allowedPupilIds: new Set([p.id]),
      });
      setAmountText(''); setPaidBy(''); setReference(''); setSplit({}); setOpen(false);
      onMessage({ kind: 'success', text: `Payment of ${formatNaira(amount)} recorded. Receipt issued.` });
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)} disabled={rows.length === 0}>Record a payment</button>
        {rows.length === 0 && <p className="mt-2 text-sm text-inkMuted">Nothing is owed for this child in {termLabel}.</p>}
      </div>
    );
  }

  const matches = amount > 0 && allocated === amount;
  return (
    <form className="rounded-xl border border-line p-4 space-y-4" onSubmit={save}>
      <h3 className="font-semibold">Record a payment</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="label" htmlFor="pay-amt">Amount paid (₦)</label>
          <input id="pay-amt" inputMode="decimal" className="field" value={amountText} onChange={(e) => setAmountText(e.target.value)} /></div>
        <div><label className="label" htmlFor="pay-date">Date paid</label>
          <input id="pay-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="pay-by">Paid by</label>
          <input id="pay-by" className="field" placeholder="Parent's name" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} /></div>
        <div><label className="label" htmlFor="pay-ref">Bank reference (optional)</label>
          <input id="pay-ref" className="field" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={fillInOrder} disabled={amount <= 0}>Fill in order</button>
        <span className={`text-sm font-medium ${matches ? 'text-brand-900' : 'text-inkMuted'}`}>
          {matches ? 'Fees add up to the amount paid.' : `Allocated ${formatNaira(allocated)} of ${formatNaira(amount)}.`}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table w-full text-sm">
          <thead><tr><th>Fee</th><th>Still owed</th><th>Amount from this payment (₦)</th></tr></thead>
          <tbody>
            {rows.map(({ b, c }) => (
              <tr key={b.chargeId}>
                <td>{c.category}</td>
                <td>{formatNaira(b.outstanding)}</td>
                <td>
                  <input aria-label={`Amount for ${c.category}`} inputMode="decimal" className="field max-w-40" value={split[b.chargeId] ?? ''}
                    onChange={(e) => setSplit({ ...split, [b.chargeId]: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy || !matches}>{busy ? 'Saving…' : 'Save payment and issue receipt'}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

/* ---------- standard fees for the class in this term ---------- */

function ClassFeeEditor({ classId, className, sessionId, termId, termLabel, saved, termCharges, classPupilIds, onMessage }: {
  classId: string; className: string; sessionId: string; termId: string; termLabel: string;
  saved: { name: string; amount: Kobo }[]; termCharges: Charge[]; classPupilIds: Set<string>;
  onMessage: (m: Msg) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ name: string; text: string; original: string | null }[]>(
    () => saved.map((i) => ({ name: i.name, text: (i.amount / 100).toString(), original: i.name })),
  );
  const [busy, setBusy] = useState(false);
  const inUse = new Set(termCharges.filter((c) => classPupilIds.has(c.pupilId)).map((c) => c.category));

  async function save() {
    const items: { name: string; amount: Kobo }[] = [];
    for (const r of rows) {
      if (!r.name.trim()) continue;
      const amount = parseNairaToKobo(r.text || '0');
      if (amount === null) return onMessage({ kind: 'error', text: `Enter a valid amount for ${r.name}.` });
      items.push({ name: r.name, amount });
    }
    if (!window.confirm(`Save the standard fees for ${className} (${termLabel})?\n\nNew children added to this class get these fees. Children already in the register are not changed. To change them, use Change amount on their row.`)) return;
    setBusy(true);
    try {
      await saveClassFees(classId, sessionId, termId, items);
      onMessage({ kind: 'success', text: `Standard fees saved for ${className}.` });
      setOpen(false);
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Standard fees for {className}</p>
          <p className="text-sm text-inkMuted">{saved.length ? saved.map((i) => `${i.name} ${formatNaira(i.amount)}`).join(' · ') : 'No fees set yet for this class in this term.'}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Edit standard fees</button>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Standard fees for {className} · {termLabel}</h2>
      <p className="text-sm text-inkMuted">Add, edit or remove standard class fees. A fee already charged to a pupil cannot be removed from this list.</p>
      {rows.map((r, i) => {
        const locked = r.original !== null && inUse.has(r.original);
        return (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
            <div><label className="label" htmlFor={`fn-${i}`}>Fee name</label>
              <input id={`fn-${i}`} className="field" value={r.name} disabled={locked} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
            <div><label className="label" htmlFor={`fa-${i}`}>Amount (₦)</label>
              <input id={`fa-${i}`} inputMode="decimal" className="field" value={r.text} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} /></div>
            <button type="button" className="btn-secondary" disabled={locked} title={locked ? 'Already charged to a child' : 'Remove this fee'}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => setRows([...rows, { name: '', text: '', original: null }])}>Add a fee</button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save standard fees'}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
