import { Router } from 'express';
import { z } from 'zod';
import { actor, requireRole } from '../../common/middleware/auth.js';
import { idParam, validate } from '../../common/middleware/validate.js';
import type { RegistrationsService } from './registrations.service.js';

const applyBody = z.object({ categoryId: z.uuid() }).strict();
const decideBody = z.object({ reason: z.string().trim().max(1000).default('') }).strict();
const listQuery = z.object({ eventId: z.uuid().optional() }).strict();

export function registrationsRouter(service: RegistrationsService): Router {
  const r = Router();
  const student = requireRole('student');
  const staff = requireRole('school_admin', 'teacher');
  const id = (req: { params: Record<string, unknown> }) => req.params['id'] as string;

  r.get('/student/events', student, async (req, res) => {
    res.json(await service.studentEvents(actor(req)));
  });

  r.post('/registrations', student, validate({ body: applyBody }), async (req, res) => {
    res.status(201).json(await service.apply(actor(req), req.body.categoryId, req.id as string));
  });

  r.post(
    '/registrations/:id/withdraw',
    student,
    validate({ params: idParam }),
    async (req, res) => {
      res.json(await service.withdraw(actor(req), id(req), req.id as string));
    },
  );

  r.get('/school/registrations', staff, validate({ query: listQuery }), async (req, res) => {
    res.json(await service.schoolList(actor(req), (req.query as { eventId?: string }).eventId));
  });

  r.post(
    '/registrations/:id/school-approve',
    staff,
    validate({ params: idParam }),
    async (req, res) => {
      res.json(await service.schoolDecide(actor(req), id(req), true, '', req.id as string));
    },
  );

  r.post(
    '/registrations/:id/school-reject',
    staff,
    validate({ params: idParam, body: decideBody }),
    async (req, res) => {
      res.json(
        await service.schoolDecide(actor(req), id(req), false, req.body.reason, req.id as string),
      );
    },
  );

  r.post(
    '/registrations/:id/host-confirm',
    staff,
    validate({ params: idParam }),
    async (req, res) => {
      res.json(await service.hostDecide(actor(req), id(req), true, '', req.id as string));
    },
  );

  r.post(
    '/registrations/:id/host-reject',
    staff,
    validate({ params: idParam, body: decideBody }),
    async (req, res) => {
      res.json(
        await service.hostDecide(actor(req), id(req), false, req.body.reason, req.id as string),
      );
    },
  );

  return r;
}
