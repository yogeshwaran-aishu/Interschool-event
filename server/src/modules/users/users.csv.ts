/**
 * Server-side CSV checks for people import (ON-2). Mirrors the client preview in
 * projects/web/src/app/core/csv.ts; the server's verdict is the one that counts.
 */

export type Gender = 'female' | 'male' | 'other';

export interface PersonRow {
  line: number;
  role: 'student' | 'teacher';
  name: string;
  email: string;
  phone: string;
  className?: number;
  section?: string;
  admissionNo?: string;
  gender?: Gender;
  guardianName?: string;
  guardianContact?: string;
  consent?: boolean;
}

export interface RowError {
  line: number;
  messages: string[];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell);
          // Prefix formula-like values so spreadsheets don't execute them (CSV injection).
          const safe = /^[=@]|^[+-](?![\d\s])/.test(s) ? `'${s}` : s;
          return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(','),
    )
    .join('\r\n');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePerson(row: Omit<PersonRow, 'line'>, messages: string[]): void {
  if (row.role !== 'student' && row.role !== 'teacher')
    messages.push('Role must be “student” or “teacher”.');
  if (!row.name) messages.push('Name is required.');
  if (!EMAIL.test(row.email)) messages.push('Email is not valid.');
  if (row.role !== 'student') return;
  if (!Number.isInteger(row.className) || row.className! < 1 || row.className! > 12)
    messages.push('Class must be a whole number from 1 to 12.');
  if (!row.section) messages.push('Section is required for students.');
  if (!row.admissionNo) messages.push('Admission number is required for students.');
  if (!row.gender || !['female', 'male', 'other'].includes(row.gender))
    messages.push('Gender must be female, male or other.');
  if (!row.guardianName) messages.push('Guardian name is required for students.');
  if (!row.guardianContact) messages.push('Guardian email or phone is required for students.');
}

/** Parses and checks every row. Uniqueness against the database is checked by the caller. */
export function readPeopleCsv(text: string): { rows: PersonRow[]; errors: RowError[] } {
  const raw = parseCsv(text);
  if (!raw.length) return { rows: [], errors: [{ line: 1, messages: ['The file is empty.'] }] };
  const header = raw[0]!.map((h) => h.trim().toLowerCase());
  const missing = ['role', 'name', 'email'].filter((c) => !header.includes(c));
  if (missing.length)
    return {
      rows: [],
      errors: [{ line: 1, messages: [`Missing column(s): ${missing.join(', ')}.`] }],
    };
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? '').trim();

  const rows: PersonRow[] = [];
  const errors: RowError[] = [];
  raw.slice(1).forEach((r, i) => {
    const line = i + 2;
    const messages: string[] = [];
    const role = col(r, 'role').toLowerCase() as PersonRow['role'];
    const row: PersonRow = {
      line,
      role,
      name: col(r, 'name'),
      email: col(r, 'email').toLowerCase(),
      phone: col(r, 'phone'),
    };
    if (role === 'student') {
      const consent = col(r, 'consent').toLowerCase();
      if (!['yes', 'no', 'true', 'false', 'y', 'n'].includes(consent))
        messages.push('Consent must be yes or no.');
      Object.assign(row, {
        className: col(r, 'class') === '' ? NaN : Number(col(r, 'class')),
        section: col(r, 'section').toUpperCase(),
        admissionNo: col(r, 'admission_no'),
        gender: col(r, 'gender').toLowerCase(),
        guardianName: col(r, 'guardian_name'),
        guardianContact: col(r, 'guardian_contact'),
        consent: ['yes', 'true', 'y'].includes(consent),
      });
    }
    validatePerson(row, messages);
    if (messages.length) errors.push({ line, messages });
    else rows.push(row);
  });
  return { rows, errors };
}
