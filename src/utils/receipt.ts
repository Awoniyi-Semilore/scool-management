import { jsPDF } from 'jspdf';
import { SCHOOL } from '../lib/schoolInfo';
import { nairaInWordsFromKobo } from '../lib/words';
import { drawSchoolStamp } from './schoolStamp';

export interface ReceiptData {
  receiptNumber: string;
  date: string;                       // as shown on the receipt, e.g. 12 Oct 2026
  payerName: string;
  amountKobo: number;
  lines: { label: string; amountKobo: number }[];   // "Being part/full payment for"
  outstandingKobo: number | null;     // null when the school has not yet worked it out
}

const PURPLE: [number, number, number] = [91, 33, 182];
const INK: [number, number, number] = [31, 20, 52];
const MUTED: [number, number, number] = [95, 85, 115];
const PAGE_W = 148;   // A5 portrait (half A4), millimetres
const PAGE_H = 210;
const LEFT = 8;
const RIGHT = PAGE_W - 8;

/** Plain-text naira for the PDF (the built-in PDF font has no naira sign). */
export function pdfNaira(kobo: number): string {
  return `N ${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Reads the school logo from the app so it can be drawn into the PDF. Returns null if unavailable. */
export async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Builds the official receipt. Throws if generation fails; the caller shows an honest error.
 * Layout follows the school's paper receipt: header, number and date, payer, amount in words,
 * fee lines, outstanding balance, and the school signature line.
 */
export function buildReceiptPdf(d: ReceiptData, logo: string | null = null): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });

  if (logo) doc.addImage(logo, 'PNG', LEFT, 6, 26, 14.6);

  // Header: logo on the left, school details to its right, receipt number and date at the top right.
  const TEXT_LEFT = 40;
  const TEXT_W = RIGHT - TEXT_LEFT - 34;   // leave room for the receipt number on the right
  doc.setTextColor(...PURPLE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(SCHOOL.name, TEXT_LEFT, 10);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(SCHOOL.tagline, TEXT_LEFT, 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);
  doc.setFontSize(6.8);
  const addr = doc.splitTextToSize(SCHOOL.addresses.join('  •  '), TEXT_W);
  doc.text(addr, TEXT_LEFT, 19);
  const tel = doc.splitTextToSize(`Tel: ${SCHOOL.phones.join(', ')}`, TEXT_W);
  doc.text(tel, TEXT_LEFT, 19 + addr.length * 3.2);
  doc.text(`${SCHOOL.email}  ${SCHOOL.website}`, TEXT_LEFT, 19 + (addr.length + tel.length) * 3.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...PURPLE);
  doc.text(`No. ${d.receiptNumber}`, RIGHT, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(`Date: ${d.date}`, RIGHT, 15.5, { align: 'right' });

  // Banner
  doc.setFillColor(...PURPLE);
  doc.rect(LEFT, 36, 68, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PAYMENT RECEIPT', LEFT + 34, 41.5, { align: 'center' });

  let y = 54;
  const label = (text: string) => {
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(text, LEFT, y);
  };
  const ruled = () => { doc.setDrawColor(...PURPLE); doc.setLineWidth(0.2); doc.line(62, y + 1, RIGHT, y + 1); };

  label('Received with thanks from');
  doc.setFont('helvetica', 'bold');
  doc.text(d.payerName, 64, y);
  ruled();
  y += 9;

  label('The sum of');
  const words = nairaInWordsFromKobo(d.amountKobo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const wrapped = doc.splitTextToSize(words, RIGHT - 64);
  doc.text(wrapped, 64, y);
  ruled();
  y += 4 + wrapped.length * 4.5;

  label('Amount');
  doc.setFont('helvetica', 'bold');
  doc.text(pdfNaira(d.amountKobo), 64, y);
  ruled();
  y += 9;

  label('Being part/full payment for');
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  for (const line of d.lines) {
    if (y > PAGE_H - 34) { doc.addPage('a5', 'landscape'); y = 20; }
    doc.setTextColor(...INK);
    doc.text(line.label, LEFT + 4, y);
    doc.setFont('helvetica', 'bold');
    doc.text(pdfNaira(line.amountKobo), RIGHT, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...PURPLE);
    doc.setLineWidth(0.15);
    doc.line(LEFT, y + 1.5, RIGHT, y + 1.5);
    y += 6;
  }

  // Outstanding balance box and signature
  const boxY = PAGE_H - 30;
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.3);
  doc.rect(RIGHT - 80, boxY, 80, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  const owing = d.outstandingKobo === null ? 'not yet calculated' : pdfNaira(d.outstandingKobo);
  doc.text(`Outstanding balance: ${owing}`, RIGHT - 78, boxY + 6);

  drawSchoolStamp(doc, LEFT + 19, PAGE_H - 20, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`For: ${SCHOOL.name}`, RIGHT, PAGE_H - 12, { align: 'right' });
  doc.line(RIGHT - 70, PAGE_H - 16, RIGHT, PAGE_H - 16);
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('This receipt is issued only for a confirmed payment. Keep it for your records.', LEFT, PAGE_H - 8);

  return doc.output('blob');
}
