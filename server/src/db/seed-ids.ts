import { createHash } from 'node:crypto';

/**
 * Stable UUIDs for demo records, derived from readable keys (`seedId('ev-fiesta')`), so the seed,
 * the API tests and the Playwright specs can refer to the same rows.
 */
export function seedId(key: string): string {
  const h = createHash('sha1').update(`isc-seed:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const DEMO_PASSWORD = 'demo1234';

export const IDS = {
  sunrise: seedId('sch-sunrise'),
  lakeview: seedId('sch-lakeview'),
  aurelia: seedId('sch-aurelia'),
  riverside: seedId('sch-riverside'),
  greenfield: seedId('sch-greenfield'),
  oakridge: seedId('sch-oakridge'),
  fiesta: seedId('ev-fiesta'),
  debate: seedId('ev-debate'),
  sports: seedId('ev-sports'),
  invFiestaLake: seedId('inv-fiesta-lake'),
  invFiestaAurelia: seedId('inv-fiesta-aur'),
  invDebateSunrise: seedId('inv-debate-sun'),
} as const;
