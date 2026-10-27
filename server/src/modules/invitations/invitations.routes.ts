import { Router } from 'express';
import { z } from 'zod';
import { actor, requireRole } from '../../common/middleware/auth.js';
import { idParam, validate } from '../../common/middleware/validate.js';
import { coordinatorsBody } from '../events/events.schemas.js';
import type { InvitationsService } from './invitations.service.js';

const respondBody = z.object({ note: z.string().trim().max(1000).default('') }).strict();

export function invitationsRouter(service: InvitationsService): Router {
  const r = Router();
  const id = (req: { params: Record<string, unknown> }) => req.params['id'] as string;

  r.get('/invitations/received', requireRole('school_admin', 'teacher'), async (req, res) => {
    res.json(await service.received(actor(req)));
  });

  r.post(
    '/invitations/:id/accept',
    requireRole('school_admin'),
    validate({ params: idParam, body: respondBody }),
    async (req, res) => {
      res.json(await service.respond(actor(req), id(req), true, req.body.note, req.id as string));
    },
  );

  r.post(
    '/invitations/:id/reject',
    requireRole('school_admin'),
    validate({ params: idParam, body: respondBody }),
    async (req, res) => {
      res.json(await service.respond(actor(req), id(req), false, req.body.note, req.id as string));
    },
  );

  r.put(
    '/invitations/:id/coordinators',
    requireRole('school_admin'),
    validate({ params: idParam, body: coordinatorsBody }),
    async (req, res) => {
      res.json(
        await service.setCoordinators(actor(req), id(req), req.body.teacherIds, req.id as string),
      );
    },
  );

  r.post(
    '/invitations/:id/submit',
    requireRole('school_admin', 'teacher'),
    validate({ params: idParam }),
    async (req, res) => {
      res.json(await service.submit(actor(req), id(req), req.id as string));
    },
  );

  return r;
}
