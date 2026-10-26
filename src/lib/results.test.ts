import { describe, it, expect } from 'vitest';
import { gradeFor, markProblem, parseMark, termTotal, finalAverage, overallPercent, subjectKey } from './results';

describe('marks', () => {
  it('accepts marks inside the limits', () => {
    expect(markProblem(40, 60)).toBeNull();
    expect(markProblem(0, 0)).toBeNull();
  });
  it('rejects a test over 40 and an exam over 60', () => {
    expect(markProblem(41, 60)).toMatch(/0 to 40/);
    expect(markProblem(40, 61)).toMatch(/0 to 60/);
  });
  it('rejects negative, decimal, blank and non-number marks', () => {
    expect(markProblem(-1, 10)).not.toBeNull();
    expect(markProblem(10.5, 10)).not.toBeNull();
    expect(markProblem(null, 10)).not.toBeNull();
    expect(markProblem(NaN, 10)).not.toBeNull();
  });
  it('parses typed marks', () => {
    expect(parseMark(' 35 ')).toBe(35);
    expect(parseMark('')).toBeNull();
    expect(Number.isNaN(parseMark('abc') as number)).toBe(true);
  });
});

describe('term totals and grades', () => {
  it('adds test and exam to a total out of 100', () => {
    expect(termTotal(20, 54)).toBe(74);
    expect(termTotal(35, 60)).toBe(95);
  });
  it('grades from the agreed bands', () => {
    expect(gradeFor(95)).toBe('Excellent');
    expect(gradeFor(70)).toBe('Excellent');
    expect(gradeFor(69)).toBe('Very Good');
    expect(gradeFor(60)).toBe('Very Good');
    expect(gradeFor(59)).toBe('Good');
    expect(gradeFor(50)).toBe('Good');
    expect(gradeFor(49)).toBe('Average');
    expect(gradeFor(45)).toBe('Average');
    expect(gradeFor(44)).toBe('Below Average');
    expect(gradeFor(40)).toBe('Below Average');
    expect(gradeFor(39)).toBe('Fair');
  });
});

describe('final averages across terms', () => {
  it('averages three terms to 4 decimal places (English 90, 74, 80)', () => {
    const f = finalAverage([90, 74, 80]);
    expect(f.display).toBe('81.3333');
    expect(f.grade).toBe('Excellent');
  });
  it('uses the unrounded average for the grade', () => {
    // (69 + 69 + 69.5) / 3 is about 69.1667 (grade Very Good); rounding must not change it.
    expect(finalAverage([69, 69, 69.5]).grade).toBe('Very Good');
  });
  it('gives the overall percentage (224 out of 300 is 74.6667%)', () => {
    // Use the unrounded averages (244/3, 253/3, 175/3). Adding the rounded 4-decimal figures would give 74.6666%.
    expect(overallPercent([244 / 3, 253 / 3, 175 / 3])).toBe('74.6667%');
  });
});

describe('subject keys', () => {
  it('makes a stable key from a subject name', () => {
    expect(subjectKey('  Basic  Science ')).toBe('basic-science');
  });
});
