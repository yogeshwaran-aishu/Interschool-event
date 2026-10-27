import type { RequestHandler } from 'express';
import { z } from 'zod';

interface Schemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

/**
 * Parses body, params and query with strict zod schemas. Failures reach the error handler as
 * 400 VALIDATION_FAILED with field paths; parsed values replace the raw ones.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.query)
      // Express 5 exposes req.query as a getter, so redefine it with the parsed value.
      Object.defineProperty(req, 'query', {
        value: schemas.query.parse(req.query),
        writable: true,
        configurable: true,
      });
    next();
  };
}

export const idParam = z.object({ id: z.uuid('Not a valid id.') }).strict();
