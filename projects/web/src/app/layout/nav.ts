import { DsIconName } from '@isc/design-system';
import { Role, User } from '../core/models';

export interface NavItem {
  label: string;
  path: string;
  icon: DsIconName;
}

export function navFor(user: User): NavItem[] {
  const items: Record<Role, NavItem[]> = {
    app_admin: [
      { label: 'Dashboard', path: '/dashboard', icon: 'home' },
      { label: 'Schools', path: '/schools', icon: 'school' },
      { label: 'Audit log', path: '/audit', icon: 'history' },
      { label: 'Notifications', path: '/notifications', icon: 'bell' },
    ],
    school_admin: [
      { label: 'Dashboard', path: '/dashboard', icon: 'home' },
      { label: 'Hosted events', path: '/events', icon: 'calendar' },
      { label: 'Invitations', path: '/invitations', icon: 'inbox' },
      { label: 'Approvals', path: '/approvals', icon: 'clipboard' },
      { label: 'People', path: '/people', icon: 'users' },
      { label: 'Audit log', path: '/audit', icon: 'history' },
    ],
    teacher: [
      { label: 'Dashboard', path: '/dashboard', icon: 'home' },
      { label: 'Hosted events', path: '/events', icon: 'calendar' },
      { label: 'Approvals', path: '/approvals', icon: 'clipboard' },
      { label: 'Notifications', path: '/notifications', icon: 'bell' },
    ],
    student: [
      { label: 'Dashboard', path: '/dashboard', icon: 'home' },
      { label: 'Explore events', path: '/explore', icon: 'trophy' },
      { label: 'My applications', path: '/my-applications', icon: 'file-text' },
      { label: 'Notifications', path: '/notifications', icon: 'bell' },
    ],
  };
  return items[user.role];
}
