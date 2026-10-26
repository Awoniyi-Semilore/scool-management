import { describe, it, expect } from 'vitest';
import { buildReceiptPdf, pdfNaira } from './receipt';

const base = {
  receiptNumber: 'TCS-000123',
  date: '12 Oct 2026',
  payerName: 'Mrs Okafor',
  amountKobo: 3_000_000,
  lines: [
    { label: 'Ada Okafor: Tuition', amountKobo: 2_500_000 },
    { label: 'Ada Okafor: Books', amountKobo: 500_000 },
  ],
  outstandingKobo: 0,
};

describe('receipt PDF', () => {
  it('produces a real PDF document', async () => {
    const bytes = new Uint8Array(await buildReceiptPdf(base).arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });
  it('contains the receipt number, payer, words and fee lines', async () => {
    const text = Buffer.from(await buildReceiptPdf(base).arrayBuffer()).toString('latin1');
    expect(text).toContain('TCS-000123');
    expect(text).toContain('Mrs Okafor');
    expect(text).toContain('Thirty thousand naira only');
    expect(text).toContain('Ada Okafor: Tuition');
  });
  it('shows the outstanding balance when known', async () => {
    const text = Buffer.from(await buildReceiptPdf({ ...base, outstandingKobo: 500_000 }).arrayBuffer()).toString('latin1');
    expect(text).toContain('N 5,000.00');
  });
  it('formats naira without the naira sign (the PDF font cannot draw it)', () => {
    expect(pdfNaira(3_000_000)).toBe('N 30,000.00');
  });
});
