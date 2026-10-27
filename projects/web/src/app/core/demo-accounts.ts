/**
 * Sign-in shortcuts for the demo accounts the API seeds (server/src/db/seed.ts). Shown on the
 * sign-in page only; the server is what checks the password.
 */
export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ACCOUNTS = [
  { email: 'admin@interschool.test', label: 'App Admin', who: 'Platform operator' },
  { email: 'principal@sunrise.test', label: 'School Admin (host)', who: 'Sunrise Public School' },
  { email: 'coordinator@sunrise.test', label: 'Coordinator (host)', who: 'Sunrise Public School' },
  { email: 'principal@lakeview.test', label: 'School Admin (guest)', who: 'Lakeview Vidyalaya' },
  { email: 'teacher@lakeview.test', label: 'Coordinator (guest)', who: 'Lakeview Vidyalaya' },
  { email: 'aarav@lakeview.test', label: 'Student', who: 'Lakeview Vidyalaya, Class 9' },
  {
    email: 'meera@lakeview.test',
    label: 'Student (first login)',
    who: 'Lakeview Vidyalaya, Class 8',
  },
] as const;
