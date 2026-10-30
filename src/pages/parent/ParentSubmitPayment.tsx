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

function localDateInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ParentSubmitPayment() {
  const { firebaseUser } = useAuth();
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<ConfirmedPayment[] | null>(null);
  const [pending, setPending] = useState<PaymentSubmission[] | null>(null);
  const [bank, setBank] = useState<BankDetails | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [advancePupil, setAdvancePupil] = useState('');
  const [advanceText, setAdvanceText] = useState('');
  const [note, setNote] = useState('');
  const [payer, setPayer] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [date, setDate] = useState(localDateInputValue);
  const [whatsapp, setWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    setPupils(null);
    setCharges(null);
    setPayments(null);
    setPending(null);
    setBank(undefined);
    setLoadError(null);
    if (!firebaseConfigured || !firebaseUser) return;
    const fail = (e: Error) => setLoadError(e.message);
    const unsubs: Unsubscribe[] = linkedListeners(firebaseUser.uid, {
      setPupils, setCharges, setPayments, fail,
    });
    unsubs.push(onSnapshot(query(collection(db, 'paymentSubmissions'), where('parentUid', '==', firebaseUser.uid)),
      (s) => setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentSubmission)), fail));
    unsubs.push(onSnapshot(doc(db, 'schoolSettings', 'bank'),
      (s) => setBank(s.exists() ? (s.data() as BankDetails) : null), fail));
    return () => unsubs.forEach((u) => u());
  }, [firebaseUser, retryKey]);

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
    else if (date > localDateInputValue()) errors.push('The transfer date cannot be in the future.');
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
      setPicked({}); setAdvanceText(''); setAdvancePupil(''); setNote(''); setPayer(''); setBankRef(''); setWhatsapp(false);
      setMsg({ kind: 'success', text: 'Sent. The school will check the transfer and confirm it. Your balance will change only after that.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally { setBusy(false); }
  }

  if (!firebaseConfigured) return <Notice kind="error">The portal is not ready yet. Contact the school administrator for help.</Notice>;
  if (!firebaseUser) return <Notice kind="error">Sign in to your parent account to submit a payment.</Notice>;
  if (loadError) return (
    <div className="card space-y-4">
      <Notice kind="error">We could not load your payment information: {loadError}</Notice>
      <button type="button" className="btn-secondary" onClick={() => setRetryKey((key) => key + 1)}>Try again</button>
    </div>
  );
  if (pupils === null || charges === null || payments === null || pending === null) return <Loading text="Loading your fees and payment details…" />;

  const nameOf = (id: string) => { const p = pupils.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'Child'; };
  const duplicateWarning = duplicateHint();

  return (
    <div className="space-y-6">
      <PageHeader kicker="Make a payment" title="Pay for one or more children" subtitle="Choose the fees, transfer the total to the school account below, then submit your transfer details. The school will check the payment; your balance changes only after it is confirmed." />
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="Payment steps">
        <li className="rounded-xl border border-line bg-surface p-3"><span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">1</span><span className="font-semibold">Choose fees</span></li>
        <li className="rounded-xl border border-line bg-surface p-3"><span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-ocean-100 font-bold text-ocean-700">2</span><span className="font-semibold">Transfer the total</span></li>
        <li className="rounded-xl border border-line bg-surface p-3"><span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-marigold-100 font-bold text-marigold-900">3</span><span className="font-semibold">Submit your details</span></li>
      </ol>
      {msg && <div aria-live="polite"><Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form id="payment-form" onSubmit={submit} className="space-y-6">
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">1. Choose the fees to pay</h2>
            {byChild.size === 0 ? (
              pupils.length === 0
                ? <Empty title="No children are linked to your account" hint="Contact the school to link your child before making a payment." />
                : <Empty title="No fees are available to pay right now" hint="Any payment awaiting confirmation is listed separately. New fees will appear here when the school adds them." />
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
                        <input aria-label={`Amount for ${c.category} for ${nameOf(c.pupilId)} (maximum ${formatNaira(avail)})`} inputMode="decimal" className="field w-36 text-right"
                          value={picked[c.id]} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.value })} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Optional: add an advance payment</h2>
            <div>
              <label className="label" htmlFor="adv">Advance payment for next term (₦, optional)</label>
              <input id="adv" inputMode="decimal" className="field" placeholder="e.g. 10,000" value={advanceText} onChange={(e) => setAdvanceText(e.target.value)} />
              <p className="mt-1 text-xs text-inkMuted">An optional amount for next term. The school will apply it when that term begins; it will not reduce the fees due now.</p>
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
            <h2 className="text-lg font-semibold">2. Transfer the total to the school</h2>
            {bank === undefined ? <Loading text="Loading the school’s bank details…" /> : bank === null ? (
              <Notice kind="error">The school has not added bank details yet. Contact the school to get the correct account information before transferring.</Notice>
            ) : (
              <div className="bankcard">
                <p className="lab">Bank</p>
                <p className="mt-1 text-lg font-bold">{bank.bankName}</p>
                <p className="lab mt-3">Account number</p>
                <p className="acc break-all">{bank.accountNumber}</p>
                <p className="lab mt-3">Account name</p>
                <p className="font-bold">{bank.accountName}</p>
                <p className="mt-4 border-t border-white/20 pt-3">
                  {total > 0
                    ? <>Transfer exactly <b className="text-2xl">{formatNaira(total)}</b></>
                    : 'Choose at least one fee to see the amount to transfer.'}
                </p>
              </div>
            )}
            <p className="text-sm text-inkMuted">Check the account name and amount in your banking app. Keep your receipt or transfer screenshot so you can send it to the school.</p>
          </section>

          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">3. Submit your transfer details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="payer">Name of the person who made the transfer</label><input id="payer" autoComplete="name" required className="field" value={payer} onChange={(e) => setPayer(e.target.value)} /></div>
              <div><label className="label" htmlFor="pdate">Transfer date</label><input id="pdate" type="date" max={localDateInputValue()} required className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="bref">Bank or transaction reference</label><input id="bref" autoComplete="off" required className="field" value={bankRef} onChange={(e) => setBankRef(e.target.value)} /></div>
            </div>
            {duplicateWarning && <Notice kind="info">{duplicateWarning}</Notice>}
            <div className="rounded-xl border-l-4 border-brand-600 bg-brand-50 p-4">
              <p className="font-semibold">Send your proof of payment to the school</p>
              <p className="text-sm text-inkMuted">Send your bank receipt or transfer screenshot to the Head Teacher using the school’s WhatsApp contact. If you do not have the contact, ask the school before submitting.</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
                <span>I have sent the receipt or screenshot to the Head Teacher on WhatsApp.</span>
              </label>
            </div>
            <button type="submit" className="btn-primary w-full lg:hidden" disabled={busy || bank === undefined}>
              {busy ? 'Submitting…' : `Submit payment details · ${formatNaira(total)}`}
            </button>
          </section>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="card space-y-2" aria-live="polite">
            <h2 className="text-lg font-semibold">Payment summary</h2>
            {allocations.length === 0 && advance === 0 && <p className="text-sm text-inkMuted">Choose at least one fee to see your total.</p>}
            {allocations.map((a) => (
              <div key={a.chargeId} className="flex justify-between gap-3 text-sm"><span>{nameOf(a.pupilId)} · {chargesById.get(a.chargeId)?.description || a.category}</span><span className="shrink-0 tabular-nums">{formatNaira(a.amount)}</span></div>
            ))}
            {advance > 0 && <div className="flex justify-between text-sm"><span>Advance for next term</span><span className="tabular-nums">{formatNaira(advance)}</span></div>}
            <div className="flex justify-between border-t border-line pt-2 text-lg font-bold"><span>You send</span><span className="tabular-nums">{formatNaira(total)}</span></div>
          </section>

          {(pending ?? []).some((p) => p.status === 'pending') && (
            <section className="card space-y-2">
              <h2 className="text-lg font-semibold">Payment awaiting confirmation</h2>
              {(pending ?? []).filter((p) => p.status === 'pending').map((p) => (
                <p key={p.id} className="text-sm">{formatNaira(p.amount)} · {p.transferDate} · pending — not yet counted in your balance</p>
              ))}
            </section>
          )}

          <button type="submit" form="payment-form" className="btn-primary hidden w-full lg:inline-flex" disabled={busy || bank === undefined}>
            {busy ? 'Submitting…' : `Submit payment details · ${formatNaira(total)}`}
          </button>
        </aside>
      </div>
    </div>
  );
}
