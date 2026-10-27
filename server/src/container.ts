import { AuthService } from './modules/auth/auth.service.js';
import { EventsService } from './modules/events/events.service.js';
import { InvitationsService } from './modules/invitations/invitations.service.js';
import { RegistrationsService } from './modules/registrations/registrations.service.js';
import { SchoolsService } from './modules/schools/schools.service.js';
import { UsersService } from './modules/users/users.service.js';

/** Composition root: the one place services are created and wired. */
export function createContainer() {
  return {
    auth: new AuthService(),
    schools: new SchoolsService(),
    users: new UsersService(),
    events: new EventsService(),
    invitations: new InvitationsService(),
    registrations: new RegistrationsService(),
  };
}

export type Container = ReturnType<typeof createContainer>;
