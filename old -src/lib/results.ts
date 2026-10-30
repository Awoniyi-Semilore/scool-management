/**
 * Result rules agreed with the school. Pure functions, no database.
 * Test is out of 40, exam out of 60, so a term total is out of 100.
 * A subject's final is the average of its three terms, out of 100.
 */
export const MAX_TEST = 40;
export const MAX_EXAM = 60;
export const MAX_TOTAL = 100;

export const GRADE_BANDS: { min: number; label: string }[] = [
  { min: 70, label: 'Excellent' },
  { min: 60, label: 'Very Good' },
  { min: 50, label: 'Good' },
  { min: 45, label: 'Average' },
  { min: 40, label: 'Below Average' },
  { min: 0, label: 'Fair' },
];

/** Grade from a total (or an unrounded average). */
export function gradeFor(total: number): string {
  for (const b of GRADE_BANDS) if (total >= b.min) return b.label;
  return 'Fair';
}

/** Reads a typed mark. Blank -> null. Not a number -> NaN (caught by markProblem). */
export function parseMark(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  return Number(t);
}

/** Returns a plain-English problem with a test/exam pair, or null if it is fine. */
export function markProblem(test: number | null, exam: number | null): string | null {
  if (test === null || exam === null) return 'Enter both the test and the exam score.';
  if (!Number.isInteger(test) || test < 0 || test > MAX_TEST) return `The test score must be a whole number from 0 to ${MAX_TEST}.`;
  if (!Number.isInteger(exam) || exam < 0 || exam > MAX_EXAM) return `The exam score must be a whole number from 0 to ${MAX_EXAM}.`;
  return null;
}

/** A term total: test + exam, out of 100. */
export function termTotal(test: number, exam: number): number {
  return test + exam;
}

/** Final of a subject across terms: the average, shown to 4 decimal places. The grade uses the unrounded average. */
export function finalAverage(terms: number[]): { value: number; display: string; grade: string } {
  if (terms.length === 0) throw new Error('At least one term score is needed.');
  const avg = terms.reduce((a, b) => a + b, 0) / terms.length;
  return { value: avg, display: (Math.round(avg * 10000) / 10000).toFixed(4), grade: gradeFor(avg) };
}

/** Overall percentage across subjects: sum of finals ÷ (100 × subjects) × 100, shown to 4 decimal places.
 * Pass the UNROUNDED finals, so the result is not affected by display rounding. */
export function overallPercent(finals: number[]): string {
  if (finals.length === 0) throw new Error('No subjects.');
  const sum = finals.reduce((a, b) => a + b, 0);
  const pct = (sum / (MAX_TOTAL * finals.length)) * 100;
  return (Math.round(pct * 10000) / 10000).toFixed(4) + '%';
}

/** Stable key for a subject, used in document ids. */
export function subjectKey(subject: string): string {
  return subject.trim().toLowerCase().replace(/\s+/g, '-');
}
