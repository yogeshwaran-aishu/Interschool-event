import { z } from 'zod';

export const newPersonBody = z
  .object({
    role: z.enum(['student', 'teacher']),
    name: z.string().trim().min(1).max(200),
    email: z.email('Enter a valid email.').trim().toLowerCase(),
    phone: z.string().trim().max(40).default(''),
    className: z.number().int().min(1).max(12).optional(),
    section: z.string().trim().max(10).optional(),
    admissionNo: z.string().trim().max(40).optional(),
    gender: z.enum(['female', 'male', 'other']).optional(),
    guardianName: z.string().trim().max(200).optional(),
    guardianContact: z.string().trim().max(254).optional(),
    consent: z.boolean().optional(),
  })
  .strict();
export type NewPersonInput = z.infer<typeof newPersonBody>;

export const importBody = z.object({ csv: z.string().min(1).max(2_000_000) }).strict();

export const updatePersonBody = z
  .object({
    canHostEvents: z.boolean().optional(),
    status: z.enum(['active', 'suspended']).optional(),
    consent: z.boolean().optional(),
  })
  .strict();
export type UpdatePersonInput = z.infer<typeof updatePersonBody>;

export const listQuery = z
  .object({
    role: z.enum(['student', 'teacher', 'school_admin']).optional(),
    q: z.string().trim().max(100).optional(),
    cursor: z.string().max(400).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const jobIdParam = z.object({ jobId: z.uuid() }).strict();
