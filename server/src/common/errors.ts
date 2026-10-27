import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';
import { env } from '../config/env.js';

export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN_ROLE: 403,
  FORBIDDEN: 403,
  ACCOUNT_SUSPENDED: 403,
  SCHOOL_SUSPENDED: 403,
  CONSENT_PENDING: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  QUOTA_FULL: 409,
  DEADLINE_PASSED: 409,
  ALREADY_APPLIED: 409,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  NOT_ELIGIBLE: 422,
  CONSENT_MISSING: 422,
  RATE_LIMITED: 429,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** A business-rule refusal. The message is written for the person using the app. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Missing and "belongs to another school" look the same, so ids can't be probed. */
export const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found.`);

export const notFoundHandler: RequestHandler = (_req, _res, next) =>
  next(new DomainError('NOT_FOUND', 'No such endpoint.'));

/** Registered last in app.ts: one error shape for the Angular client. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? '');
  let error: DomainError;
  if (err instanceof DomainError) error = err;
  else if (err instanceof ZodError)
    error = new DomainError('VALIDATION_FAILED', 'Some fields are not valid.', {
      fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  else if (err?.type === 'entity.parse.failed')
    error = new DomainError('VALIDATION_FAILED', 'The request body is not valid JSON.');
  else if (err?.code === '23505')
    // Unique violation that slipped past a service check (e.g. a double click).
    error = new DomainError('ALREADY_EXISTS', 'That record already exists.');
  else {
    logger.error({ err, requestId }, 'unhandled error');
    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side. Please try again.',
        requestId,
        ...(env.isProd ? {} : { details: { message: String(err?.message ?? err) } }),
      },
    });
    return;
  }
  res.status(ERROR_STATUS[error.code]).json({
    error: { code: error.code, message: error.message, details: error.details, requestId },
  });
};
