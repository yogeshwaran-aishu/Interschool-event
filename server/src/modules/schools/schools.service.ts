import { randomBytes } from 'node:crypto';
import { audit } from '../../common/audit.js';
import { many, one, pool, withTransaction } from '../../common/db.js';
import { DomainError, notFound } from '../../common/errors.js';
import type { AuthUser } from '../../common/middleware/auth.js';
import { notify } from '../../common/notify.js';
import { schoolJson, type SchoolRow, type UserRow } from '../../common/serializers.js';
import { env } from '../../config/env.js';
import { hashPassword } from '../auth/auth.service.js';
import type { NewSchoolInput, UpdateSchoolInput } from './schools.schemas.js';

/** Password for people an admin creates: fixed in development, random (and emailed) otherwise. */
export const initialPassword = () => env.INITIAL_PASSWORD || randomBytes(9).toString('base64url');

export class SchoolsService {
  async list() {
    const rows = await many<SchoolRow & { users: number; events: number }>(
      pool,
      `SELECT s.*,
              (SELECT count(*) FROM users u WHERE u.school_id = s.id) AS users,
              (SELECT count(*) FROM events e WHERE e.host_school_id = s.id) AS events
         FROM schools s ORDER BY s.name`,
    );
    return rows.map((s) => ({ ...schoolJson(s), users: s.users, events: s.events }));
  }

  /** ON-1: creates a school and its first School Admin, who must set a password on first sign-in. */
  async create(me: AuthUser, input: NewSchoolInput, requestId?: string) {
    const password = initialPassword();
    const hash = await hashPassword(password);
    return withTransaction(async (tx) => {
      if (
        await one(tx, 'SELECT 1 FROM users WHERE login_id = $1 OR email = $1', [input.adminEmail])
      )
        throw new DomainError('ALREADY_EXISTS', 'That admin email is already in use.');
      if (
        await one(
          tx,
          'SELECT 1 FROM schools WHERE lower(name) = lower($1) AND lower(city) = lower($2)',
          [input.name, input.city],
        )
      )
        throw new DomainError(
          'ALREADY_EXISTS',
          'A school with that name already exists in that city.',
        );
      const school = (await one<SchoolRow>(
        tx,
        `INSERT INTO schools (name, board, city, address, contact_email, contact_phone)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          input.name,
          input.board,
          input.city,
          input.address,
          input.contactEmail,
          input.contactPhone,
        ],
      ))!;
      const admin = (await one<UserRow>(
        tx,
        `INSERT INTO users (school_id, role, full_name, email, login_id, password_hash)
         VALUES ($1, 'school_admin', $2, $3, $3, $4) RETURNING *`,
        [school.id, input.adminName, input.adminEmail, hash],
      ))!;
      await audit(tx, {
        actorId: me.id,
        schoolId: school.id,
        action: 'school.created',
        entity: 'School',
        entityId: school.id,
        after: schoolJson(school),
        requestId,
      });
      await notify(
        tx,
        [admin.id],
        'account_invite',
        {
          title: 'Welcome to InterSchool Connect',
          body: `You are the School Admin for ${school.name}. Set your password to get started.`,
          link: '/account/password',
        },
        { template: 'account-invite', vars: { loginId: admin.login_id, tempPassword: password } },
      );
      return schoolJson(school);
    });
  }

  async update(me: AuthUser, schoolId: string, input: UpdateSchoolInput, requestId?: string) {
    return withTransaction(async (tx) => {
      const before = await one<SchoolRow>(tx, 'SELECT * FROM schools WHERE id = $1 FOR UPDATE', [
        schoolId,
      ]);
      if (!before) throw notFound('School');
      const next = {
        ...before,
        ...pickDefined({
          name: input.name,
          board: input.board,
          city: input.city,
          address: input.address,
          contact_email: input.contactEmail,
          contact_phone: input.contactPhone,
          status: input.status,
        }),
      };
      const after = (await one<SchoolRow>(
        tx,
        `UPDATE schools SET name = $2, board = $3, city = $4, address = $5, contact_email = $6,
                contact_phone = $7, status = $8 WHERE id = $1 RETURNING *`,
        [
          schoolId,
          next.name,
          next.board,
          next.city,
          next.address,
          next.contact_email,
          next.contact_phone,
          next.status,
        ],
      ))!;
      const action =
        before.status !== after.status
          ? after.status === 'suspended'
            ? 'school.suspended'
            : 'school.reactivated'
          : 'school.updated';
      if (before.status !== after.status && after.status === 'suspended')
        // A suspended school's sessions end now, not when their refresh tokens expire.
        await tx.query(
          `UPDATE refresh_tokens SET revoked_at = now()
            WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE school_id = $1)`,
          [schoolId],
        );
      await audit(tx, {
        actorId: me.id,
        schoolId,
        action,
        entity: 'School',
        entityId: schoolId,
        before: schoolJson(before),
        after: schoolJson(after),
        requestId,
      });
      return schoolJson(after);
    });
  }

  /** Active schools a host can invite: name, city and board only. */
  async directory(me: AuthUser) {
    const rows = await many<SchoolRow>(
      pool,
      `SELECT * FROM schools WHERE status = 'active' AND id <> $1 ORDER BY name`,
      [me.schoolId],
    );
    return rows.map((s) => ({ id: s.id, name: s.name, city: s.city, board: s.board }));
  }
}

function pickDefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
