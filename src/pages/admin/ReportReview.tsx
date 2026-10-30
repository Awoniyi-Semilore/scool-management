import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty } from '../../components/ui';
import ReportCard from '../../components/ReportCard';
import { StatusTag } from '../teacher/TeacherComments';
import { buildReport } from '../../lib/reportCard';
import { editReportExtras, reviewReportExtras, type ReportExtras } from '../../services/data';
import type { AcademicSession, PublishedResult, Pupil, SchoolClass, Term } from '../../types';

type Msg = { kind: 'success' | 'error'; text: string } | null;

/** Head teacher review: filter by class, open a child's card (as the parent will see it), then approve, download, edit, or reject. */
export default function ReportReview() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [cards, setCards] = useState<ReportExtras[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classId, setClassId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, PublishedResult> | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [draft, setDraft] = useState({ punctuality: 5, neatness: 5, cooperation: 5, participation: 5, teacherComment: '', headComment: '' });

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setMsg({ kind: 'error', text: e.message });
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
      onSnapshot(collection(db, 'reportExtras'), (s) => setCards(s.docs.map((d) => d.data() as ReportExtras)), fail),
      onSnapshot(collection(db, 'terms'), (s) => setTerms(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Term)), fail),
      onSnapshot(collection(db, 'sessions'), (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AcademicSession)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => { if (!classId && classes.length) setClassId([...classes].sort((a, b) => a.name.localeCompare(b.name))[0].id); }, [classes, classId]);
  const activeTerm = terms.find((t) => t.active) ?? null;
  const sessionId = activeTerm?.sessionId ?? sessions.find((s) => s.active)?.id ?? '';

  const classPupils = useMemo(() => (pupils ?? []).filter((p) => p.classId === classId).sort((a, b) => a.lastName.localeCompare(b.lastName)), [pupils, classId]);
  const cardFor = (pupilId: string) => cards.find((c) => c.pupilId === pupilId && c.sessionId === sessionId) ?? null;
  const open = classPupils.find((p) => p.id === openId) ?? null;
  const openCard = open ? cardFor(open.id) : null;

  useEffect(() => {
    if (!open || !sessionId) return;
    setItems(undefined); setEditing(false); setReason('');
    getDoc(doc(db, 'pupilResults', open.id)).then((s) => setItems(s.exists() ? (s.data().items as Record<string, PublishedResult>) : null));
  }, [openId, sessionId]);

  const report = useMemo(() => buildReport(Object.values(items ?? {}), sessionId), [items, sessionId]);
  const className = classes.find((c) => c.id === classId)?.name ?? '';

  async function act(approve: boolean) {
    if (!openCard) return;
    setBusy(true); setMsg(null);
    try {
      await reviewReportExtras(openCard, approve, reason);
      setMsg({ kind: 'success', text: approve ? 'Approved. The parent can now see this card.' : 'Sent back to the teacher with your reason.' });
      setOpenId(null);
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!openCard) return;
    if (!window.confirm(`Save your changes to ${open?.firstName} ${open?.lastName}'s card? The change is recorded with the old comments in Actions.`)) return;
    if (!window.confirm('Please confirm once more. The parent will see the changed card.')) return;
    setBusy(true); setMsg(null);
    try {
      await editReportExtras(openCard, { behaviour: { punctuality: draft.punctuality, neatness: draft.neatness, cooperation: draft.cooperation, participation: draft.participation }, teacherComment: draft.teacherComment, headComment: draft.headComment });
      setMsg({ kind: 'success', text: 'Card changed and approved.' });
      setEditing(false);
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  function startEdit() {
    if (!openCard) return;
    setDraft({ ...openCard.behaviour, teacherComment: openCard.teacherComment ?? '', headComment: openCard.headComment ?? '' });
    setEditing(true);
  }

  if (!pupils) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Review report cards" subtitle="Choose a class, then open a pupil’s card to review it as the parent will see it." />
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      {!sessionId && <Notice kind="info">There is no active session or term. Set one in Settings before reviewing report cards.</Notice>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by class">
        {[...classes].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
          <button key={c.id} className={classId === c.id ? 'btn-primary' : 'btn-secondary'} aria-pressed={classId === c.id}
            onClick={() => { setClassId(c.id); setOpenId(null); }}>{c.name}</button>
        ))}
      </div>

      {classPupils.length === 0 ? <Empty title="No pupils in this class" hint="Choose another class or add pupils to this class." /> : (
        <div className="card overflow-x-auto p-0">
          <table className="table w-full">
            <thead><tr><th>Child</th><th>Admission no.</th><th>Card</th><th></th></tr></thead>
            <tbody>
              {classPupils.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.firstName} {p.lastName}</td>
                  <td>{p.admissionNumber || '—'}</td>
                  <td><StatusTag status={cardFor(p.id)?.status ?? null} /></td>
                  <td><button className="btn-secondary px-3 py-1.5" onClick={() => setOpenId(p.id)}>Open card</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <section className="space-y-4">
          {items === undefined ? <Loading /> : (
            <ReportCard pupilName={`${open.firstName} ${open.lastName}`} admissionNumber={open.admissionNumber || '—'} className={className}
              sessionLabel={sessions.find((s) => s.id === sessionId)?.label ?? ''} report={report}
              extras={openCard && !editing ? openCard : null} />
          )}

          {!openCard ? (
            <Notice kind="info">The teacher has not submitted report card comments for this pupil yet.</Notice>
          ) : editing ? (
            <div className="card space-y-4">
              <h2 className="text-lg font-semibold">Edit the card</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['punctuality', 'neatness', 'cooperation', 'participation'] as const).map((k) => (
                  <div key={k}><label className="label" htmlFor={`e-${k}`}>{k.charAt(0).toUpperCase() + k.slice(1)} (0 to 5)</label>
                    <input id={`e-${k}`} type="number" min={0} max={5} className="field" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} /></div>
                ))}
                <div className="sm:col-span-2"><label className="label" htmlFor="e-tc">Teacher’s comment</label>
                  <textarea id="e-tc" rows={2} className="field" value={draft.teacherComment} onChange={(e) => setDraft({ ...draft, teacherComment: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor="e-hc">Head teacher’s comment</label>
                  <textarea id="e-hc" rows={2} className="field" value={draft.headComment} onChange={(e) => setDraft({ ...draft, headComment: e.target.value })} /></div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                <button className="btn-primary" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          ) : (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-inkMuted">Submitted by {openCard.teacherName}. Approve the card to make it visible to the parent.</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => window.print()}>Print or save PDF</button>
                  <button className="btn-secondary" onClick={startEdit}>Edit</button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="rv-reason">Reason for returning the card (required)</label>
                <input id="rv-reason" className="field" placeholder="e.g. Please check the neatness stars" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-secondary" onClick={() => act(false)} disabled={busy}>Return to teacher</button>
                <button className="btn-primary" onClick={() => act(true)} disabled={busy || openCard.status === 'approved'}>{busy ? 'Saving…' : 'Approve'}</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
