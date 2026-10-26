import { Service } from '@angular/core';

/** Source of "now". Tests replace it to exercise deadlines without waiting. */
@Service()
export class Clock {
  now(): Date {
    return new Date();
  }
}
