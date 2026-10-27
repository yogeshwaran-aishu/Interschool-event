import type { Db } from './db.js';
import { enqueue } from './jobs.js';

export type Channel = 'in_app' | 'email' | 'guardian_email' | 'digest';

/** Channels are chosen by notification type, never by the caller. */
const CHANNELS: Record<string, Channel[]> = {
  account_invite: ['email'],
  invitation_received: ['in_app', 'email'],
  invitation_accepted: ['in_app', 'email'],
  invitation_rejected: ['in_app', 'email'],
  invitation_revoked: ['in_app', 'email'],
  invitation_reminder: ['in_app', 'email'],
  event_open: ['in_app', 'guardian_email'],
  event_changed: ['in_app', 'email'],
  event_cancelled: ['in_app', 'email'],
  application_submitted: ['in_app', 'digest'],
  application_approved: ['in_app', 'guardian_email'],
  application_rejected: ['in_app', 'guardian_email'],
  nominations_submitted: ['in_app', 'digest'],
  nomination_confirmed: ['in_app', 'email'],
  nomination_rejected: ['in_app', 'email'],
};

export interface NotificationContent {
  title: string;
  body: string;
  link?: string;
  /** Lets jobs recognise notifications they already sent (idempotent fan-out). */
  eventId?: string;
}

/**
 * The single entry point for notifications. Inserts in-app rows and queues emails in the
 * caller's transaction, so a notification exists if and only if the change committed.
 */
export async function notify(
  tx: Db,
  userIds: Iterable<string>,
  type: string,
  content: NotificationContent,
  extra: { template?: string; vars?: Record<string, string> } = {},
): Promise<void> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  const channels = CHANNELS[type] ?? ['in_app'];
  const payload = { ...content, channels };
  await tx.query(
    `INSERT INTO notifications (user_id, type, payload)
     SELECT unnest($1::uuid[]), $2, $3::jsonb`,
    [ids, type, JSON.stringify(payload)],
  );
  for (const channel of channels) {
    if (channel !== 'email' && channel !== 'guardian_email') continue;
    for (const userId of ids)
      await enqueue(tx, 'email.send', {
        userId,
        to: channel === 'guardian_email' ? 'guardian' : 'user',
        template: extra.template ?? 'notification',
        vars: { ...content, link: content.link ?? '', ...extra.vars },
      });
  }
}
