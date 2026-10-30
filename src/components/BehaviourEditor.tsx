import { useState, type FormEvent } from 'react';
import { saveReportExtras, type ReportExtras } from '../services/data';
import { Notice } from './ui';

const DEFAULT: ReportExtras['behaviour'] = { punctuality: 5, neatness: 5, cooperation: 5, participation: 5 };

/** Head teacher only: star ratings and the two comments for one child's report card. */
export default function BehaviourEditor({ pupilId, sessionId, current }: { pupilId: string; sessionId: string; current: ReportExtras | null }) {
  const [b, setB] = useState<ReportExtras['behaviour']>(current?.behaviour ?? DEFAULT);
  const [teacher, setTeacher] = useState(current?.teacherComment ?? '');
  const [head, setHead] = useState(current?.headComment ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm('Save the stars and comments for this report card?')) return;
    setBusy(true); setMsg(null);
    try {
      await saveReportExtras({ pupilId, sessionId, behaviour: b, teacherComment: teacher, headComment: head });
      setMsg({ kind: 'success', text: 'Saved.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="card space-y-4">
      <h2 className="text-lg font-semibold">Stars and comments</h2>
      {msg && <Notice kind={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(b) as (keyof ReportExtras['behaviour'])[]).map((k) => (
          <div key={k}>
            <label className="label" htmlFor={`b-${k}`}>{k.charAt(0).toUpperCase() + k.slice(1)} (0 to 5)</label>
            <input id={`b-${k}`} type="number" min={0} max={5} step={1} className="field" value={b[k]}
              onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
      <div><label className="label" htmlFor="tc">Teacher’s comment</label><textarea id="tc" rows={2} className="field" value={teacher} onChange={(e) => setTeacher(e.target.value)} /></div>
      <div><label className="label" htmlFor="hc">Head teacher’s comment</label><textarea id="hc" rows={2} className="field" value={head} onChange={(e) => setHead(e.target.value)} /></div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save stars and comments'}</button>
    </form>
  );
}
