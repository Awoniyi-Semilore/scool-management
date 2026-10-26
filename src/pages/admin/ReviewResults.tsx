import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { Loading, Notice, PageHeader, Empty } from '../../components/ui';
import { decideResultSheet } from '../../services/data';
import { gradeFor, markProblem, termTotal } from '../../lib/results';
import type { ResultSheet, SchoolClass } from '../../types';

type Msg = { kind: 'success' | 'error'; text: string } | null;

export default function ReviewResults() {
  const [sheets, setSheets] = useState<ResultSheet[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<ResultSheet | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const unsubs: Unsubscribe[] = [
      onSnapshot(query(collection(db, 'resultSheets'), where('status', '==', 'pending')),
        (s) => setSheets(s.docs.map((d) => d.data() as ResultSheet).sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0))), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const shown = useMemo(() => (sheets ?? []).filter((s) => filter === 'all' || s.classId === filter), [sheets, filter]);

  async function decide(approve: boolean) {
    if (!open) return;
    setBusy(true); setMsg(null);
    try {
      await decideResultSheet(open, approve, reason);
      setMsg({ kind: 'success', text: approve ? 'Approved. Parents can now see these results.' : 'Sent back to the teacher with your reason.' });
      setOpen(null); setReason('');
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  if (sheets === null) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader title="Review results" subtitle="Open a sheet to see every child's marks. Approve it, or send it back with a reason." />
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by class">
        <button className={filter === 'all' ? 'btn-primary' : 'btn-secondary'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All classes</button>
        {classes.map((c) => (
          <button key={c.id} className={filter === c.id ? 'btn-primary' : 'btn-secondary'} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>{c.name}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty title="No results waiting" hint="Sheets sent by teachers appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => {
            const bad = s.rows.filter((r) => markProblem(r.test, r.exam)).length;
            return (
              <button key={s.id} className="card text-left hover:border-brand-600" onClick={() => { setOpen(s); setReason(''); }}>
                <p className="text-sm text-inkMuted">{s.className}</p>
                <p className="text-lg font-semibold">{s.subject}</p>
                <p className="text-sm text-inkMuted">Sent by {s.teacherName} · {s.rows.length} children · version {s.version}</p>
                <p className={`mt-2 text-sm font-medium ${bad ? 'text-red-700' : 'text-brand-900'}`}>{bad ? `${bad} row(s) need attention` : 'All rows are within the limits'}</p>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Review sheet">
          <div className="card max-h-[90vh] w-full max-w-3xl overflow-auto">
            <h2 className="text-lg font-semibold">{open.className} · {open.subject}</h2>
            <p className="mb-3 text-sm text-inkMuted">{open.termName} · sent by {open.teacherName} · version {open.version}</p>
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-left"><tr><th className="px-2 py-2">Child</th><th className="px-2 py-2">Test /40</th><th className="px-2 py-2">Exam /60</th><th className="px-2 py-2">Total</th><th className="px-2 py-2">Grade</th></tr></thead>
              <tbody>
                {open.rows.map((r) => {
                  const p = markProblem(r.test, r.exam);
                  const total = r.test !== null && r.exam !== null && !p ? termTotal(r.test, r.exam) : null;
                  return (
                    <tr key={r.pupilId} className={`border-t border-line ${p ? 'bg-red-50' : ''}`}>
                      <td className="px-2 py-2">{r.name}</td>
                      <td className="px-2 py-2">{r.test ?? '–'}</td>
                      <td className="px-2 py-2">{r.exam ?? '–'}</td>
                      <td className="px-2 py-2 font-semibold">{total ?? '–'}</td>
                      <td className="px-2 py-2">{total !== null ? gradeFor(total) : <span className="text-red-700">{p}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-4">
              <label className="label" htmlFor="rv-reason">Reason (required only to send back)</label>
              <input id="rv-reason" className="field" placeholder="e.g. Two test scores are over 40" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="btn-secondary" onClick={() => setOpen(null)} disabled={busy}>Close</button>
              <button className="btn-secondary" onClick={() => decide(false)} disabled={busy}>Send back</button>
              <button className="btn-primary" onClick={() => decide(true)} disabled={busy}>{busy ? 'Saving…' : 'Approve'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
