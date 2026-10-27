import { z } from 'zod';

export const categoryInput = z
  .object({
    name: z.string().trim().min(1, 'Name each category.').max(120),
    minClass: z.number().int().min(1).max(12),
    maxClass: z.number().int().min(1).max(12),
    genderRule: z.enum(['any', 'female', 'male']).default('any'),
    type: z.enum(['solo', 'team']).default('solo'),
    teamSize: z.number().int().min(1).max(20).default(1),
    maxPerSchool: z.number().int().max(1000),
  })
  .strict();

export const eventDraftBody = z
  .object({
    title: z.string().trim().max(200),
    description: z.string().trim().max(5000).default(''),
    venue: z.string().trim().min(1, 'Add a venue.').max(300),
    startsAt: z.iso.datetime({ offset: true }),
    regDeadline: z.iso.datetime({ offset: true }),
    categories: z.array(categoryInput).max(50),
  })
  .strict();
export type EventDraft = z.infer<typeof eventDraftBody>;

export const createEventBody = eventDraftBody
  .extend({ publish: z.boolean().default(false) })
  .strict();

export const cancelBody = z.object({ reason: z.string().trim().max(1000) }).strict();
export const coordinatorsBody = z.object({ teacherIds: z.array(z.uuid()).max(100) }).strict();
export const inviteBody = z.object({ schoolIds: z.array(z.uuid()).min(1).max(200) }).strict();
export const exportQuery = z.object({ format: z.enum(['csv', 'json']).default('csv') }).strict();
