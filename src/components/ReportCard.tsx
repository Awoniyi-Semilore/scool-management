import type { Report } from '../lib/reportCard';
import type { ReportExtras } from '../services/data';

export function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={`${label}: ${value} out of 5 stars`} className="text-lg tracking-wider">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" className={i <= value ? 'text-amber-400' : 'text-line'}>★</span>
      ))}
    </span>
  );
}

const BEHAVIOUR: { key: keyof ReportExtras['behaviour']; label: string }[] = [
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'neatness', label: 'Neatness' },
  { key: 'cooperation', label: 'Cooperation' },
  { key: 'participation', label: 'Participation' },
];

/** The report card. Figures come from published results only. Printing uses the browser's print dialog. */
export default function ReportCard({ pupilName, admissionNumber, className, sessionLabel, report, extras }: {
  pupilName: string; admissionNumber: string; className: string; sessionLabel: string;
  report: Report; extras: ReportExtras | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <button className="btn-secondary" onClick={() => window.print()}>Print report card</button>
      </div>
      <article id="report-print" className="card mx-auto max-w-3xl space-y-5 bg-white text-ink">
        <header className="report-band -mx-6 -mt-6 rounded-t-[22px]">
          <img src="/treasure-corner-logo-compact.svg" alt="" className="h-16 w-auto rounded-xl bg-white p-1.5" />
          <div className="flex-1">
            <h2 className="font-serif text-2xl font-bold">TREASURE CORNER SCHOOLS</h2>
            <p>Student report card · {sessionLabel}</p>
          </div>
          <div className="photo-box">Paste<br />photo<br />here</div>
        </header>

        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="text-inkMuted">Name</dt><dd className="font-semibold">{pupilName}</dd></div>
          <div><dt className="text-inkMuted">Admission no.</dt><dd className="font-semibold">{admissionNumber}</dd></div>
          <div><dt className="text-inkMuted">Class</dt><dd className="font-semibold">{className}</dd></div>
        </dl>

        {report.subjects.length === 0 ? (
          <p className="text-sm text-inkMuted">No published results yet for this session.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-left text-brand-900">
                <tr>
                  <th className="px-2 py-2">Subject</th>
                  <th className="px-2 py-2 text-center">1st term /100</th>
                  <th className="px-2 py-2 text-center">2nd term /100</th>
                  <th className="px-2 py-2 text-center">3rd term /100</th>
                  <th className="px-2 py-2 text-center">Final /100</th>
                  <th className="px-2 py-2">Grade</th>
                </tr>
              </thead>
              <tbody>
                {report.subjects.map((s) => (
                  <tr key={s.subject} className="border-t border-line">
                    <td className="px-2 py-2 font-semibold">{s.subject}</td>
                    {([1, 2, 3] as const).map((n) => (
                      <td key={n} className="px-2 py-2 text-center tabular-nums">{s.byTerm[n] ? s.byTerm[n]!.total : '–'}</td>
                    ))}
                    <td className="px-2 py-2 text-center font-bold tabular-nums text-brand-900">{s.final ? s.final.display : 'after 3rd term'}</td>
                    <td className="px-2 py-2">{s.final ? s.final.grade : '–'}</td>
                  </tr>
                ))}
              </tbody>
              {report.overall && (
                <tfoot>
                  <tr className="bg-brand-50 font-semibold">
                    <td className="px-2 py-2" colSpan={4}>Overall</td>
                    <td className="px-2 py-2 text-center tabular-nums">{report.overall}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-inkMuted">Personal development · stars out of 5</h3>
          {extras ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {BEHAVIOUR.map((b) => (
                <li key={b.key} className="flex items-center justify-between text-sm">
                  <span>{b.label}</span>
                  <Stars value={extras.behaviour[b.key]} label={b.label} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-inkMuted">Not entered yet.</p>}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div><h3 className="text-sm font-semibold">Teacher’s comment</h3><p className="mt-1 min-h-12 border-b border-dashed border-line text-sm">{extras?.teacherComment ?? ''}</p></div>
          <div><h3 className="text-sm font-semibold">Head teacher’s comment</h3><p className="mt-1 min-h-12 border-b border-dashed border-line text-sm">{extras?.headComment ?? ''}</p></div>
        </section>

        <footer className="pt-2 text-xs text-inkMuted">
          Final = average of the three terms, shown to 4 decimal places. Grades use the unrounded average.
          Grades: Excellent 70–100 · Very Good 60–69 · Good 50–59 · Average 45–49 · Below Average 40–44 · Fair below 40.
        </footer>
      </article>
    </div>
  );
}
