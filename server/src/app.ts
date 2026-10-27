import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { pool } from './common/db.js';
import { errorHandler, notFoundHandler } from './common/errors.js';
import { logger } from './common/logger.js';
import { authenticate } from './common/middleware/auth.js';
import { idempotency } from './common/middleware/idempotency.js';
import { env } from './config/env.js';
import { createContainer, type Container } from './container.js';
import { resetDatabase } from './db/seed.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { invitationsRouter } from './modules/invitations/invitations.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { registrationsRouter } from './modules/registrations/registrations.routes.js';
import { auditRouter } from './modules/reports/audit.routes.js';
import { schoolsRouter } from './modules/schools/schools.routes.js';
import { stateRouter } from './modules/state/state.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApp(c: Container = createContainer()) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || `req_${randomUUID().slice(0, 12)}`;
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customProps: (req) => ({ userId: req.user?.id, schoolId: req.user?.schoolId }),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  });

  const api = Router();
  // Public routes first; everything mounted after `authenticate` fails closed.
  api.use(authRouter(c.auth));
  if (env.ALLOW_DEMO_RESET)
    api.post('/dev/reset', async (_req, res) => {
      await resetDatabase();
      res.status(204).end();
    });
  api.use(authenticate, idempotency);
  api.use(stateRouter());
  api.use(schoolsRouter(c.schools));
  api.use(usersRouter(c.users));
  api.use(eventsRouter(c.events));
  api.use(invitationsRouter(c.invitations));
  api.use(registrationsRouter(c.registrations));
  api.use(notificationsRouter());
  api.use(auditRouter());
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
