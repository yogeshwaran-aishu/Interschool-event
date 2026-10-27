import { Router } from 'express';
import { actor, requireRole } from '../../common/middleware/auth.js';
import { idParam, validate } from '../../common/middleware/validate.js';
import { newSchoolBody, updateSchoolBody } from './schools.schemas.js';
import type { SchoolsService } from './schools.service.js';

export function schoolsRouter(service: SchoolsService): Router {
  const r = Router();

  r.get('/admin/schools', requireRole('app_admin'), async (_req, res) => {
    res.json(await service.list());
  });

  r.post(
    '/admin/schools',
    requireRole('app_admin'),
    validate({ body: newSchoolBody }),
    async (req, res) => {
      res.status(201).json(await service.create(actor(req), req.body, req.id as string));
    },
  );

  r.patch(
    '/admin/schools/:id',
    requireRole('app_admin'),
    validate({ params: idParam, body: updateSchoolBody }),
    async (req, res) => {
      res.json(
        await service.update(actor(req), req.params['id'] as string, req.body, req.id as string),
      );
    },
  );

  r.get('/schools/directory', requireRole('school_admin', 'teacher'), async (req, res) => {
    res.json(await service.directory(actor(req)));
  });

  return r;
}
