import type { jsPDF } from 'jspdf';

const STAMP: [number, number, number] = [91, 33, 182];

/** Draws a lightweight, print-friendly school stamp without an image asset or extra package. */
export function drawSchoolStamp(doc: jsPDF, x: number, y: number, radius = 10): void {
  doc.setDrawColor(...STAMP);
  doc.setTextColor(...STAMP);
  doc.setLineWidth(0.45);
  doc.circle(x, y, radius, 'S');
  doc.setLineWidth(0.2);
  doc.circle(x, y, radius - 1.4, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.4);
  doc.text('TREASURE CORNER', x, y - 3, { align: 'center' });
  doc.setFontSize(5.1);
  doc.text('SCHOOLS', x, y + 0.5, { align: 'center' });
  doc.setFontSize(4);
  doc.text('SCHOOL VERIFIED', x, y + 4, { align: 'center' });
}
