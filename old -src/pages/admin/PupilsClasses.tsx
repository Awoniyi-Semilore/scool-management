import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice, Empty, StatusBadge } from '../../components/ui';
import { addCharge, applyClassFees, createPupil, createTeacher, saveClass, decideLinkRequest, revokeLink } from '../../services/data';
import { LEVELS, className } from '../../lib/schoolLevels';
import { OUTSTANDING_FEE } from '../../lib/feeNames';
import { parseNairaToKobo } from '../../lib/money';
import { planPupilImport, type ImportPlan } from '../../lib/csvImport';
import type { LinkRequest, ParentPupilLink, Pupil, SchoolClass, Term } from '../../types';

export default function PupilsClasses({ mode }: { mode: 'pupils' | 'classes' }) {
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [links, setLinks] = useState<ParentPupilLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass)), fail),
      onSnapshot(collection(db, 'parentLinks'), (s) => setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ParentPupilLink)), fail),
      onSnapshot(collection(db, 'terms'), (s) => setTerms(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Term))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!firebaseConfigured) return <Notice kind="error">Firebase is not configured.</Notice>;
  if (error) return <Notice kind="error">{error}</Notice>;

  const className = (id: string) => classes?.find((c) => c.id === id)?.name ?? 'No class';

  return (
    <>
      <PageHeader title={mode === 'pupils' ? 'Pupils' : 'Classes'} subtitle={mode === 'pupils' ? 'Add pupils one at a time, or import a list. Admission number is optional.' : 'Add a class by its level and optional arm. Teachers are added on the Teachers page.'} />
      {message && <div className="mb-4"><Notice kind={message.kind}>{message.text}</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-2">
        {mode === 'classes' && <ClassForm onMessage={setMessage} />}
        {mode === 'pupils' && <PupilForm classes={classes ?? []} activeTerm={terms.find((t) => t.active) ?? null} onMessage={setMessage} />}
      </div>

      {mode === 'pupils' && <div className="mt-5">
        <ImportPanel classes={classes ?? []} existing={new Set((pupils ?? []).map((p) => p.admissionNumber).filter(Boolean))} onMessage={setMessage} />
      </div>}

      {mode === 'pupils' && (
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Pupils</h2>
        {pupils === null ? <Loading /> : pupils.length === 0 ? (
          <Empty title="No pupils yet" hint="Add a pupil above, or approve a parent request." />
        ) : (
          <div className="table-wrap">
            <table className="table w-full">
              <thead><tr><th>Name</th><th>Admission no.</th><th>Class</th><th>Parent access</th></tr></thead>
              <tbody>
                {[...pupils].sort((a, b) => a.lastName.localeCompare(b.lastName)).map((p) => {
                  const pl = (links ?? []).filter((l) => l.pupilId === p.id && l.status === 'approved');
                  return (
                    <tr key={p.id}>
                      <td>{p.lastName} {p.firstName}</td>
                      <td>{p.admissionNumber}</td>
                      <td>{className(p.classId)}</td>
                      <td>
                        {pl.length === 0 ? <span className="text-inkMuted">None</span> : pl.map((l) => (
                          <span key={l.id} className="mr-2 inline-flex items-center gap-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-900">
                            Guardian linked
                            <button className="underline" onClick={async () => {
                              if (!window.confirm('Revoke this parent\'s access to this pupil?')) return;
                              try { await revokeLink(l.id); setMessage({ kind: 'success', text: 'Access revoked.' }); }
                              catch (e) { setMessage({ kind: 'error', text: (e as Error).message }); }
                            }}>Revoke</button>
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
      {mode === 'classes' && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Classes</h2>
          {classes === null ? <Loading /> : classes.length === 0 ? (
            <Empty title="No classes yet" hint="Add the first class above." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead><tr><th>Class</th><th>Pupils</th></tr></thead>
                <tbody>
                  {[...classes].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                    <tr key={c.id}><td className="font-medium">{c.name}</td><td>{(pupils ?? []).filter((p) => p.classId === c.id).length}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function ClassForm({ onMessage }: { onMessage: (m: { kind: 'success' | 'error'; text: string } | null) => void }) {
  const [level, setLevel] = useState<string>(LEVELS[3]);
  const [arm, setArm] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [workType, setWorkType] = useState<'full' | 'part'>('full');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const name = className(level, arm);
    try {
      const id = await saveClass(name, undefined, { level, colour: arm.trim() });
      if (teacherName.trim()) {
        await createTeacher({ fullName: teacherName, email: teacherEmail, workType, classIds: [id], subjects: [] });
      }
      setTeacherName(''); setTeacherEmail(''); setArm('');
      onMessage({ kind: 'success', text: `Class ${name} added.` + (teacherName.trim() ? ' Its teacher was added too.' : '') });
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Add a class</h2>
        <p className="text-sm text-inkMuted">Choose the level. The arm is optional: leave it empty for a class with no arm (for example JSS 2). Add an arm such as Science, Commercial, A or Gold when the school splits a level.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="cls-level">Level</label>
          <select id="cls-level" className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select></div>
        <div><label className="label" htmlFor="cls-arm">Arm (optional)</label>
          <input id="cls-arm" className="field" placeholder="e.g. Science, Commercial, A" value={arm} onChange={(e) => setArm(e.target.value)} /></div>
      </div>
      <p className="text-sm font-medium">This class will be called: <span className="text-brand-900">{className(level, arm)}</span></p>

      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer font-medium">Add the class teacher now (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="ct-name">Teacher’s full name</label>
            <input id="ct-name" className="field" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} /></div>
          <div><label className="label" htmlFor="ct-email">Teacher’s email (for sign-in)</label>
            <input id="ct-email" type="email" className="field" value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} /></div>
          <div><label className="label" htmlFor="ct-work">Work type</label>
            <select id="ct-work" className="field" value={workType} onChange={(e) => setWorkType(e.target.value as 'full' | 'part')}>
              <option value="full">Full time</option><option value="part">Part time</option>
            </select></div>
        </div>
        <p className="mt-2 text-xs text-inkMuted">Add subjects and more classes later in Teachers.</p>
      </details>

      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add class'}</button>
    </form>
  );
}

function PupilForm({ classes, activeTerm, onMessage }: { classes: SchoolClass[]; activeTerm: Term | null; onMessage: (m: { kind: 'success' | 'error'; text: string } | null) => void }) {
  const [form, setForm] = useState({ admissionNumber: '', firstName: '', lastName: '', classId: '' });
  const [outstandingText, setOutstandingText] = useState('');
  const [outstandingNote, setOutstandingNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const outstanding = outstandingText.trim() ? parseNairaToKobo(outstandingText) : 0;
      if (outstanding === null || outstanding < 0) throw new Error('Outstanding fee must be a valid amount in naira, e.g. 5,000.');
      if (outstanding > 0 && !activeTerm) throw new Error('Set an active term first (Settings → Terms), then add the outstanding fee.');
      const pupilId = await createPupil(form);
      if (activeTerm) await applyClassFees(pupilId, form.classId, activeTerm.sessionId, activeTerm.id);
      if (outstanding > 0 && activeTerm) {
        await addCharge({
          pupilId, sessionId: activeTerm.sessionId, termId: activeTerm.id, category: OUTSTANDING_FEE,
          kind: 'opening_balance', amount: outstanding,
          description: outstandingNote.trim() ? `Outstanding fee: ${outstandingNote.trim()}` : 'Outstanding fee from earlier terms',
          reason: outstandingNote.trim() || null,
        });
      }
      setForm({ admissionNumber: '', firstName: '', lastName: '', classId: '' });
      setOutstandingText(''); setOutstandingNote('');
      onMessage({ kind: 'success', text: outstanding > 0 ? 'Pupil added with outstanding fee.' : 'Pupil added.' });
    } catch (err) {
      onMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card space-y-3" onSubmit={submit}>
      <h2 className="font-semibold">Add a pupil</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="adm">Admission number</label><input id="adm" className="field" value={form.admissionNumber} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} /></div>
        <div><label className="label" htmlFor="pcls">Class</label>
          <select id="pcls" className="field" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
            <option value="">Choose…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="fn">First name</label><input id="fn" className="field" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
        <div><label className="label" htmlFor="ln">Last name</label><input id="ln" className="field" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="outst">Outstanding fee from earlier terms (₦, optional)</label><input id="outst" inputMode="decimal" className="field" placeholder="e.g. 5,000" value={outstandingText} onChange={(e) => setOutstandingText(e.target.value)} /></div>
        <div><label className="label" htmlFor="outstNote">Where it came from (optional)</label><input id="outstNote" className="field" placeholder="e.g. last term tuition" value={outstandingNote} onChange={(e) => setOutstandingNote(e.target.value)} /></div>
      </div>
      {activeTerm ? <p className="text-xs text-inkMuted">Outstanding fee is recorded against the active term: {activeTerm.name}.</p> : <p className="text-xs text-inkMuted">No active term yet. Set one in Settings before adding an outstanding fee.</p>}
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add pupil'}</button>
    </form>
  );
}

export function RequestCard({ req, pupils, classes, className, onMessage }: {
  req: LinkRequest; pupils: Pupil[]; classes: SchoolClass[]; className: (id: string) => string;
  onMessage: (m: { kind: 'success' | 'error'; text: string } | null) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new' | 'reject'>('existing');
  const [pupilId, setPupilId] = useState('');
  const [newClassId, setNewClassId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const matches = pupils.filter((p) => p.admissionNumber === req.admissionNumber.trim().toUpperCase() || (p.lastName.toLowerCase() === req.pupilLastName.toLowerCase() && p.firstName.toLowerCase() === req.pupilFirstName.toLowerCase()));

  async function approveExisting() {
    if (!pupilId) return onMessage({ kind: 'error', text: 'Choose the pupil to link.' });
    if (!window.confirm('Link this parent to the selected pupil?')) return;
    setBusy(true);
    try { await decideLinkRequest(req, 'approved', { pupilId }); onMessage({ kind: 'success', text: 'Parent linked to pupil.' }); }
    catch (e) { onMessage({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function createAndLink() {
    setBusy(true);
    try {
      if (!newClassId) throw new Error('Choose the class for this new pupil.');
      const newId = await createPupil({ admissionNumber: req.admissionNumber, firstName: req.pupilFirstName, lastName: req.pupilLastName, classId: newClassId });
      await decideLinkRequest(req, 'approved', { pupilId: newId });
      onMessage({ kind: 'success', text: 'New pupil created and linked.' });
    } catch (e) { onMessage({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function reject() {
    setBusy(true);
    try { await decideLinkRequest(req, 'rejected', { rejectionReason: reason }); onMessage({ kind: 'success', text: 'Request rejected.' }); }
    catch (e) { onMessage({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{req.pupilFirstName} {req.pupilLastName} · {req.admissionNumber || 'no admission no.'}</p>
          <p className="text-sm text-inkMuted">From {req.parentEmail} · {req.classHint || 'class not given'}</p>
        </div>
        <StatusBadge status={req.status} />
      </div>
      {matches.length > 0 && (
        <div className="mt-3"><Notice kind="info">Possible match: {matches.map((m) => `${m.firstName} ${m.lastName} (${m.admissionNumber})`).join('; ')}. Check before linking or creating.</Notice></div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={mode === 'existing' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('existing')}>Link existing pupil</button>
        <button className={mode === 'new' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('new')}>Create new pupil</button>
        <button className={mode === 'reject' ? 'btn-danger' : 'btn-secondary'} onClick={() => setMode('reject')}>Reject</button>
      </div>
      <div className="mt-3">
        {mode === 'existing' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="label" htmlFor={`pick-${req.id}`}>Pupil</label>
              <select id={`pick-${req.id}`} className="field" value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
                <option value="">Choose…</option>
                {pupils.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName} · {p.admissionNumber} · {className(p.classId)}</option>)}
              </select>
            </div>
            <button className="btn-primary" disabled={busy} onClick={approveExisting}>Link to this pupil</button>
          </div>
        )}
        {mode === 'new' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[200px]">
              <label className="label" htmlFor={`nc-${req.id}`}>Class</label>
              <select id={`nc-${req.id}`} className="field" value={newClassId} onChange={(e) => setNewClassId(e.target.value)}>
                <option value="">Choose…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <p className="text-sm text-inkMuted">Creates a pupil record with the details above and links this parent.</p>
            <button className="btn-primary" disabled={busy} onClick={createAndLink}>Create and link</button>
          </div>
        )}
        {mode === 'reject' && (
          <div className="space-y-2">
            <label className="label" htmlFor={`rr-${req.id}`}>Reason (parent will see this)</label>
            <textarea id={`rr-${req.id}`} className="field" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-danger" disabled={busy || !reason.trim()} onClick={reject}>Reject request</button>
          </div>
        )}
      </div>
    </div>
  );
}


function ImportPanel({ classes, existing, onMessage }: {
  classes: SchoolClass[]; existing: Set<string>;
  onMessage: (m: { kind: 'success' | 'error'; text: string } | null) => void;
}) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setPlan(planPupilImport(text, classes, existing));
  }

  async function importValid() {
    if (!plan || plan.validRows.length === 0) return;
    if (!window.confirm(`Import ${plan.validRows.length} pupil(s)? Rows with errors will be skipped.`)) return;
    setBusy(true);
    let ok = 0; const failed: string[] = [];
    for (const [i, r] of plan.validRows.entries()) {
      try {
        await createPupil({ admissionNumber: r.admissionNumber, firstName: r.firstName, lastName: r.lastName, classId: r.classId! });
        ok++;
      } catch (e) {
        failed.push(`Row ${r.line}: ${(e as Error).message}`);
      }
      setProgress(i + 1);
    }
    setBusy(false);
    setPlan(null);
    onMessage(failed.length
      ? { kind: 'error', text: `Imported ${ok}. ${failed.length} failed: ${failed.slice(0, 3).join(' ')}` }
      : { kind: 'success', text: `Imported ${ok} pupil(s).` });
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Import pupils from a CSV file</h2>
      <p className="text-sm text-inkMuted">
        Use the <a className="underline" href="/sample-pupils.csv" download>sample file</a> as a template. Columns: admission_number, first_name, last_name, class. Create the classes first.
      </p>
      <div>
        <label className="label" htmlFor="csv-file">Choose a CSV file</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" className="field" disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {plan?.fatalError && <Notice kind="error">{plan.fatalError}</Notice>}
      {plan && !plan.fatalError && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{fileName}</strong>: {plan.validRows.length} ready, {plan.rows.length - plan.validRows.length} with errors.
          </p>
          <div className="table-wrap">
            <table className="table w-full">
              <thead><tr><th>Row</th><th>Admission no.</th><th>Name</th><th>Class</th><th>Status</th></tr></thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td><td>{r.admissionNumber}</td><td>{r.lastName} {r.firstName}</td><td>{r.className}</td>
                    <td>{r.errors.length === 0 ? <span className="text-brand-900">Ready</span> : <span>Error: {r.errors.join(' ')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="button" disabled={busy || plan.validRows.length === 0} onClick={importValid}>
              {busy ? `Importing… ${progress}/${plan.validRows.length}` : `Import ${plan.validRows.length} ready row(s)`}
            </button>
            <button className="btn-secondary" type="button" disabled={busy} onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
