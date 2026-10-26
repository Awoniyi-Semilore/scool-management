import { jsPDF } from 'jspdf';
import { SCHOOL } from '../lib/schoolInfo';
import { pdfNaira } from './receipt';
import type { StatementRecord } from '../types';

const PURPLE: [number, number, number] = [91, 33, 182];
const INK: [number, number, number] = [31, 20, 52];
const MUTED: [number, number, number] = [95, 85, 115];
const H = 297, L = 14, R = 196;

/** A4 statement PDF, built only from the saved record, so a reprint is identical to the original. */
export function buildStatementPdf(s: StatementRecord): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = 16;

  const header = () => {
    doc.setTextColor(...PURPLE); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(SCHOOL.name, L, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`${SCHOOL.addresses.join('  •  ')}`, L, y + 5);
    doc.text(`Tel: ${SCHOOL.phones.join(', ')}  ·  ${SCHOOL.email}`, L, y + 9);
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('ACCOUNT STATEMENT', R, y, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Statement no. ${s.statementNo}`, R, y + 5, { align: 'right' });
    doc.text(`Issued ${new Date(s.generatedAt).toLocaleString('en-GB')}`, R, y + 9, { align: 'right' });
    doc.setDrawColor(...PURPLE); doc.setLineWidth(0.5); doc.line(L, y + 13, R, y + 13);
    y += 20;
  };

  header();
  doc.setTextColor(...INK); doc.setFontSize(10);
  const info: [string, string][] = [
    ['Pupil', s.pupilName], ['Admission no.', s.admissionNumber], ['Period', `${s.from} to ${s.to}`],
    ['Opening balance', pdfNaira(s.opening)], ['Closing balance', pdfNaira(s.closing)], ['Prepared by', s.generatedByName],
  ];
  for (const [k, v] of info) {
    doc.setFont('helvetica', 'bold'); doc.text(k, L, y);
    doc.setFont('helvetica', 'normal'); doc.text(v, L + 40, y);
    y += 6;
  }
  y += 4;

  // Table
  const cols = { date: L, tx: L + 22, desc: L + 62, debit: 138, credit: 164, bal: R };
  const tableHead = () => {
    doc.setFillColor(244, 240, 255); doc.rect(L, y - 4.5, R - L, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...PURPLE);
    doc.text('Date', cols.date, y);
    doc.text('Transaction ID', cols.tx, y);
    doc.text('Description', cols.desc, y);
    doc.text('Owed +', cols.debit, y, { align: 'right' });
    doc.text('Paid −', cols.credit, y, { align: 'right' });
    doc.text('Balance', cols.bal, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.setFontSize(8.5);
  };
  tableHead();

  const opening = s.opening;
  doc.text('Opening balance', cols.desc, y);
  doc.text(pdfNaira(opening), cols.bal, y, { align: 'right' });
  y += 6;

  for (const l of s.lines) {
    if (y > H - 30) {
      doc.addPage(); y = 20; tableHead();
    }
    doc.text(l.date, cols.date, y);
    doc.text(l.txId.slice(0, 22), cols.tx, y);
    const desc = doc.splitTextToSize(l.description + (l.receiptNo ? `  (${l.receiptNo})` : ''), 72);
    doc.text(desc, cols.desc, y);
    if (l.debit) doc.text(pdfNaira(l.debit), cols.debit, y, { align: 'right' });
    if (l.credit) doc.text(pdfNaira(l.credit), cols.credit, y, { align: 'right' });
    doc.text(pdfNaira(l.balance), cols.bal, y, { align: 'right' });
    y += 5 + (desc.length - 1) * 4;
    if (l.note) {
      doc.setTextColor(...MUTED); doc.setFontSize(7.5);
      const n = doc.splitTextToSize(l.note, 150);
      doc.text(n, cols.desc, y); y += 3.8 * n.length;
      doc.setTextColor(...INK); doc.setFontSize(8.5);
    }
    doc.setDrawColor(230, 222, 247); doc.setLineWidth(0.1); doc.line(L, y - 3, R, y - 3);
  }

  y += 4;
  if (y > H - 40) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  doc.text(`Totals for the period:  owed ${pdfNaira(s.debits)}   ·   paid ${pdfNaira(s.credits)}`, L, y); y += 6;
  doc.text(`Closing balance: ${pdfNaira(s.closing)}`, L, y);
  y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text('“Owed +” means the amount owed went up. “Paid −” means it went down.', L, y); y += 4;
  doc.text('Only confirmed payments appear here. Pending and rejected transfers do not change the balance.', L, y); y += 4;
  doc.text('Advance payments are shown for information and do not change any balance until the school applies them.', L, y);
  doc.text(`Official statement ${s.statementNo}. Keep it for your records.`, L, H - 10);

  return doc.output('blob');
}
