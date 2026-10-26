import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard, signedInGuard } from './core/guards';

const TITLE = 'InterSchool Connect';
const t = (page: string) => `${page} · ${TITLE}`;

export const routes: Routes = [
  {
    path: 'login',
    title: t('Sign in'),
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login'),
  },
  {
    path: 'account/password',
    title: t('Change password'),
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/auth/change-password'),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell'),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: t('Dashboard'),
        loadComponent: () => import('./features/dashboard/dashboard'),
      },
      {
        path: 'schools',
        title: t('Schools'),
        canActivate: [roleGuard('app_admin')],
        loadComponent: () => import('./features/admin/schools'),
      },
      {
        path: 'audit',
        title: t('Audit log'),
        canActivate: [roleGuard('app_admin', 'school_admin')],
        loadComponent: () => import('./features/admin/audit-log'),
      },
      {
        path: 'people',
        title: t('People'),
        canActivate: [roleGuard('school_admin')],
        loadComponent: () => import('./features/people/people'),
      },
      {
        path: 'events',
        canActivate: [roleGuard('school_admin', 'teacher')],
        children: [
          {
            path: '',
            title: t('Hosted events'),
            loadComponent: () => import('./features/events/event-list'),
          },
          {
            path: 'new',
            title: t('Create event'),
            loadComponent: () => import('./features/events/event-form'),
          },
          {
            path: ':id/edit',
            title: t('Edit event'),
            loadComponent: () => import('./features/events/event-form'),
          },
          {
            path: ':id',
            title: t('Event'),
            loadComponent: () => import('./features/events/event-detail'),
          },
          {
            path: ':id/:tab',
            title: t('Event'),
            loadComponent: () => import('./features/events/event-detail'),
          },
        ],
      },
      {
        path: 'invitations',
        title: t('Invitations'),
        canActivate: [roleGuard('school_admin')],
        loadComponent: () => import('./features/invitations/invitations'),
      },
      {
        path: 'approvals',
        canActivate: [roleGuard('school_admin', 'teacher')],
        children: [
          {
            path: '',
            title: t('Approvals'),
            loadComponent: () => import('./features/approvals/approval-list'),
          },
          {
            path: ':invitationId',
            title: t('Review applications'),
            loadComponent: () => import('./features/approvals/approval-detail'),
          },
        ],
      },
      {
        path: 'explore',
        title: t('Explore events'),
        canActivate: [roleGuard('student')],
        loadComponent: () => import('./features/student/explore'),
      },
      {
        path: 'my-applications',
        title: t('My applications'),
        canActivate: [roleGuard('student')],
        loadComponent: () => import('./features/student/my-applications'),
      },
      {
        path: 'notifications',
        title: t('Notifications'),
        loadComponent: () => import('./features/notifications/notifications'),
      },
      {
        path: '**',
        title: t('Page not found'),
        loadComponent: () => import('./features/not-found'),
      },
    ],
  },
];
