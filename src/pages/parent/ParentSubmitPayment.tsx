import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { linkedListeners } from '../../services/parentListeners';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import { formatNaira, parseNairaToKobo, sumKobo, type Kobo } from '../../lib/money';
import { validateAllocations } from '../../lib/validation';
import { availableForNewSubmission } from '../../lib/ledger';
import { submitPaymentClaim } from '../../services/data';
import type { Allocation, BankDetails, Charge, ConfirmedPayment, PaymentSubmission, Pupil } from '../../types';

type Msg = { kind: 'success' | 'error'; text: string } | null;

export default function ParentSubmitPayment() {
  const { firebaseUser } = useAuth();
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<ConfirmedPayment[] | null>(null);
  const [pending, setPending] = useState<PaymentSubmission[] | null>(null);
  const [bank, setBank] = useState<BankDetails | null | undefined>(undefined);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [advancePupil, setAdvancePupil] = useState('');
  const [advanceText, setAdvanceText] = useState('');
  const [note, setNote] = useState('');
  const [payer, setPayer] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [whatsapp, setWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseUser) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const unsubs: Unsubscribe[] = linkedListeners(firebaseUser.uid, {
      setPupils, setCharges, setPayments, fail,
    });
    unsubs.push(onSnapshot(query(collection(db, 'paymentSubmissions'), where('parentUid', '==', firebaseUser.uid)),
      (s) => setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentSubmission)), fail));
    unsubs.push(onSnapshot(doc(db, 'schoolSettings', 'bank'),
      (s) => setBank(s.exists() ? (s.data() as BankDetails) : null), fail));
    return () => unsubs.forEach((u) => u());
  }, [firebaseUser]);

  const confirmed: Allocation[] = useMemo(() => (payments ?? []).flatMap((p) => p.allocations), [payments]);
  const pendingAllocs: Allocation[] = useMemo(() => (pending ?? []).filter((p) => p.status === 'pending').flatMap((p) => p.allocations), [pending]);
  const chargesById = useMemo(() => new Map((charges ?? []).map((c) => [c.id, c])), [charges]);
  const allowedIds = useMemo(() => new Set((pupils ?? []).map((p) => p.id)), [pupils]);

  // Each fee the parent can still pay, with what is still available after confirmed and pending claims.
  const eligible = useMemo(() => {
    if (!charges || !pupils) return [];
    return charges
      .filter((c) => c.kind !== 'discount' && allowedIds.has(c.pupilId))
      .map((c) => ({ c, avail: availableForNewSubmission(c, confirmed, pendingAllocs) }))
      .filter((x) => x.avail > 0);
  }, [charges, pupils, allowedIds, confirmed, pendingAllocs]);

  const byChild = useMemo(() => {
    const m = new Map<string, typeof eligible>();
    for (const x of eligible) m.set(x.c.pupilId, [...(m.get(x.c.pupilId) ?? []), x]);
    return m;
  }, [eligible]);

  function toggle(chargeId: string, avail: Kobo, on: boolean) {
    const next = { ...picked };
    if (on) next[chargeId] = (avail / 100).toString();
    else delete next[chargeId];
    setPicked(next);
  }

  const allocations: Allocation[] = Object.entries(picked).map(([chargeId, text]) => {
    const c = chargesById.get(chargeId);
    const amount = parseNairaToKobo(text);
    if (!c || amount === null || amount <= 0) return null;
    return { pupilId: c.pupilId, sessionId: c.sessionId, termId: c.termId, category: c.category, chargeId: c.id, amount };
  }).filter((x): x is Allocation => x !== null);

  const feeTotal = sumKobo(allocations.map((a) => a.amount));
  const advance = parseNairaToKobo(advanceText) ?? 0;
  const total = feeTotal + advance;
  const badRow = Object.values(picked).some((t) => parseNairaToKobo(t) === null || (parseNairaToKobo(t) ?? 0) <= 0);

  function duplicateHint(): string | null {
    const ref = bankRef.trim().toLowerCase();
    const sameRef = ref && [...(pending ?? []), ...(payments ?? []).map((p) => ({ bankReference: p.bankReference, amount: p.amount, transferDate: p.paymentDate }))]
      .some((p) => p.bankReference.trim().toLowerCase() === ref);
    if (sameRef) return 'A payment with this reference already exists. The school will check it before counting it.';
    const sameAmount = [...(pending ?? []), ...(payments ?? []).map((p) => ({ amount: p.amount, transferDate: p.paymentDate }))]
      .some((p) => p.amount === total && p.transferDate === date);
    if (sameAmount) return 'An earlier payment has the same amount and date. This is only a warning.';
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const errors: string[] = [];
    if (allocations.length === 0) errors.push('Choose at least one fee to pay. Advance money must go with a fee payment.');
    if (badRow) errors.push('Each fee you ticked needs a valid amount above zero.');
    if (!payer.trim()) errors.push('Enter the name of the person who paid.');
    if (!bankRef.trim()) errors.push('Enter the bank or transaction reference from your transfer.');
    if (!date) errors.push('Enter the date you sent the money.');
    if (advanceText.trim() && parseNairaToKobo(advanceText) === null) errors.push('The advance amount must be a number, for example 10,000.');
    if (advance > 0 && !advancePupil) errors.push('Choose the child the advance is for.');
    if (!whatsapp) errors.push('Tick the box to confirm you have sent your proof of payment on WhatsApp.');
    if (total <= 0) errors.push('The total must be more than zero.');
    if (allocations.length) {
      const v = validateAllocations({ paymentAmount: feeTotal, allocations, chargesById, confirmed, pending: pendingAllocs, allowedPupilIds: allowedIds });
      if (!v.ok) errors.push(...v.errors);
    }
    if (errors.length) { setMsg({ kind: 'error', text: errors.join(' ') }); return; }
    if (!window.confirm(`Send this payment of ${formatNaira(total)} to the school for checking? Your balance does not change until the school confirms it.`)) return;

    setBusy(true);
    try {
      await submitPaymentClaim({
        payerName: payer, amount: total, transferDate: date, bankReference: bankRef, allocations,
        evidencePath: null, duplicateWarning: duplicateHint(), advanceKobo: advance, advancePupilId: advance > 0 ? advancePupil : null, note: note || null,
      });
      setPicked({}); setAdvanceText(''); setNote(''); setPayer(''); setBankRef(''); setWhatsapp(false);
      setMsg({ kind: 'success', text: 'Sent. The school will check the transfer and confirm it. Your balance will change only after that.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  if (pupils === null || charges === null || payments === null || pending === null) return <Loading />;

  const nameOf = (id: string) => { const p = pupils.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'Child'; };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Make a payment" title="Pay for one or more children" subtitle="Choose exactly which fees your transfer covers, check the school bank details, then submit the transfer reference. Your balance changes only after the Head Teacher confirms the money arrived." />
      <div className="stepper">
        <div className={`s ${allocations.length ? 'done' : 'on'}`}><b>{allocations.length ? '✓' : '1'}</b>Choose fees</div>
        <div className={`ln ${allocations.length ? 'done' : ''}`} />
        <div className={`s ${allocations.length ? 'on' : ''}`}><b>2</b>Send transfer</div>
        <div className="ln" />
        <div className="s"><b>3</b>Tell the school</div>
      </div>
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form onSubmit={submit} className="space-y-6">
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Step 1 · Choose what this payment covers</h2>\n            <p className="text-sm text-inkMuted">Select each fee you are paying. You can pay part of a fee, but enter the amount you actually intend to pay against that fee.</p>
            {byChild.size === 0 ? (
              <Empty title="Nothing owed right now" hint="Fees waiting to be paid for your children appear here." />
            ) : [...byChild.entries()].map(([pupilId, rows]) => (
              <div key={pupilId} className="rounded-xl border border-line p-4">
                <p className="mb-2 font-semibold">{nameOf(pupilId)}</p>
                <ul className="space-y-2">
                  {rows.map(({ c, avail }) => (
                    <li key={c.id} className={`ftile flex-wrap ${picked[c.id] !== undefined ? 'sel' : ''}`}>
                      <input id={`pick-${c.id}`} type="checkbox" className="h-5 w-5" checked={picked[c.id] !== undefined}
                        onChange={(e) => toggle(c.id, avail, e.target.checked)} />
                      <label htmlFor={`pick-${c.id}`} className="flex-1 text-sm">{c.category} <span className="text-inkMuted">· still owed {formatNaira(avail)}</span></label>
                      {picked[c.id] !== undefined && (
                        <input aria-label={`Amount for ${c.category}`} inputMode="decimal" className="field w-36 text-right"
                          value={picked[c.id]} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.value })} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Step 2 · Review any extra amount</h2>
            <div>
              <label className="label" htmlFor="adv">Advance payment for next term (₦, optional)</label>
              <input id="adv" inputMode="decimal" className="field" placeholder="e.g. 10,000" value={advanceText} onChange={(e) => setAdvanceText(e.target.value)} />
              <p className="mt-1 text-xs text-inkMuted">Money you pay ahead for the next term. The school applies it when the term starts. It does not change what is owed now.</p>
            </div>
            {advance > 0 && (
              <div>
                <label className="label" htmlFor="adv-pupil">The advance is for which child?</label>
                <select id="adv-pupil" className="field" value={advancePupil} onChange={(e) => setAdvancePupil(e.target.value)}>
                  <option value="">Choose a child</option>
                  {(pupils ?? []).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="note">Note for the school (optional)</label>
              <textarea id="note" rows={2} className="field" maxLength={500} placeholder="e.g. Books paid on Monday; uniform next week" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </section>

          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Step 3 · Submit your transfer details</h2>\n            <p className="text-sm text-inkMuted">After sending the bank transfer, enter the reference shown by your banking app and the date you paid. The school will verify it before issuing a receipt.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="payer">Who paid</label><input id="payer" className="field" value={payer} onChange={(e) => setPayer(e.target.value)} /></div>
              <div><label className="label" htmlFor="pdate">Date you sent it</label><input id="pdate" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="bref">Bank reference from your transfer</label><input id="bref" className="field" value={bankRef} onChange={(e) => setBankRef(e.target.value)} /></div>
            </div>
            <div className="rounded-xl border-l-4 border-brand-600 bg-brand-50 p-4">
              <p className="font-semibold">Do not forget: send your proof of payment on WhatsApp.</p>
              <p className="text-sm text-inkMuted">Send your bank receipt or screenshot to the school’s WhatsApp number.</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
                <span>I have sent my proof of payment on WhatsApp.</span>
              </label>
            </div>
          </section>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="card space-y-2">
            <h2 className="text-lg font-semibold">Your total</h2>
            {allocations.map((a) => (
              <div key={a.chargeId} className="flex justify-between text-sm"><span>{nameOf(a.pupilId)} · {a.category}</span><span className="tabular-nums">{formatNaira(a.amount)}</span></div>
            ))}
            {advance > 0 && <div className="flex justify-between text-sm"><span>Advance for next term</span><span className="tabular-nums">{formatNaira(advance)}</span></div>}
            <div className="flex justify-between border-t border-line pt-2 text-lg font-bold"><span>You send</span><span className="tabular-nums">{formatNaira(total)}</span></div>
          </section>

          <section className="card space-y-2">
            <h2 className="text-lg font-semibold">Pay into</h2>
            {bank === undefined ? <Loading /> : bank === null ? (
              <Notice kind="error">The school has not added its bank details yet. Ask the school before you transfer.</Notice>
            ) : (
              <div className="bankcard">
                <p className="lab">Pay into</p>
                <p className="mt-1 text-lg font-bold">{bank.bankName}</p>
                <p className="lab mt-3">Account number</p>
                <p className="acc">{bank.accountNumber}</p>
                <div className="flex items-end justify-between gap-3">
                  <div><p className="lab">Account name</p><p className="font-bold">{bank.accountName}</p></div>
                </div>
                <p className="mt-4">Amount: <b className="text-2xl">{formatNaira(total)}</b></p>
              </div>
            )}
            <p className="text-xs text-inkMuted">Check the account name in your banking app before you send money.</p>
          </section>

          {(pending ?? []).some((p) => p.status === 'pending') && (
            <section className="card space-y-2">
              <h2 className="text-lg font-semibold">Waiting for the school</h2>
              {(pending ?? []).filter((p) => p.status === 'pending').map((p) => (
                <p key={p.id} className="text-sm">{formatNaira(p.amount)} · {p.transferDate} · waiting to be checked</p>
              ))}
            </section>
          )}

          <button type="button" className="btn-primary w-full" disabled={busy || total <= 0} onClick={(e) => submit(e as unknown as FormEvent)}>
            {busy ? 'Sending…' : `Submit transfer for verification · ${formatNaira(total)}`}
          </button>
        </aside>
      </div>
    </div>
  );
}
