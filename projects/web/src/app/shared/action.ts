import { inject } from '@angular/core';
import { DsToastService } from '@isc/design-system';
import { DomainError } from '../core/state-machines';

/**
 * Returns a runner that executes a domain action (usually an API call), shows a success toast,
 * and turns refusals from the server (DomainError) into an error toast instead of an exception.
 * Resolves to true when the action succeeded.
 */
export function injectAction() {
  const toast = inject(DsToastService);
  return async <T>(
    fn: () => T | Promise<T>,
    success?: string | ((result: T) => string),
    detail?: string | ((result: T) => string | undefined),
  ): Promise<boolean> => {
    try {
      const result = await fn();
      if (success)
        toast.success(
          typeof success === 'function' ? success(result) : success,
          typeof detail === 'function' ? detail(result) : detail,
        );
      return true;
    } catch (err) {
      if (err instanceof DomainError) {
        toast.error('Could not complete that', err.message);
        return false;
      }
      throw err;
    }
  };
}
