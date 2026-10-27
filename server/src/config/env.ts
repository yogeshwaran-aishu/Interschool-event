import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env') && !process.env['VITEST']) process.loadEnvFile('.env');

const bool = z
  .enum(['true', 'false', ''])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:4200'),
  APP_URL: z.string().default('http://localhost:4200'),
  RUN_WORKER_IN_API: bool,
  INITIAL_PASSWORD: z.string().default(''),
  ALLOW_DEMO_RESET: bool,
  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('InterSchool Connect <no-reply@interschool.test>'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

/** Validated once at startup: a missing or malformed variable crashes the process early. */
export const env = (() => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', z.prettifyError(parsed.error));
    process.exit(1);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && e.ALLOW_DEMO_RESET)
    throw new Error('ALLOW_DEMO_RESET must be false in production');
  return { ...e, isProd: e.NODE_ENV === 'production' };
})();

export type Env = typeof env;
