import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Business code depends on this interface, never on a provider SDK. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

class SmtpMailer implements Mailer {
  private readonly transport = nodemailer.createTransport(env.SMTP_URL);
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: env.MAIL_FROM, ...mail });
  }
}

class LogMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    logger.info({ to: mail.to, subject: mail.subject }, 'email (not sent: SMTP_URL is empty)');
  }
}

export const mailer: Mailer = env.SMTP_URL ? new SmtpMailer() : new LogMailer();

const templatesDir = fileURLToPath(new URL('../../templates/', import.meta.url));
const cache = new Map<string, string>();

/** Renders templates/<name>.txt: first line is the subject, the rest the body; {{var}} placeholders. */
export function render(
  name: string,
  vars: Record<string, string>,
): { subject: string; text: string } {
  if (!/^[a-z-]+$/.test(name)) throw new Error(`Bad template name ${name}`);
  let source = cache.get(name);
  if (!source) {
    source = readFileSync(`${templatesDir}${name}.txt`, 'utf8');
    cache.set(name, source);
  }
  const filled = source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  const [subject = '', ...rest] = filled.split('\n');
  return { subject: subject.replace(/^Subject:\s*/, ''), text: rest.join('\n').trim() };
}
