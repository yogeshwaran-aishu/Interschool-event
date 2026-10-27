import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { DomainError } from '../errors.js';

export type Role = 'app_admin' | 'school_admin' | 'teacher' | 'student';

/** Claims carried by the 15-minute access token. */
export interface AuthUser {
  id: string;
  role: Role;
  schoolId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ role: user.role, schoolId: user.schoolId }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** Verifies the bearer token and sets req.user. Every router except login/refresh sits behind it. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    req.user = { id: claims.sub!, role: claims['role'], schoolId: claims['schoolId'] ?? null };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError)
      throw new DomainError('TOKEN_EXPIRED', 'Your session expired. Sign in again.');
    throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
  }
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      throw new DomainError('FORBIDDEN_ROLE', 'You do not have permission to do that.');
    next();
  };
}

/** For handlers behind `authenticate`: the caller, never undefined. */
export function actor(req: Express.Request): AuthUser {
  if (!req.user) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
  return req.user;
}
