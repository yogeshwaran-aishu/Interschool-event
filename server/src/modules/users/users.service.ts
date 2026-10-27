import { audit } from '../../common/audit.js';
import { many, one, pool, withTransaction, type Db } from '../../common/db.js';
import { DomainError, notFound } from '../../common/errors.js';
import { enqueue } from '../../common/jobs.js';
import type { AuthUser } from '../../common/middleware/auth.js';
import { notify } from '../../common/notify.js';
import { profileJson, userJson, type ProfileRow, type UserRow } from '../../common/serializers.js';
import { hashPassword } from '../auth/auth.service.js';
import { initialPassword } from '../schools/schools.service.js';
import { readPeopleCsv, validatePerson, type PersonRow, type RowError } from './users.csv.js';
import type { NewPersonInput, UpdatePersonInput } from './users.schemas.js';

const BATCH = 500;

export interface ImportResult {
  created: number;
  errors: RowError[];
}

export class UsersService {
  async list(me: AuthUser, q: { role?: string; q?: string; cursor?: string; limit: number }) {
    const [afterName, afterId] = q.cursor
      ? Buffer.from(q.cursor, 'base64url').toString().split('\u0000')
      : [];
    const rows = await many<UserRow & Partial<ProfileRow>>(
      pool,
      `SELECT u.*, p.admission_no, p.class, p.section, p.gender, p.guardian_name, p.guardian_email,
              p.guardian_phone, p.parental_consent, p.user_id
         FROM users u LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.school_id = $1
          AND ($2::user_role IS NULL OR u.role = $2)
          AND ($3::text IS NULL OR u.full_name ILIKE '%' || $3 || '%' OR p.admission_no ILIKE '%' || $3 || '%')
          AND ($4::text IS NULL OR (u.full_name, u.id) > ($4, $5::uuid))
        ORDER BY u.full_name, u.id LIMIT $6`,
      [me.schoolId, q.role ?? null, q.q || null, afterName ?? null, afterId ?? null, q.limit + 1],
    );
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        ...userJson(r),
        profile: r.user_id ? profileJson(r as ProfileRow) : undefined,
      })),
      nextCursor:
        rows.length > q.limit && last
          ? Buffer.from(`${last.full_name}\u0000${last.id}`).toString('base64url')
          : null,
    };
  }

  /** Adds one teacher or student to the caller's school. */
  async addOne(me: AuthUser, input: NewPersonInput, requestId?: string) {
    const messages: string[] = [];
    validatePerson(input, messages);
    if (input.role === 'student' && input.consent === undefined)
      messages.push('Record whether the guardian consented.');
    if (messages.length) throw new DomainError('VALIDATION_FAILED', messages.join(' '));
    const row: PersonRow = { ...input, line: 1 };
    return withTransaction(async (tx) => {
      const clashes = await this.uniquenessErrors(tx, me.schoolId!, [row]);
      if (clashes.length) throw new DomainError('ALREADY_EXISTS', clashes[0]!.messages.join(' '));
      const [created] = await this.createPeople(tx, me, [row]);
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'user.created',
        entity: 'User',
        entityId: created!.id,
        after: { role: row.role, name: row.name },
        requestId,
      });
      return created;
    });
  }

  /** Queues a CSV import; the worker validates rows, creates users in batches and stores row errors. */
  async queueImport(me: AuthUser, csv: string): Promise<{ jobId: string }> {
    const jobId = await withTransaction((tx) =>
      enqueue(
        tx,
        'users.import',
        { csv, actorId: me.id, schoolId: me.schoolId },
        { createdBy: me.id, schoolId: me.schoolId, maxAttempts: 1 },
      ),
    );
    return { jobId };
  }

  async importStatus(me: AuthUser, jobId: string) {
    const job = await one<{
      status: string;
      result: ImportResult | null;
      last_error: string | null;
    }>(
      pool,
      `SELECT status, result, last_error FROM jobs WHERE id = $1 AND name = 'users.import' AND school_id = $2`,
      [jobId, me.schoolId],
    );
    if (!job) throw notFound('Import');
    return { jobId, status: job.status, result: job.result, error: job.last_error };
  }

  /** Job body for users.import. */
  async runImport(payload: {
    csv: string;
    actorId: string;
    schoolId: string;
  }): Promise<ImportResult> {
    const me: AuthUser = { id: payload.actorId, role: 'school_admin', schoolId: payload.schoolId };
    const { rows, errors } = readPeopleCsv(payload.csv);
    const clashes = await this.uniquenessErrors(pool, me.schoolId!, rows);
    const bad = new Set(clashes.map((c) => c.line));
    const valid = rows.filter((r) => !bad.has(r.line));
    let created = 0;
    for (let i = 0; i < valid.length; i += BATCH) {
      const batch = valid.slice(i, i + BATCH);
      await withTransaction(async (tx) => {
        await this.createPeople(tx, me, batch);
        await audit(tx, {
          actorId: me.id,
          schoolId: me.schoolId,
          action: 'people.imported',
          entity: 'User',
          entityId: `${batch.length} rows`,
          after: { count: batch.length },
        });
      });
      created += batch.length;
    }
    return { created, errors: [...errors, ...clashes].sort((a, b) => a.line - b.line) };
  }

  async update(me: AuthUser, userId: string, input: UpdatePersonInput, requestId?: string) {
    return withTransaction(async (tx) => {
      const before = await one<UserRow>(
        tx,
        'SELECT * FROM users WHERE id = $1 AND school_id = $2 FOR UPDATE',
        [userId, me.schoolId],
      );
      if (!before || before.role === 'app_admin') throw notFound('Person');
      if (input.canHostEvents !== undefined && before.role !== 'teacher')
        throw new DomainError(
          'VALIDATION_FAILED',
          'Only teachers can be allowed to create events.',
        );
      if (input.status === 'suspended' && before.id === me.id)
        throw new DomainError('VALIDATION_FAILED', 'You cannot suspend your own account.');
      const after = (await one<UserRow>(
        tx,
        `UPDATE users SET can_host_events = COALESCE($2, can_host_events),
                status = COALESCE($3::user_status, status) WHERE id = $1 RETURNING *`,
        [userId, input.canHostEvents ?? null, input.status ?? null],
      ))!;
      if (input.consent !== undefined && before.role === 'student')
        await tx.query(
          `UPDATE student_profiles SET parental_consent = $2,
                  consent_recorded_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE user_id = $1`,
          [userId, input.consent],
        );
      if (input.status === 'suspended')
        await tx.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [userId],
        );
      const action =
        input.canHostEvents !== undefined ? 'teacher.permissions_changed' : 'user.updated';
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action,
        entity: 'User',
        entityId: userId,
        before: { canHostEvents: before.can_host_events, status: before.status },
        after: { ...input },
        requestId,
      });
      return userJson(after);
    });
  }

  /** Emails and admission numbers already taken (globally / per school), or repeated within the file. */
  private async uniquenessErrors(db: Db, schoolId: string, rows: PersonRow[]): Promise<RowError[]> {
    const taken = new Set(
      (
        await many<{ login_id: string }>(
          db,
          'SELECT login_id FROM users WHERE login_id = ANY($1::citext[]) OR email = ANY($1::citext[])',
          [rows.map((r) => r.email)],
        )
      ).map((r) => r.login_id.toLowerCase()),
    );
    const admissions = new Set(
      (
        await many<{ admission_no: string }>(
          db,
          'SELECT admission_no FROM student_profiles WHERE school_id = $1 AND admission_no = ANY($2)',
          [schoolId, rows.map((r) => r.admissionNo).filter(Boolean)],
        )
      ).map((r) => r.admission_no),
    );
    const seenEmail = new Set<string>();
    const seenAdmission = new Set<string>();
    const errors: RowError[] = [];
    for (const r of rows) {
      const messages: string[] = [];
      if (taken.has(r.email) || seenEmail.has(r.email)) messages.push('Email is already in use.');
      if (r.admissionNo && (admissions.has(r.admissionNo) || seenAdmission.has(r.admissionNo)))
        messages.push('Admission number is already in use.');
      seenEmail.add(r.email);
      if (r.admissionNo) seenAdmission.add(r.admissionNo);
      if (messages.length) errors.push({ line: r.line, messages });
    }
    return errors;
  }

  private async createPeople(tx: Db, me: AuthUser, rows: PersonRow[]) {
    const password = initialPassword();
    const hash = await hashPassword(password);
    const created: ReturnType<typeof userJson>[] = [];
    for (const r of rows) {
      const user = (await one<UserRow>(
        tx,
        `INSERT INTO users (school_id, role, full_name, email, phone, login_id, password_hash)
         VALUES ($1, $2, $3, $4, NULLIF($5, ''), $4, $6) RETURNING *`,
        [me.schoolId, r.role, r.name, r.email, r.phone, hash],
      ))!;
      if (r.role === 'student') {
        const isEmail = r.guardianContact!.includes('@');
        await tx.query(
          `INSERT INTO student_profiles (user_id, school_id, admission_no, class, section, gender, guardian_name,
                                         guardian_email, guardian_phone, parental_consent, consent_recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 THEN now() END)`,
          [
            user.id,
            me.schoolId,
            r.admissionNo,
            r.className,
            r.section ?? '',
            r.gender,
            r.guardianName,
            isEmail ? r.guardianContact : null,
            isEmail ? null : r.guardianContact,
            !!r.consent,
          ],
        );
      }
      await notify(
        tx,
        [user.id],
        'account_invite',
        {
          title: 'Welcome to InterSchool Connect',
          body: 'Your school added you to InterSchool Connect.',
          link: '/account/password',
        },
        { template: 'account-invite', vars: { loginId: user.login_id, tempPassword: password } },
      );
      created.push(userJson(user));
    }
    return created;
  }
}
