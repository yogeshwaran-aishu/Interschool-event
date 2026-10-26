import { parseCsv, toCsv, validatePeopleCsv } from './csv';

const HEADER =
  'role,name,email,phone,class,section,admission_no,gender,guardian_name,guardian_contact,consent';

describe('parseCsv', () => {
  it('handles quoted fields, escaped quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n,\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('toCsv', () => {
  it('quotes fields with commas and neutralises spreadsheet formulas', () => {
    expect(toCsv([['x,y', '=SUM(A1)', '+91 98000']])).toBe('"x,y",\'=SUM(A1),+91 98000');
  });
});

describe('validatePeopleCsv', () => {
  const none = new Set<string>();

  it('accepts a complete student row and a teacher row', () => {
    const csv = [
      HEADER,
      'student,Ananya Kapoor,ananya@x.test,,9,b,LV-1,female,Ritu Kapoor,ritu@x.test,yes',
      'teacher,Sameer Khan,sameer@x.test,,,,,,,,',
    ].join('\n');
    const { valid, errors } = validatePeopleCsv(csv, none, none);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(2);
    expect(valid[0]).toMatchObject({ role: 'student', className: 9, section: 'B', consent: true });
  });

  it('reports every problem on a row with its line number', () => {
    const csv = [HEADER, 'pupil,,not-an-email,,15,,,unknown,,,maybe'].join('\n');
    const { valid, errors } = validatePeopleCsv(csv, none, none);
    expect(valid).toEqual([]);
    expect(errors[0].line).toBe(2);
    expect(errors[0].messages).toEqual(
      expect.arrayContaining([
        'Role must be “student” or “teacher”.',
        'Name is required.',
        'Email is not valid.',
      ]),
    );
  });

  it('rejects emails and admission numbers already in use or repeated in the file', () => {
    const csv = [
      HEADER,
      'student,A,a@x.test,,9,A,LV-1,male,G,g@x.test,yes',
      'student,B,a@x.test,,9,A,LV-1,male,G,g@x.test,yes',
      'teacher,C,taken@x.test,,,,,,,,',
    ].join('\n');
    const { valid, errors } = validatePeopleCsv(csv, new Set(['taken@x.test']), none);
    expect(valid).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it('fails fast when required columns are missing', () => {
    const { errors } = validatePeopleCsv('name,email\nA,a@x.test', none, none);
    expect(errors[0].messages[0]).toContain('role');
  });
});
