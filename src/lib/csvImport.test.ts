import { describe, it, expect } from 'vitest';
import { parseCsv, planPupilImport } from './csvImport';

const classes = [{ id: 'c1', name: 'Primary 1' }, { id: 'c2', name: 'Primary 2' }];

describe('CSV parsing', () => {
  it('handles quoted commas, escaped quotes and CRLF', () => {
    const t = 'a,b\r\n"Okafor, Jr","say ""hi"""\r\n';
    expect(parseCsv(t)).toEqual([['a', 'b'], ['Okafor, Jr', 'say "hi"']]);
  });
  it('ignores blank lines and a UTF-8 BOM', () => {
    expect(parseCsv('\uFEFFx,y\n\n1,2\n')).toEqual([['x', 'y'], ['1', '2']]);
  });
});

describe('pupil import planning', () => {
  const header = 'admission_number,first_name,last_name,class\n';
  it('accepts a clean file and normalises admission numbers', () => {
    const p = planPupilImport(header + 'adm-1,Ada,Okafor,primary 1\nADM-2,Tunde,Bello,Primary 2\n', classes, new Set());
    expect(p.fatalError).toBeNull();
    expect(p.validRows.length).toBe(2);
    expect(p.validRows[0].admissionNumber).toBe('ADM-1');
    expect(p.validRows[0].classId).toBe('c1');
  });
  it('flags duplicates within the file', () => {
    const p = planPupilImport(header + 'ADM-1,A,B,Primary 1\nADM-1,C,D,Primary 2\n', classes, new Set());
    expect(p.validRows.length).toBe(1);
    expect(p.rows[1].errors.join(' ')).toMatch(/duplicated in this file/);
  });
  it('flags admission numbers already in the school', () => {
    const p = planPupilImport(header + 'ADM-9,A,B,Primary 1\n', classes, new Set(['ADM-9']));
    expect(p.validRows.length).toBe(0);
    expect(p.rows[0].errors.join(' ')).toMatch(/already exists/);
  });
  it('flags unknown classes and missing names', () => {
    const p = planPupilImport(header + 'ADM-3,,B,Primary 9\n', classes, new Set());
    expect(p.rows[0].errors.length).toBe(2);
  });
  it('rejects a file missing required columns', () => {
    const p = planPupilImport('admission_number,first_name\nX,Y\n', classes, new Set());
    expect(p.fatalError).toMatch(/Missing column/);
  });
  it('rejects an empty file', () => {
    expect(planPupilImport('', classes, new Set()).fatalError).not.toBeNull();
  });
  it('imports the shipped sample file cleanly', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync('public/sample-pupils.csv', 'utf8');
    const p = planPupilImport(text, classes, new Set());
    expect(p.fatalError).toBeNull();
    expect(p.rows.every((r) => r.errors.length === 0 || r.classId === null)).toBe(true);
  });
});
