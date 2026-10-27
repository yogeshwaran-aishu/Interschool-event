import { z } from 'zod';

const text = (max = 200) => z.string().trim().min(1, 'Required.').max(max);

export const newSchoolBody = z
  .object({
    name: text(),
    board: text(40),
    city: text(80),
    address: text(400),
    contactEmail: z.email('Enter a valid email.').trim().toLowerCase(),
    contactPhone: z.string().trim().max(40).default(''),
    adminName: text(),
    adminEmail: z.email('Enter a valid email.').trim().toLowerCase(),
  })
  .strict();
export type NewSchoolInput = z.infer<typeof newSchoolBody>;

export const updateSchoolBody = z
  .object({
    name: text().optional(),
    board: text(40).optional(),
    city: text(80).optional(),
    address: text(400).optional(),
    contactEmail: z.email().trim().toLowerCase().optional(),
    contactPhone: z.string().trim().max(40).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .strict();
export type UpdateSchoolInput = z.infer<typeof updateSchoolBody>;
