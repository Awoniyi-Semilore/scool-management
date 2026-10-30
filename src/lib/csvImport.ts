/**
 * PUPIL CSV IMPORT (pure, no Firebase).
 * Expected header: admission_number,first_name,last_name,class
 * Rows are validated first; nothing is written unless the admin confirms.
 */

export interface ImportRow {
  line: number;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className: string;
  classId: string | null;
  errors: string[];
}

export interface ImportPlan {
  rows: ImportRow[];
  validRows: ImportRow[];
  fatalError: string | null;
}

const REQUIRED = ['admission_number', 'first_name', 'last_name', 'class'] as const;

/** RFC-4180-style parser: handles quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function planPupilImport(
  csvText: string,
  classes: { id: string; name: string }[],
  existingAdmissionNumbers: Set<string>,
): ImportPlan {
  const table = parseCsv(csvText);
  if (table.length < 2) {
    return { rows: [], validRows: [], fatalError: 'The file needs a header row and at least one pupil.' };
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) {
    return { rows: [], validRows: [], fatalError: `Missing column(s): ${missing.join(', ')}. Use the sample file as a template.` };
  }
  const idx = Object.fromEntries(REQUIRED.map((h) => [h, header.indexOf(h)])) as Record<(typeof REQUIRED)[number], number>;
  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const seenInFile = new Map<string, number>();

  const rows: ImportRow[] = table.slice(1).map((cells, i) => {
    const get = (k: (typeof REQUIRED)[number]) => (cells[idx[k]] ?? '').trim();
    const admissionNumber = get('admission_number').toUpperCase();
    const className = get('class');
    const classId = classByName.get(className.toLowerCase()) ?? null;
    const errors: string[] = [];
    if (!get('first_name')) errors.push('First name is missing.');
    if (!get('last_name')) errors.push('Last name is missing.');
    if (!classId) errors.push(`Class "${className}" does not exist. Create it first.`);
    if (admissionNumber) {
      if (existingAdmissionNumbers.has(admissionNumber)) errors.push(`Admission number ${admissionNumber} already exists.`);
      const first = seenInFile.get(admissionNumber);
      if (first !== undefined) errors.push(`Admission number ${admissionNumber} is duplicated in this file (also on row ${first}).`);
      else seenInFile.set(admissionNumber, i + 2);
    }
    return { line: i + 2, admissionNumber, firstName: get('first_name'), lastName: get('last_name'), className, classId, errors };
  });

  return { rows, validRows: rows.filter((r) => r.errors.length === 0), fatalError: null };
}
