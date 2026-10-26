import { Gender, Role } from './models';

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF. */
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
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
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

export interface PersonImportRow {
  line: number;
  role: Extract<Role, 'student' | 'teacher'>;
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

export interface ImportRowError {
  line: number;
  messages: string[];
}

export const IMPORT_COLUMNS = [
  'role',
  'name',
  'email',
  'phone',
  'class',
  'section',
  'admission_no',
  'gender',
  'guardian_name',
  'guardian_contact',
  'consent',
] as const;

export const IMPORT_TEMPLATE = toCsv([
  [...IMPORT_COLUMNS],
  [
    'student',
    'Ananya Kapoor',
    'ananya@lakeview.test',
    '',
    9,
    'B',
    'LV-2019-120',
    'female',
    'Ritu Kapoor',
    'ritu@example.test',
    'yes',
  ],
  ['teacher', 'Sameer Khan', 'sameer@lakeview.test', '+91 98000 00000', '', '', '', '', '', '', ''],
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an import file row by row (ON-2). Valid rows are returned for creation and
 * every invalid row is reported with its line number, so the school can fix and re-upload.
 */
export function validatePeopleCsv(
  text: string,
  existingEmails: ReadonlySet<string>,
  existingAdmissionNos: ReadonlySet<string>,
): { valid: PersonImportRow[]; errors: ImportRowError[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { valid: [], errors: [{ line: 1, messages: ['The file is empty.'] }] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ['role', 'name', 'email'].filter((c) => !header.includes(c));
  if (missing.length) {
    return {
      valid: [],
      errors: [{ line: 1, messages: [`Missing column(s): ${missing.join(', ')}.`] }],
    };
  }
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? '').trim();

  const seenEmails = new Set<string>();
  const seenAdmission = new Set<string>();
  const valid: PersonImportRow[] = [];
  const errors: ImportRowError[] = [];

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const messages: string[] = [];
    const role = col(r, 'role').toLowerCase();
    const name = col(r, 'name');
    const email = col(r, 'email').toLowerCase();

    if (role !== 'student' && role !== 'teacher')
      messages.push('Role must be “student” or “teacher”.');
    if (!name) messages.push('Name is required.');
    if (!EMAIL.test(email)) messages.push('Email is not valid.');
    else if (existingEmails.has(email) || seenEmails.has(email))
      messages.push('Email is already in use.');

    const row: PersonImportRow = {
      line,
      role: role as PersonImportRow['role'],
      name,
      email,
      phone: col(r, 'phone'),
    };

    if (role === 'student') {
      const cls = Number(col(r, 'class'));
      const admissionNo = col(r, 'admission_no');
      const gender = col(r, 'gender').toLowerCase();
      const consent = col(r, 'consent').toLowerCase();
      if (!Number.isInteger(cls) || cls < 1 || cls > 12)
        messages.push('Class must be a whole number from 1 to 12.');
      if (!col(r, 'section')) messages.push('Section is required for students.');
      if (!admissionNo) messages.push('Admission number is required for students.');
      else if (existingAdmissionNos.has(admissionNo) || seenAdmission.has(admissionNo))
        messages.push('Admission number is already in use.');
      if (!['female', 'male', 'other'].includes(gender))
        messages.push('Gender must be female, male or other.');
      if (!col(r, 'guardian_name')) messages.push('Guardian name is required for students.');
      if (!col(r, 'guardian_contact'))
        messages.push('Guardian email or phone is required for students.');
      if (!['yes', 'no', 'true', 'false', 'y', 'n'].includes(consent))
        messages.push('Consent must be yes or no.');
      Object.assign(row, {
        className: cls,
        section: col(r, 'section').toUpperCase(),
        admissionNo,
        gender: gender as Gender,
        guardianName: col(r, 'guardian_name'),
        guardianContact: col(r, 'guardian_contact'),
        consent: ['yes', 'true', 'y'].includes(consent),
      });
      if (admissionNo) seenAdmission.add(admissionNo);
    }

    if (EMAIL.test(email)) seenEmails.add(email);
    if (messages.length) errors.push({ line, messages });
    else valid.push(row);
  });

  return { valid, errors };
}
