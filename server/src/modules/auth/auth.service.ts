import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { audit } from '../../common/audit.js';
import { many, one, pool, withTransaction, type Db } from '../../common/db.js';
import { DomainError } from '../../common/errors.js';
import { signAccessToken, type AuthUser } from '../../common/middleware/auth.js';
import { userJson, type UserRow } from '../../common/serializers.js';

export const REFRESH_TTL_DAYS = 30;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: ReturnType<typeof userJson>;
}

const BAD_CREDENTIALS =
  'That email and password do not match an account. Check both and try again.';

export class AuthService {
  async login(loginId: string, password: string, ip: string): Promise<Session> {
    const [failures] = await many<{ account: number; by_ip: number }>(
      pool,
      `SELECT count(*) FILTER (WHERE login_id = $1) AS account,
              count(*) FILTER (WHERE ip = $2) AS by_ip
         FROM login_failures WHERE at > now() - interval '15 minutes'`,
      [loginId, ip],
    );
    if (failures!.account >= MAX_FAILURES_PER_ACCOUNT || failures!.by_ip >= MAX_FAILURES_PER_IP)
      throw new DomainError(
        'RATE_LIMITED',
        'Too many failed attempts. Wait 15 minutes and try again, or ask your school office to reset your password.',
      );

    const user = await one<
      UserRow & {
        password_hash: string | null;
        school_status: string | null;
        consent: boolean | null;
      }
    >(
      pool,
      `SELECT u.*, s.status AS school_status, p.parental_consent AS consent
         FROM users u
         LEFT JOIN schools s ON s.id = u.school_id
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.login_id = $1`,
      [loginId],
    );
    const ok = !!user?.password_hash && (await argon2.verify(user.password_hash, password));
    if (!user || !ok) {
      await pool.query('INSERT INTO login_failures (login_id, ip) VALUES ($1, $2)', [loginId, ip]);
      // One message for unknown email and wrong password, so accounts can't be enumerated.
      throw new DomainError('INVALID_CREDENTIALS', BAD_CREDENTIALS);
    }
    this.assertCanSignIn(user);
    await pool.query('DELETE FROM login_failures WHERE login_id = $1', [loginId]);
    return this.issue(pool, user, randomUUID());
  }

  /** Rotates the refresh token. Presenting a used token revokes its whole family (theft detection). */
  async refresh(refreshToken: string): Promise<Session> {
    const result = await withTransaction(async (tx) => {
      const token = await one<{
        id: string;
        user_id: string;
        family_id: string;
        expired: boolean;
        used_at: string | null;
        revoked_at: string | null;
      }>(
        tx,
        `SELECT id, user_id, family_id, expires_at < now() AS expired, used_at, revoked_at
           FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [sha256(refreshToken)],
      );
      if (!token) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
      // Reuse: return the family so it is revoked outside this transaction (a throw would roll it back).
      if (token.used_at || token.revoked_at) return { reusedFamily: token.family_id };
      if (token.expired)
        throw new DomainError('UNAUTHENTICATED', 'Your session expired. Sign in again.');
      await tx.query('UPDATE refresh_tokens SET used_at = now() WHERE id = $1', [token.id]);
      const user = await one<UserRow & { school_status: string | null; consent: boolean | null }>(
        tx,
        `SELECT u.*, s.status AS school_status, p.parental_consent AS consent
           FROM users u LEFT JOIN schools s ON s.id = u.school_id
           LEFT JOIN student_profiles p ON p.user_id = u.id WHERE u.id = $1`,
        [token.user_id],
      );
      if (!user) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
      this.assertCanSignIn(user);
      return this.issue(tx, user, token.family_id);
    });
    if ('reusedFamily' in result) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
        [result.reusedFamily],
      );
      throw new DomainError('UNAUTHENTICATED', 'Your session ended. Sign in again.');
    }
    return result;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1) AND revoked_at IS NULL`,
      [sha256(refreshToken)],
    );
  }

  async changePassword(me: AuthUser, current: string, next: string) {
    const user = await one<UserRow & { password_hash: string | null }>(
      pool,
      'SELECT * FROM users WHERE id = $1',
      [me.id],
    );
    if (!user?.password_hash || !(await argon2.verify(user.password_hash, current)))
      throw new DomainError('VALIDATION_FAILED', 'Your current password is not correct.', {
        fields: [{ path: 'currentPassword', message: 'Not correct.' }],
      });
    if (next.length < 8) throw new DomainError('VALIDATION_FAILED', 'Use at least 8 characters.');
    if (next === current)
      throw new DomainError(
        'VALIDATION_FAILED',
        'Choose a password different from your current one.',
      );
    const hash = await hashPassword(next);
    return withTransaction(async (tx) => {
      const updated = await one<UserRow>(
        tx,
        `UPDATE users SET password_hash = $2, must_change_password = false,
                status = CASE WHEN status = 'invited' THEN 'active'::user_status ELSE status END
          WHERE id = $1 RETURNING *`,
        [me.id, hash],
      );
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'user.password_changed',
        entity: 'User',
        entityId: me.id,
      });
      return userJson(updated!);
    });
  }

  async me(userId: string) {
    const user = await one<UserRow>(pool, 'SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
    return userJson(user);
  }

  private assertCanSignIn(
    user: UserRow & { school_status: string | null; consent: boolean | null },
  ): void {
    if (user.status === 'suspended')
      throw new DomainError(
        'ACCOUNT_SUSPENDED',
        'This account is suspended. Contact your school office.',
      );
    if (user.school_status === 'suspended')
      throw new DomainError(
        'SCHOOL_SUSPENDED',
        'Your school is suspended on InterSchool Connect. Contact the platform team.',
      );
    if (user.role === 'student' && !user.consent)
      throw new DomainError(
        'CONSENT_PENDING',
        'Your account activates once your school records guardian consent.',
      );
  }

  private async issue(db: Db, user: UserRow, familyId: string): Promise<Session> {
    const refreshToken = randomBytes(32).toString('base64url');
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
      [user.id, sha256(refreshToken), familyId, REFRESH_TTL_DAYS],
    );
    return {
      accessToken: signAccessToken({ id: user.id, role: user.role, schoolId: user.school_id }),
      refreshToken,
      user: userJson(user),
    };
  }
}
