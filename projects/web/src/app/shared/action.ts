import { inject } from '@angular/core';
import { DsToastService } from '@isc/design-system';
import { DomainError } from '../core/state-machines';

/**
 * Returns a runner that executes a domain action, shows a success toast, and turns
 * rule violations (DomainError) into an error toast instead of an exception.
 */
export function injectAction() {
  const toast = inject(DsToastService);
  return <T>(fn: () => T, success?: string | ((result: T) => string), detail?: string): boolean => {
    try {
      const result = fn();
      if (success) toast.success(typeof success === 'function' ? success(result) : success, detail);
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
