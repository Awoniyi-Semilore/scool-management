import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { Loading, Notice } from '../../components/ui';
import { formatNaira, sumKobo } from '../../lib/money';
import { computeChargeBalances } from '../../lib/ledger';
import { greetingNow } from '../../lib/greeting';
import { describeAction } from '../../lib/actionText';
import type { AcademicSession, AuditEvent, Charge, LinkRequest, PaymentSubmission, ConfirmedPayment, ResultSheet, Term } from '../../types';

/** Head teacher's dashboard, laid out as in the approved v3 design. */
export default function AdminOverview() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentSubmission[] | null>(null);
  const [pendingLinks, setPendingLinks] = useState<LinkRequest[] | null>(null);
  const [pendingSheets, setPendingSheets] = useState<ResultSheet[] | null>(null);
  const [payments, setPayments] = useState<ConfirmedPayment[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'terms'), (s) => setTerms(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Term)), fail),
      onSnapshot(collection(db, 'sessions'), (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AcademicSession)), fail),
      onSnapshot(query(collection(db, 'paymentSubmissions'), where('status', '==', 'pending')), (s) => setPendingPayments(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentSubmission)), fail),
      onSnapshot(query(collection(db, 'linkRequests'), where('status', '==', 'pending')), (s) => setPendingLinks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as LinkRequest)), fail),
      onSnapshot(query(collection(db, 'resultSheets'), where('status', '==', 'pending')), (s) => setPendingSheets(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ResultSheet)), fail),
      onSnapshot(collection(db, 'payments'), (s) => setPayments(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ConfirmedPayment)), fail),
      onSnapshot(collection(db, 'charges'), (s) => setCharges(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Charge)), fail),
      onSnapshot(collection(db, 'auditEvents'), (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditEvent).sort((a, b) => b.at - a.at).slice(0, 5)), () => setEvents([])),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const active = terms?.find((t) => t.active) ?? null;
  const activeSession = sessions.find((s) => s.active);

  // Figures for the current term only. Pending payments are never counted as collected.
  const termCharges = useMemo(() => (charges ?? []).filter((c) => active && c.termId === active.id), [charges, active]);
  const allAllocs = useMemo(() => (payments ?? []).flatMap((p) => p.allocations), [payments]);
  const collected = useMemo(() => sumKobo(allAllocs.filter((a) => a.termId === active?.id).map((a) => a.amount)), [allAllocs, active]);
  const outstanding = useMemo(() => {
    const ids = new Set(termCharges.map((c) => c.id));
    return computeChargeBalances(termCharges, allAllocs.filter((a) => ids.has(a.chargeId)), []).reduce((t, b) => t + b.outstanding, 0);
  }, [termCharges, allAllocs]);
  const share = collected + outstanding > 0 ? Math.round((collected / (collected + outstanding)) * 100) : 0;

  if (!firebaseConfigured) return <Notice kind="error">Firebase is not configured.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;

  const waiting = (pendingPayments?.length ?? 0) + (pendingLinks?.length ?? 0) + (pendingSheets?.length ?? 0);

  return (
    <div className="space-y-6">
      <section className="hero">
        <p className="kicker text-[#c9b6ff]">{activeSession?.label ?? 'No session yet'} · {active?.name ?? 'No active term'}</p>
        <h1 className="mt-2 text-4xl font-bold text-white">{greetingNow()}, Head Teacher</h1>
        <p className="mt-2 text-[#e4dbff]">{waiting ? `${waiting} item${waiting === 1 ? '' : 's'} waiting for you.` : 'Nothing is waiting for you right now.'}</p>
      </section>

      {!active && <Notice kind="error">No active term yet. Choose one in <Link className="underline" to="/admin/settings">Settings</Link>.</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card"><p className="lbl">Collected this term</p><p className="metric">{formatNaira(collected)}</p><p className="metric-sub">Confirmed only</p></div>
        <div className="card"><p className="lbl">Still to collect</p><p className="metric">{formatNaira(outstanding)}</p><p className="metric-sub">This term</p></div>
        <div className="card"><p className="lbl">Waiting for your check</p><p className="metric">{pendingPayments?.length ?? '…'}</p><p className="metric-sub">Payments to confirm</p></div>
        <div className="card"><p className="lbl">Results to approve</p><p className="metric">{pendingSheets?.length ?? '…'}</p><p className="metric-sub">Sheets from teachers</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="card">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Needs you now</h2><span className="tag t-info">{waiting} item{waiting === 1 ? '' : 's'}</span></div>
          {pendingPayments === null ? <Loading /> : (
            <>
              {pendingPayments.slice(0, 3).map((p) => (
                <Link key={p.id} to="/admin/verify" className="todo"><div className="ico">₦</div><div className="flex-1"><div className="t">Check {formatNaira(p.amount)} from {p.payerName}</div><div className="s">Sent {p.transferDate}</div></div><span className="btn-secondary min-h-[40px] px-4 py-2">Open</span></Link>
              ))}
              {(pendingSheets ?? []).slice(0, 3).map((s) => (
                <Link key={s.id} to="/admin/results" className="todo"><div className="ico">★</div><div className="flex-1"><div className="t">Approve {s.subject}</div><div className="s">Sent by {s.teacherName} · {s.className}</div></div><span className="btn-secondary min-h-[40px] px-4 py-2">Open</span></Link>
              ))}
              {(pendingLinks ?? []).slice(0, 3).map((r) => (
                <Link key={r.id} to="/admin/approvals" className="todo"><div className="ico">+</div><div className="flex-1"><div className="t">Link {r.pupilFirstName} {r.pupilLastName} to a parent</div><div className="s">Parent request waiting</div></div><span className="btn-secondary min-h-[40px] px-4 py-2">Open</span></Link>
              ))}
              {waiting === 0 && <p className="text-sm text-inkMuted">Nothing waiting. New payments, results and requests appear here.</p>}
            </>
          )}
        </section>

        <section className="card text-center">
          <h2 className="text-left text-xl font-bold">Term collection</h2>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-7">
            <div className="grid h-32 w-32 place-items-center rounded-full" style={{ background: `conic-gradient(#6d3fd8 ${share}%, #e6def7 0)` }}>
              <div className="grid h-24 w-24 place-items-center rounded-full bg-surface font-serif text-2xl font-bold">{share}%<span className="block font-sans text-xs text-inkMuted">collected</span></div>
            </div>
            <div className="text-left"><p className="lbl">Confirmed</p><p className="font-bold">{formatNaira(collected)}</p><p className="lbl mt-3">Outstanding</p><p className="font-bold">{formatNaira(outstanding)}</p></div>
          </div>
          <p className="mt-4 text-sm text-inkMuted">Pending payments are not counted until you confirm them.</p>
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 text-xl font-bold">Recent actions</h2>
        {events === null ? <Loading /> : events.length === 0 ? <p className="text-sm text-inkMuted">No actions yet.</p> : (
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="text-sm"><span className="font-semibold">{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> · {describeAction(e)}</li>
            ))}
          </ol>
        )}
        <Link to="/admin/actions" className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">See all actions</Link>
      </section>
    </div>
  );
}
