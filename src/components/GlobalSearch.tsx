import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, firebaseConfigured } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { linkedListeners } from '../services/parentListeners';
import { formatNaira } from '../lib/money';
import type { Pupil, StatementRecord } from '../types';

interface Hit { kind: string; label: string; sub: string; to: string }

/**
 * Global search. Each person only gets results they may see:
 * the head teacher: all pupils, payments, receipts, statements; a parent: linked children, their payments, receipts and statements;
 * a teacher: no search for pupils or money. Every lookup is also checked by the security rules.
 */
export default function GlobalSearch() {
  const { role, firebaseUser } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseUser || !role) return;
    if (role === 'admin') {
      return onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), () => {});
    }
    if (role === 'parent') {
      const unsubs: Unsubscribe[] = linkedListeners(firebaseUser.uid, { setPupils, fail: () => {} });
      return () => unsubs.forEach((u) => u());
    }
    setPupils([]);
  }, [role, firebaseUser]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || !role || !firebaseUser) { setHits([]); setNote(null); return; }
    if (role === 'teacher') { setHits([]); setNote('Search is for the Head Teacher and for parents.'); return; }
    setNote(null);
    let cancelled = false;
    const t = setTimeout(async () => {
      const out: Hit[] = [];
      const low = term.toLowerCase();
      const isAdmin = role === 'admin';
      pupils.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(low) || p.admissionNumber.toLowerCase().includes(low))
        .slice(0, 6)
        .forEach((p) => {
          out.push({ kind: 'Child', label: `${p.firstName} ${p.lastName}`, sub: p.admissionNumber, to: isAdmin ? '/admin/register' : '/parent' });
          out.push({ kind: 'Results', label: `${p.firstName} ${p.lastName} · results`, sub: 'Report card', to: isAdmin ? '/admin/report-review' : '/parent/report' });
        });

      // Exact identifiers only. Each lookup is refused by the rules if the person may not see it.
      try {
        const pay = await getDoc(doc(db, 'payments', term));
        if (pay.exists()) out.push({ kind: 'Payment', label: term, sub: formatNaira(pay.data().amount), to: isAdmin ? '/admin/verify' : '/parent/receipts' });
      } catch { /* not visible to this person */ }
      try {
        const rc = await getDoc(doc(db, 'receipts', term.toUpperCase()));
        if (rc.exists()) out.push({ kind: 'Receipt', label: term.toUpperCase(), sub: formatNaira(rc.data().amount ?? 0), to: isAdmin ? '/admin/reports' : '/parent/receipts' });
      } catch { /* not visible */ }
      try {
        const st = await getDocs(isAdmin
          ? query(collection(db, 'statements'), where('statementNo', '==', term.toUpperCase()))
          : query(collection(db, 'statements'), where('generatedBy', '==', firebaseUser.uid), where('statementNo', '==', term.toUpperCase())));
        st.docs.forEach((d) => { const r = d.data() as StatementRecord; out.push({ kind: 'Statement', label: r.statementNo, sub: `${r.pupilName} · ${r.from} to ${r.to}`, to: isAdmin ? '/admin/statements' : '/parent/statements' }); });
      } catch { /* not visible */ }

      if (!cancelled) setHits(out);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, pupils, role, firebaseUser]);

  return (
    <div className="relative w-full max-w-sm">
      <label htmlFor="global-search" className="sr-only">Search the portal</label>
      <input id="global-search" type="search" className="field py-2" placeholder="Search a pupil, payment ID, receipt or statement"
        value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {(q.trim().length >= 2) && (
        <div role="listbox" aria-label="Search results" className="absolute left-0 right-0 z-40 mt-1 max-h-80 overflow-auto rounded-xl border border-line bg-surface p-2 shadow-lg">
          {note && <p className="p-2 text-sm text-inkMuted">{note}</p>}
          {!note && hits.length === 0 && <p className="p-2 text-sm text-inkMuted">No matches. Try the pupil’s full name, admission number, or the exact payment, receipt or statement number.</p>}
          {hits.map((h, i) => (
            <button key={i} type="button" className="block w-full rounded-lg p-2 text-left hover:bg-brand-50"
              onClick={() => { setQ(''); nav(h.to); }}>
              <span className="text-xs font-semibold uppercase text-brand-700">{h.kind}</span>
              <span className="block text-sm font-medium">{h.label}</span>
              <span className="block text-xs text-inkMuted">{h.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
