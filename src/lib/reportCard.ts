import { finalAverage, overallPercent } from './results';
import type { PublishedResult } from '../types';

export type TermNo = 1 | 2 | 3;

export interface ReportSubject {
  subject: string;
  byTerm: Record<TermNo, { total: number; grade: string } | null>;
  /** Average of the three terms, out of 100. Only when all three terms are published. */
  final: { display: string; grade: string; value: number } | null;
}

export interface Report {
  subjects: ReportSubject[];
  /** true when every subject has all three terms */
  complete: boolean;
  overall: string | null;   // e.g. "74.6667%", only when complete
}

/** term number from a term id such as "2026/2027_2" */
export function termNoOf(termId: string): TermNo | null {
  const n = Number(termId.split('_').pop());
  return n === 1 || n === 2 || n === 3 ? n : null;
}

export function buildReport(results: PublishedResult[], sessionId: string): Report {
  const mine = results.filter((r) => r.sessionId === sessionId);
  const subjects = [...new Set(mine.map((r) => r.subject))].sort((a, b) => a.localeCompare(b));
  const rows: ReportSubject[] = subjects.map((subject) => {
    const byTerm = { 1: null, 2: null, 3: null } as Record<TermNo, { total: number; grade: string } | null>;
    for (const r of mine.filter((x) => x.subject === subject)) {
      const n = termNoOf(r.termId);
      if (n) byTerm[n] = { total: r.total, grade: r.grade };
    }
    const all = byTerm[1] && byTerm[2] && byTerm[3];
    const final = all ? finalAverage([byTerm[1]!.total, byTerm[2]!.total, byTerm[3]!.total]) : null;
    return { subject, byTerm, final: final ? { display: final.display, grade: final.grade, value: final.value } : null };
  });
  const complete = rows.length > 0 && rows.every((r) => r.final !== null);
  // Overall uses the UNROUNDED finals, so display rounding cannot change it.
  const overall = complete ? overallPercent(rows.map((r) => finalAverage([r.byTerm[1]!.total, r.byTerm[2]!.total, r.byTerm[3]!.total]).value)) : null;
  return { subjects: rows, complete, overall };
}
