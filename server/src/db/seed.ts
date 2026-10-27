import { pathToFileURL } from 'node:url';
import { pool, withTransaction, type Tx } from '../common/db.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { DEMO_PASSWORD, seedId as id } from './seed-ids.js';

const DAY = 86_400_000;

const TABLES = [
  'idempotency_keys',
  'cron_runs',
  'jobs',
  'audit_logs',
  'notifications',
  'registrations',
  'invitation_coordinators',
  'invitations',
  'categories',
  'event_coordinators',
  'events',
  'login_failures',
  'refresh_tokens',
  'student_profiles',
  'users',
  'schools',
];

/** Demo data with dates relative to now, so deadlines are always meaningful. */
export async function seed(tx: Tx, now = new Date()): Promise<void> {
  const at = (days: number, hour = 9) => {
    const d = new Date(now.getTime() + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const hash = await hashPassword(DEMO_PASSWORD);
  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const cols = Object.keys(row);
      await tx.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        cols.map((c) => row[c]),
      );
    }
  };

  const school = (
    key: string,
    name: string,
    board: string,
    address: string,
    n: number,
    status = 'active',
  ) => ({
    id: id(`sch-${key}`),
    name,
    board,
    city: 'Pune',
    address,
    contact_email: `office@${key}.test`,
    contact_phone: `+91 20 4000 ${n}000`,
    status,
  });
  await insert('schools', [
    school('sunrise', 'Sunrise Public School', 'CBSE', '12 Baner Road, Pune', 1),
    school('lakeview', 'Lakeview Vidyalaya', 'CBSE', '4 Lake Road, Kothrud, Pune', 2),
    school('aurelia', 'St. Aurelia Convent School', 'ICSE', '88 Camp Street, Pune', 3),
    school('riverside', 'Riverside Academy', 'State', '7 Riverside Lane, Aundh, Pune', 4),
    school('greenfield', 'Greenfield High School', 'CBSE', '21 Hill View, Hadapsar, Pune', 5),
    school(
      'oakridge',
      'Oakridge International',
      'ICSE',
      '3 Oak Avenue, Wakad, Pune',
      6,
      'suspended',
    ),
  ]);

  const user = (
    key: string,
    schoolKey: string | null,
    role: string,
    name: string,
    email: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id: id(key),
    school_id: schoolKey ? id(schoolKey) : null,
    role,
    full_name: name,
    email,
    login_id: email,
    password_hash: hash,
    must_change_password: false,
    status: 'active',
    ...extra,
  });
  await insert('users', [
    user('u-admin', null, 'app_admin', 'Priya Raman', 'admin@interschool.test'),
    user('u-sun-admin', 'sch-sunrise', 'school_admin', 'Anita Deshmukh', 'principal@sunrise.test'),
    user('u-sun-coord', 'sch-sunrise', 'teacher', 'Rahul Kulkarni', 'coordinator@sunrise.test', {
      can_host_events: true,
    }),
    user('u-lake-admin', 'sch-lakeview', 'school_admin', 'Farah Sheikh', 'principal@lakeview.test'),
    user('u-lake-teacher', 'sch-lakeview', 'teacher', 'Vikram Joshi', 'teacher@lakeview.test'),
    user(
      'u-aur-admin',
      'sch-aurelia',
      'school_admin',
      'Sister Maria D’Souza',
      'principal@aurelia.test',
    ),
    user(
      'u-riv-admin',
      'sch-riverside',
      'school_admin',
      'Suresh Patil',
      'principal@riverside.test',
    ),
    user(
      'u-green-admin',
      'sch-greenfield',
      'school_admin',
      'Kavita Rao',
      'principal@greenfield.test',
    ),
    user('u-aarav', 'sch-lakeview', 'student', 'Aarav Mehta', 'aarav@lakeview.test'),
    user('u-meera', 'sch-lakeview', 'student', 'Meera Iyer', 'meera@lakeview.test', {
      must_change_password: true,
      status: 'invited',
    }),
    user('u-kabir', 'sch-lakeview', 'student', 'Kabir Nair', 'kabir@lakeview.test'),
    user('u-ishita', 'sch-lakeview', 'student', 'Ishita Ghosh', 'ishita@lakeview.test'),
    user('u-rohan', 'sch-lakeview', 'student', 'Rohan Das', 'rohan@lakeview.test'),
    user('u-tara', 'sch-sunrise', 'student', 'Tara Bhatt', 'tara@sunrise.test'),
    user('u-dev', 'sch-sunrise', 'student', 'Dev Malhotra', 'dev@sunrise.test'),
  ]);

  const student = (
    key: string,
    schoolKey: string,
    admission: string,
    cls: number,
    section: string,
    gender: string,
    guardian: string,
    guardianEmail: string,
  ) => ({
    user_id: id(key),
    school_id: id(schoolKey),
    admission_no: admission,
    class: cls,
    section,
    gender,
    guardian_name: guardian,
    guardian_email: guardianEmail,
    parental_consent: true,
    consent_recorded_at: at(-60),
  });
  await insert('student_profiles', [
    student(
      'u-aarav',
      'sch-lakeview',
      'LV-2019-041',
      9,
      'A',
      'male',
      'Neha Mehta',
      'neha.mehta@example.test',
    ),
    student(
      'u-meera',
      'sch-lakeview',
      'LV-2020-112',
      8,
      'B',
      'female',
      'Lakshmi Iyer',
      'lakshmi.iyer@example.test',
    ),
    student(
      'u-kabir',
      'sch-lakeview',
      'LV-2018-007',
      10,
      'A',
      'male',
      'Arjun Nair',
      'arjun.nair@example.test',
    ),
    student(
      'u-ishita',
      'sch-lakeview',
      'LV-2019-090',
      9,
      'C',
      'female',
      'Ruma Ghosh',
      'ruma.ghosh@example.test',
    ),
    student(
      'u-rohan',
      'sch-lakeview',
      'LV-2017-150',
      11,
      'A',
      'male',
      'Amit Das',
      'amit.das@example.test',
    ),
    student(
      'u-tara',
      'sch-sunrise',
      'SP-2019-011',
      9,
      'A',
      'female',
      'Kiran Bhatt',
      'kiran.bhatt@example.test',
    ),
    student(
      'u-dev',
      'sch-sunrise',
      'SP-2018-022',
      10,
      'B',
      'male',
      'Sanjay Malhotra',
      'sanjay.m@example.test',
    ),
  ]);

  await insert('events', [
    {
      id: id('ev-fiesta'),
      host_school_id: id('sch-sunrise'),
      title: 'Inter-School Science Fiesta 2026',
      description:
        'A day of robotics, quizzes and research posters for young scientists across Pune. Teams present to a jury of university faculty.',
      venue: 'Sunrise Public School Auditorium, Baner',
      starts_at: at(21),
      reg_deadline: at(10, 18),
      status: 'open',
      created_by: id('u-sun-admin'),
    },
    {
      id: id('ev-debate'),
      host_school_id: id('sch-lakeview'),
      title: 'Lakeview Debate Championship',
      description:
        'British Parliamentary format debate for senior students. Motions released 15 minutes before each round.',
      venue: 'Lakeview Vidyalaya Main Hall, Kothrud',
      starts_at: at(30),
      reg_deadline: at(14, 18),
      status: 'open',
      created_by: id('u-lake-admin'),
    },
    {
      id: id('ev-sports'),
      host_school_id: id('sch-sunrise'),
      title: 'Winter Athletics Meet',
      description: 'Track events for classes 6 to 12. Draft — categories still being finalised.',
      venue: 'Sunrise Sports Complex',
      starts_at: at(45),
      reg_deadline: at(30, 18),
      status: 'draft',
      created_by: id('u-sun-admin'),
    },
  ]);
  await insert('event_coordinators', [
    { event_id: id('ev-fiesta'), user_id: id('u-sun-coord') },
    { event_id: id('ev-debate'), user_id: id('u-lake-teacher') },
  ]);

  const cat = (
    key: string,
    ev: string,
    name: string,
    min: number,
    max: number,
    perSchool: number,
    pos: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id: id(key),
    event_id: id(ev),
    name,
    min_class: min,
    max_class: max,
    max_per_school: perSchool,
    position: pos,
    ...extra,
  });
  await insert('categories', [
    cat('cat-robotics', 'ev-fiesta', 'Robotics Challenge', 8, 12, 2, 0, {
      type: 'team',
      team_size: 3,
    }),
    cat('cat-quiz', 'ev-fiesta', 'Junior Science Quiz', 6, 10, 2, 1),
    cat('cat-poster', 'ev-fiesta', 'Research Poster', 9, 12, 4, 2),
    cat('cat-debate-sr', 'ev-debate', 'Senior Debate', 9, 12, 3, 0),
    cat('cat-sprint-g', 'ev-sports', '100 m Sprint — Girls', 6, 12, 2, 0, {
      gender_rule: 'female',
    }),
  ]);

  await insert('invitations', [
    {
      id: id('inv-fiesta-lake'),
      event_id: id('ev-fiesta'),
      guest_school_id: id('sch-lakeview'),
      status: 'accepted',
      responded_by: id('u-lake-admin'),
      responded_at: at(-3),
      response_note: 'Delighted to participate.',
    },
    {
      id: id('inv-fiesta-aur'),
      event_id: id('ev-fiesta'),
      guest_school_id: id('sch-aurelia'),
      status: 'pending',
    },
    {
      id: id('inv-fiesta-riv'),
      event_id: id('ev-fiesta'),
      guest_school_id: id('sch-riverside'),
      status: 'rejected',
      responded_by: id('u-riv-admin'),
      responded_at: at(-2),
      response_note: 'Clashes with our annual day.',
    },
    {
      id: id('inv-debate-sun'),
      event_id: id('ev-debate'),
      guest_school_id: id('sch-sunrise'),
      status: 'pending',
    },
    {
      id: id('inv-debate-green'),
      event_id: id('ev-debate'),
      guest_school_id: id('sch-greenfield'),
      status: 'accepted',
      responded_by: id('u-green-admin'),
      responded_at: at(-1),
    },
  ]);
  await insert('invitation_coordinators', [
    { invitation_id: id('inv-fiesta-lake'), user_id: id('u-lake-teacher') },
  ]);

  const reg = (key: string, cat: string, student: string, status: string, days: number) => ({
    id: id(key),
    invitation_id: id('inv-fiesta-lake'),
    category_id: id(cat),
    student_id: id(student),
    school_id: id('sch-lakeview'),
    status,
    applied_at: at(days),
    created_at: at(days),
  });
  await insert('registrations', [
    {
      ...reg('reg-1', 'cat-quiz', 'u-kabir', 'school_approved', -2),
      school_decided_by: id('u-lake-teacher'),
      school_decided_at: at(-1),
    },
    reg('reg-2', 'cat-poster', 'u-ishita', 'applied', -1),
    reg('reg-3', 'cat-robotics', 'u-rohan', 'applied', -1),
  ]);

  const note = (
    userKey: string,
    type: string,
    title: string,
    body: string,
    link: string,
    channels: string[],
    days: number,
    read?: number,
  ) => ({
    user_id: id(userKey),
    type,
    payload: JSON.stringify({ title, body, link, channels }),
    created_at: at(days),
    read_at: read === undefined ? null : at(read),
  });
  await insert('notifications', [
    note(
      'u-lake-admin',
      'invitation_received',
      'New invitation',
      'Sunrise Public School invited you to Inter-School Science Fiesta 2026.',
      '/invitations',
      ['in_app', 'email'],
      -4,
      -3,
    ),
    note(
      'u-sun-admin',
      'invitation_accepted',
      'Lakeview Vidyalaya accepted',
      'Lakeview Vidyalaya accepted your invitation to Inter-School Science Fiesta 2026.',
      `/events/${id('ev-fiesta')}`,
      ['in_app', 'email'],
      -3,
    ),
    note(
      'u-aarav',
      'event_open',
      'New event open to you',
      'Inter-School Science Fiesta 2026 is open for applications until the deadline.',
      '/explore',
      ['in_app', 'guardian_email'],
      -3,
    ),
    note(
      'u-sun-admin',
      'invitation_received',
      'New invitation',
      'Lakeview Vidyalaya invited you to Lakeview Debate Championship.',
      '/invitations',
      ['in_app', 'email'],
      -1,
    ),
  ]);

  const log = (
    actor: string,
    schoolKey: string,
    action: string,
    entity: string,
    entityKey: string,
    days: number,
  ) => ({
    actor_id: id(actor),
    school_id: id(schoolKey),
    action,
    entity,
    entity_id: id(entityKey),
    at: at(days),
  });
  await insert('audit_logs', [
    log('u-admin', 'sch-sunrise', 'school.created', 'School', 'sch-sunrise', -30),
    log('u-sun-admin', 'sch-sunrise', 'event.published', 'Event', 'ev-fiesta', -5),
    log('u-sun-admin', 'sch-sunrise', 'invitation.sent', 'Invitation', 'inv-fiesta-lake', -5),
    log('u-lake-admin', 'sch-lakeview', 'invitation.accepted', 'Invitation', 'inv-fiesta-lake', -3),
    log('u-lake-teacher', 'sch-lakeview', 'registration.approved', 'Registration', 'reg-1', -1),
  ]);
}

/** Wipes every table and re-seeds. Used by `npm run db:seed`, the dev reset endpoint and tests. */
export async function resetDatabase(now = new Date()): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await seed(tx, now);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // --if-empty seeds only a fresh database (used by docker-compose on every start).
  const empty = (await pool.query('SELECT count(*)::int AS n FROM schools')).rows[0].n === 0;
  if (!process.argv.includes('--if-empty') || empty) {
    await resetDatabase();
    console.log('Database seeded with demo data (password for every account: demo1234).');
  }
  await pool.end();
}
