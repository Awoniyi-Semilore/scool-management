import { describe, it, expect } from 'vitest';
import { buildStatementPdf } from './statementPdf';
import type { StatementRecord } from '../types';

const rec: StatementRecord = {
  id: 'st1', statementNo: 'STMT-2026-000007', pupilId: 'p1', pupilName: 'Ada Okafor', admissionNumber: 'ADM-0412',
  from: '2026-09-01', to: '2026-10-22', generatedBy: 'u1', generatedByName: 'Mrs Ogunleye', generatedAt: Date.UTC(2026, 9, 22),
  opening: 2500000, debits: 5000000, credits: 5000000, closing: 2500000,
  lines: [
    { date: '2026-09-10', txId: 'CHG-1', receiptNo: null, description: 'Charged: Tuition', debit: 5000000, credit: 0, balance: 7500000, note: null },
    { date: '2026-09-18', txId: 'PAY-9', receiptNo: 'TCS-000118', description: 'Paid: Tuition', debit: 0, credit: 5000000, balance: 2500000, note: null },
  ],
};

describe('statement PDF', () => {
  it('is a PDF that carries the statement number, pupil and closing balance', async () => {
    const bytes = new Uint8Array(await buildStatementPdf(rec).arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toContain('STMT-2026-000007');
    expect(text).toContain('Ada Okafor');
    expect(text).toContain('N 25,000.00');
    expect(text).toContain('TCS-000118');
  });
  it('builds a long statement across several pages without error', async () => {
    const lines = Array.from({ length: 120 }, (_, i) => ({ date: '2026-09-10', txId: `CHG-${i}`, receiptNo: null, description: 'Charged: Books', debit: 1000, credit: 0, balance: 1000 * (i + 1), note: null }));
    const big = { ...rec, lines, closing: 120000, debits: 120000, credits: 0 };
    const blob = buildStatementPdf(big);
    expect(blob.size).toBeGreaterThan(5000);
  });
});
