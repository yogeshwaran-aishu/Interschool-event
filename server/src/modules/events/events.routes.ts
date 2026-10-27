import { Router } from 'express';
import { actor, requireRole } from '../../common/middleware/auth.js';
import { idParam, validate } from '../../common/middleware/validate.js';
import { toCsv } from '../users/users.csv.js';
import {
  cancelBody,
  coordinatorsBody,
  createEventBody,
  eventDraftBody,
  exportQuery,
  inviteBody,
} from './events.schemas.js';
import type { EventsService } from './events.service.js';

export function eventsRouter(service: EventsService): Router {
  const r = Router();
  const staff = requireRole('school_admin', 'teacher');
  const id = (req: { params: Record<string, unknown> }) => req.params['id'] as string;

  r.get('/events/hosted', staff, async (req, res) => {
    res.json(await service.hosted(actor(req)));
  });

  r.post('/events', staff, validate({ body: createEventBody }), async (req, res) => {
    const { publish, ...draft } = req.body;
    res.status(201).json(await service.create(actor(req), draft, publish, req.id as string));
  });

  r.get('/events/:id', staff, validate({ params: idParam }), async (req, res) => {
    res.json(await service.get(actor(req), id(req)));
  });

  r.patch(
    '/events/:id',
    staff,
    validate({ params: idParam, body: eventDraftBody }),
    async (req, res) => {
      res.json(await service.update(actor(req), id(req), req.body, req.id as string));
    },
  );

  r.post('/events/:id/publish', staff, validate({ params: idParam }), async (req, res) => {
    res.json(await service.publish(actor(req), id(req), req.id as string));
  });

  r.post(
    '/events/:id/cancel',
    staff,
    validate({ params: idParam, body: cancelBody }),
    async (req, res) => {
      res.json(await service.cancel(actor(req), id(req), req.body.reason, req.id as string));
    },
  );

  r.put(
    '/events/:id/coordinators',
    requireRole('school_admin'),
    validate({ params: idParam, body: coordinatorsBody }),
    async (req, res) => {
      res.json(
        await service.setCoordinators(actor(req), id(req), req.body.teacherIds, req.id as string),
      );
    },
  );

  r.post(
    '/events/:id/invitations',
    staff,
    validate({ params: idParam, body: inviteBody }),
    async (req, res) => {
      res
        .status(201)
        .json(await service.invite(actor(req), id(req), req.body.schoolIds, req.id as string));
    },
  );

  r.get('/events/:id/invitations', staff, validate({ params: idParam }), async (req, res) => {
    res.json(await service.invitations(actor(req), id(req)));
  });

  r.post('/invitations/:id/revoke', staff, validate({ params: idParam }), async (req, res) => {
    res.json(await service.revoke(actor(req), id(req), req.id as string));
  });

  r.get('/events/:id/nominations', staff, validate({ params: idParam }), async (req, res) => {
    res.json(await service.nominations(actor(req), id(req)));
  });

  r.get(
    '/events/:id/export',
    staff,
    validate({ params: idParam, query: exportQuery }),
    async (req, res) => {
      const { event, rows } = await service.export(actor(req), id(req), req.id as string);
      if ((req.query as { format: string }).format === 'json') {
        res.json(rows);
        return;
      }
      const slug = event.title.replace(/\W+/g, '-').toLowerCase();
      res
        .type('text/csv; charset=utf-8')
        .attachment(`${slug}-participants.csv`)
        .send(
          '﻿' +
            toCsv([
              ['School', 'Category', 'Student', 'Class'],
              ...rows.map((n) => [n.schoolName, n.categoryName, n.studentName, n.className]),
            ]),
        );
    },
  );

  return r;
}
