import { Router, type CookieOptions, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { actor, authenticate } from '../../common/middleware/auth.js';
import { validate } from '../../common/middleware/validate.js';
import { DomainError } from '../../common/errors.js';
import { AuthService, REFRESH_TTL_DAYS, type Session } from './auth.service.js';

export const REFRESH_COOKIE = 'isc_refresh';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

const loginBody = z
  .object({ loginId: z.string().trim().min(1).max(254), password: z.string().min(1).max(200) })
  .strict();
const changePasswordBody = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) })
  .strict();

function sendSession(res: Response, session: Session): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TTL_DAYS * 86_400_000,
  });
  res.json({ accessToken: session.accessToken, user: session.user });
}

export function authRouter(service: AuthService): Router {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: env.NODE_ENV === 'production' ? 20 : 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: () => {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.');
    },
  });

  r.post('/auth/login', limiter, validate({ body: loginBody }), async (req, res) => {
    const { loginId, password } = req.body as z.infer<typeof loginBody>;
    sendSession(res, await service.login(loginId, password, req.ip ?? 'unknown'));
  });

  r.post('/auth/refresh', limiter, async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
    try {
      sendSession(res, await service.refresh(token));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
      throw err;
    }
  });

  r.post('/auth/logout', async (req, res) => {
    await service.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).end();
  });

  r.get('/auth/me', authenticate, async (req, res) => {
    res.json(await service.me(actor(req).id));
  });

  r.post(
    '/auth/change-password',
    authenticate,
    validate({ body: changePasswordBody }),
    async (req, res) => {
      const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordBody>;
      res.json(await service.changePassword(actor(req), currentPassword, newPassword));
    },
  );

  return r;
}
