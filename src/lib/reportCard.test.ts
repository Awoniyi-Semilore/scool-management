import { describe, it, expect } from 'vitest';
import { buildReport, termNoOf } from './reportCard';
import type { PublishedResult } from '../types';

const r = (subject: string, termId: string, total: number, grade = 'x', sessionId = 's1'): PublishedResult => ({
  id: `${subject}-${termId}`, pupilId: 'p1', classId: 'c', sessionId, termId, subject,
  test: 0, exam: 0, total, grade, sheetId: 'sh', version: 1, approvedAt: 1,
});

describe('report card', () => {
  it('reads the term number from the term id', () => {
    expect(termNoOf('2026/2027_2')).toBe(2);
    expect(termNoOf('bad')).toBeNull();
  });
  it('gives final averages and overall percentage when every term is published', () => {
    const res = [
      r('English', 's1_1', 90), r('English', 's1_2', 74), r('English', 's1_3', 80),
      r('Mathematics', 's1_1', 70), r('Mathematics', 's1_2', 95), r('Mathematics', 's1_3', 88),
      r('Basic Science', 's1_1', 55), r('Basic Science', 's1_2', 62), r('Basic Science', 's1_3', 58),
    ];
    const rep = buildReport(res, 's1');
    expect(rep.complete).toBe(true);
    expect(rep.subjects.find((s) => s.subject === 'English')?.final?.display).toBe('81.3333');
    expect(rep.subjects.find((s) => s.subject === 'Mathematics')?.final?.display).toBe('84.3333');
    expect(rep.subjects.find((s) => s.subject === 'Basic Science')?.final?.grade).toBe('Good');
    expect(rep.overall).toBe('74.6667%');
  });
  it('shows no final and no overall while a term is missing', () => {
    const rep = buildReport([r('English', 's1_1', 90), r('English', 's1_2', 74)], 's1');
    expect(rep.complete).toBe(false);
    expect(rep.subjects[0].final).toBeNull();
    expect(rep.overall).toBeNull();
    expect(rep.subjects[0].byTerm[1]?.total).toBe(90);
  });
  it('only uses the chosen session', () => {
    const rep = buildReport([r('English', 's2_1', 50, 'Good', 's2')], 's1');
    expect(rep.subjects).toHaveLength(0);
  });
});
