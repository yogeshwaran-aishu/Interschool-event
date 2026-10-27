import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { DomainError } from '../../common/errors.js';
import { actor, requireRole } from '../../common/middleware/auth.js';
import { idParam, validate } from '../../common/middleware/validate.js';
import {
  importBody,
  jobIdParam,
  listQuery,
  newPersonBody,
  updatePersonBody,
} from './users.schemas.js';
import type { UsersService } from './users.service.js';

export function usersRouter(service: UsersService): Router {
  const r = Router();
  const admin = requireRole('school_admin');
  const importLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: (req) => req.user!.id,
    handler: () => {
      throw new DomainError('RATE_LIMITED', 'Too many imports. Wait a minute and try again.');
    },
  });

  r.get('/school/users', admin, validate({ query: listQuery }), async (req, res) => {
    res.json(await service.list(actor(req), req.query as never));
  });

  r.post('/school/users', admin, validate({ body: newPersonBody }), async (req, res) => {
    res.status(201).json(await service.addOne(actor(req), req.body, req.id as string));
  });

  r.patch(
    '/school/users/:id',
    admin,
    validate({ params: idParam, body: updatePersonBody }),
    async (req, res) => {
      res.json(
        await service.update(actor(req), req.params['id'] as string, req.body, req.id as string),
      );
    },
  );

  r.post(
    '/school/users/import',
    admin,
    importLimit,
    validate({ body: importBody }),
    async (req, res) => {
      res.status(202).json(await service.queueImport(actor(req), req.body.csv));
    },
  );

  r.get('/school/imports/:jobId', admin, validate({ params: jobIdParam }), async (req, res) => {
    res.json(await service.importStatus(actor(req), req.params['jobId'] as string));
  });

  return r;
}
