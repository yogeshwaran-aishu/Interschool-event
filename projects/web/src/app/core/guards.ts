import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Role } from './models';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (user.mustChangePassword) return router.createUrlTree(['/account/password']);
  return true;
};

export const signedInGuard: CanActivateFn = () =>
  inject(Auth).user() ? true : inject(Router).createUrlTree(['/login']);

export const guestGuard: CanActivateFn = () =>
  inject(Auth).user() ? inject(Router).createUrlTree(['/dashboard']) : true;

export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const user = inject(Auth).user();
    return user && roles.includes(user.role) ? true : inject(Router).createUrlTree(['/dashboard']);
  };
}
