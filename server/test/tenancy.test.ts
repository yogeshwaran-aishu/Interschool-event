import { describe, expect, it } from 'vitest';
import { EMAILS, as, id, useSeededDatabase } from './helpers.js';

useSeededDatabase();

/**
 * Logs in as a school outside the Science Fiesta (Greenfield) and calls every scoped route with
 * Sunrise's and Lakeview's ids. Any 2xx fails the build; misses must be 404, never 403.
 */
describe('tenant isolation', () => {
  const FIESTA = id('ev-fiesta');
  const INV_LAKE = id('inv-fiesta-lake');
  const REG = id('reg-1');
  const LAKE_STUDENT = id('u-aarav');

  const draft = {
    title: 'x',
    description: '',
    venue: 'x',
    startsAt: new Date(Date.now() + 9e8).toISOString(),
    regDeadline: new Date(Date.now() + 8e8).toISOString(),
    categories: [{ name: 'x', minClass: 1, maxClass: 12, maxPerSchool: 1 }],
  };

  const attempts: [method: 'get' | 'post' | 'patch' | 'put', path: string, body?: object][] = [
    ['get', `/events/${FIESTA}`],
    ['patch', `/events/${FIESTA}`, draft],
    ['post', `/events/${FIESTA}/publish`],
    ['post', `/events/${FIESTA}/cancel`, { reason: 'x' }],
    ['put', `/events/${FIESTA}/coordinators`, { teacherIds: [] }],
    ['post', `/events/${FIESTA}/invitations`, { schoolIds: [id('sch-riverside')] }],
    ['get', `/events/${FIESTA}/invitations`],
    ['get', `/events/${FIESTA}/nominations`],
    ['get', `/events/${FIESTA}/export?format=csv`],
    ['post', `/invitations/${INV_LAKE}/revoke`],
    ['post', `/invitations/${INV_LAKE}/accept`, {}],
    ['post', `/invitations/${INV_LAKE}/reject`, {}],
    ['put', `/invitations/${INV_LAKE}/coordinators`, { teacherIds: [] }],
    ['post', `/invitations/${INV_LAKE}/submit`],
    ['post', `/registrations/${REG}/school-approve`],
    ['post', `/registrations/${REG}/school-reject`, {}],
    ['post', `/registrations/${REG}/host-confirm`],
    ['post', `/registrations/${REG}/host-reject`, {}],
    ['patch', `/school/users/${LAKE_STUDENT}`, { status: 'suspended' }],
  ];

  it.each(attempts)('%s %s is not found for another school', async (method, path, body) => {
    const other = await as(EMAILS.greenfield);
    const res = await (method === 'get' ? other.get(path) : other[method](path, body ?? {}));
    expect(res.status).toBe(404);
  });

  it('keeps another school’s students out of lists and the state snapshot', async () => {
    const other = await as(EMAILS.greenfield);
    const state = (await other.get('/state')).body;
    expect(state.students).toEqual([]);
    expect(
      state.users.every((u: { schoolId: string }) => u.schoolId === id('sch-greenfield')),
    ).toBe(true);
    const lakeview = state.schools.find((s: { id: string }) => s.id === id('sch-lakeview'));
    expect(lakeview).toMatchObject({ address: '', contactEmail: '', contactPhone: '' });
    expect((await other.get('/school/registrations')).body).toEqual([]);
  });

  it('shows the host nominees as name, class, school and category only', async () => {
    const teacher = await as(EMAILS.guestTeacher);
    await teacher.post(`/invitations/${INV_LAKE}/submit`);
    const host = await as(EMAILS.hostAdmin);
    const state = (await host.get('/state')).body;
    expect(state.nominations).toHaveLength(1);
    expect(state.students.some((s: { userId: string }) => s.userId === id('u-kabir'))).toBe(false);
    expect(JSON.stringify(state)).not.toContain('arjun.nair@example.test');
  });

  it('stops a student from acting as staff', async () => {
    const aarav = await as(EMAILS.aarav);
    expect((await aarav.post(`/registrations/${REG}/school-approve`)).status).toBe(403);
    expect((await aarav.get('/audit')).status).toBe(403);
  });
});
