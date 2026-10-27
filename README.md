# InterSchool Connect

Invite-only inter-school competitions, built from the **InterSchool Connect — PRD v1 (Base Version)**.
A host school invites chosen schools, each invited school accepts or declines, eligible students apply,
their own school approves within a per-school quota, and the host confirms participants and exports the list.

- **Angular 22.2**, standalone components, **zoneless** (no `zone.js`), signals, Signal Forms, `OnPush` by default
- **Separate design system** library (`@isc/design-system`) with light/dark themes and WCAG 2.2 **AAA** colour tokens
- **Responsive** for phone, tablet and desktop
- **Vitest** unit tests and **Playwright** e2e tests with **axe-core** accessibility checks
- **Node.js API** (`server/`): Express 5, TypeScript, **PostgreSQL**, built from the Backend PRD
- **Angular CLI MCP server** wired up for AI assistants (`.mcp.json`)

## Quick start

Three terminals (no Docker or system PostgreSQL needed):

```bash
npm install && npm --prefix server install
cp server/.env.example server/.env
npm run db           # PostgreSQL on :5433 (embedded-postgres), migrated and seeded on first run
npm run api          # API on http://localhost:3000, with the job worker in-process
npm start            # Angular on http://localhost:4200, proxying /api to the API
```

With Docker instead: `docker compose up` runs PostgreSQL, the API, the worker and Mailpit
(emails at http://localhost:8025); then `npm start`.

Sign in with any demo account (password `demo1234`), or use the buttons on the sign-in page:

| Role                     | Email                      |
| ------------------------ | -------------------------- |
| App Admin                | `admin@interschool.test`   |
| School Admin, host       | `principal@sunrise.test`   |
| Event Coordinator, host  | `coordinator@sunrise.test` |
| School Admin, guest      | `principal@lakeview.test`  |
| Event Coordinator, guest | `teacher@lakeview.test`    |
| Student                  | `aarav@lakeview.test`      |
| Student, first sign-in   | `meera@lakeview.test`      |

Data lives in PostgreSQL, seeded with dates relative to today. Use **Display preferences → Reset
demo data** (development only, `ALLOW_DEMO_RESET=true`) or `npm run db -- --reset` to start over.

## Scripts

| Command                | What it does                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm start`            | Dev server for the `web` app                                           |
| `npm run build`        | Builds the design-system package, then the app (production)            |
| `npm run db`           | Local PostgreSQL (embedded) with migrations and demo data              |
| `npm run api`          | The Node.js API in watch mode                                          |
| `npm test`             | Vitest unit tests for the app and the design system                    |
| `npm run test:api`     | API tests against a throwaway PostgreSQL (rules, quota race, tenancy)  |
| `npm run e2e`          | Playwright against the real API + PostgreSQL on desktop, tablet, phone |
| `npm run tokens:check` | Verifies every design-token colour pair meets WCAG 2.2 AAA contrast    |
| `npm run mcp`          | Starts the Angular CLI MCP server manually                             |

The first e2e run needs a browser: `npx playwright install chromium`.

## Workspace layout

```
projects/
  design-system/            @isc/design-system — tokens, themes and components (ng-packagr library)
    src/styles/             _tokens.scss (light + dark), _base.scss, _components.scss
    src/lib/                ds-button, ds-field + dsControl, ds-dialog, ds-toaster, ds-badge,
                            ds-card, ds-stat, ds-meter, ds-empty-state, ds-page-header,
                            ds-avatar, ds-icon, preferences service + panel
  web/                      the InterSchool Connect app
    src/app/core/           models, state machines, domain service, store, auth, CSV, export
    src/app/layout/         responsive shell (sidebar / tablet rail / phone bottom nav + drawer)
    src/app/features/       lazy-loaded pages per role
server/                     Node.js API (see "Backend" below)
e2e/                        Playwright specs (flows, accessibility, responsive)
scripts/check-tokens.mjs    contrast checker for design tokens
```

The app imports the design system from source through the `@isc/design-system` path alias, so changes
show up immediately. `npm run build:ds` produces a publishable package in `dist/design-system`.

## How the PRD maps to the code

| PRD                                                                  | Server (`server/src/`)                                 | App (`projects/web/src/app/`)                          |
| -------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Roles and permissions, tenant scoping by `school_id`                 | `common/middleware/auth.ts`, `common/access.ts`        | `core/guards.ts`, `DomainService.isHostStaff`          |
| State machines for event, invitation, registration                   | `common/state-machines.ts`                             | `core/state-machines.ts` (offers only)                 |
| ON-1 onboard school + first admin                                    | `modules/schools`                                      | `features/admin/schools`                               |
| ON-2 CSV import with row-level errors                                | `modules/users`, `users.import` job                    | `core/csv.ts` (preview), `features/people`             |
| ON-3 forced first-login password change                              | `modules/auth`                                         | `core/guards.ts`, `features/auth/change-password.ts`   |
| EV-1/2/4/5 events, categories, material-change notices, cancel       | `modules/events`                                       | `features/events/*`                                    |
| IN-1/2/3/4 invite, accept/decline, auto-expiry, revoke               | `modules/invitations`, `invitation.expire` job         | `features/events/event-detail`, `features/invitations` |
| RG-1/3/4/5/6 eligibility, quota, submit, host confirm, withdraw      | `modules/registrations`                                | `features/student/*`, `features/approvals/*`           |
| RP-1 CSV / print-to-PDF export of confirmed participants             | `GET /events/:id/export`                               | `core/export.ts`                                       |
| AU-1 append-only audit log                                           | `common/audit.ts`, `GET /audit`                        | `features/admin/audit-log.ts`                          |
| Notifications (in-app, email, guardian email, digest)                | `common/notify.ts`, `email.send`, `coordinator.digest` | `features/notifications`                               |
| Privacy: host sees name/class/school/category; App Admin sees counts | `modules/state` (`GET /state`)                         | `hostNominations`, admin dashboard                     |

Not built (P1 or out of scope in the PRD): team formation (RG-2), circular PDF/banner upload (EV-3),
per-school dashboard across events (RP-2), WhatsApp, payments, results.

## Accessibility (WCAG 2.2 AAA)

- **Contrast 7:1** for all text in both themes, 3:1 for borders and focus rings — checked by `npm run tokens:check`
  and by axe's `color-contrast-enhanced` rule in e2e.
- **Focus appearance**: 3px outline plus a contrasting halo on every surface; focus is never hidden under the
  sticky header (`scroll-padding`).
- **Target size** of at least 44×44 px for every control (checked in e2e).
- **No timing**: toasts stay until dismissed; no session timeouts in the demo.
- **Motion and text**: respects `prefers-reduced-motion`, with manual Reduced/Full override and a Larger text option.
- **Navigation**: skip link, landmarks, breadcrumbs, `aria-current`, focus moved to the page heading on route
  change, and page titles announced in a live region.
- **Forms**: visible labels, hints and errors linked by `aria-describedby`, `aria-invalid`, paste allowed in
  password fields (3.3.9), confirmation dialogs before irreversible actions (3.3.6).
- **Tables** reflow into labelled rows when their container is narrow.

Automated checks catch only part of WCAG. Before launch, also test with a screen reader (VoiceOver, NVDA)
and with real users.

## Angular MCP

`.mcp.json` registers the Angular CLI MCP server (`ng mcp`) for Claude Code and other MCP clients. It exposes
`get_best_practices`, `search_documentation`, `list_projects`, `run_target`, `devserver_*` and
`onpush_zoneless_migration`. Restart your AI client in this folder to pick it up.

## Backend

`server/` implements the **InterSchool Connect — Backend PRD (Node.js + PostgreSQL)**.

```
server/
  migrations/001_init.sql   schema: enums, constraints, partial/unique indexes, jobs outbox
  src/app.ts                helmet, CORS allow-list, JSON, cookies, pino-http, routers, error handler
  src/server.ts, worker.ts  two processes from one codebase
  src/common/               db + transactions, DomainError, auth/validate/idempotency middleware,
                            audit, notify (in-app + email outbox), mailer, state machines
  src/modules/<module>/     *.routes.ts (thin) → *.service.ts (rules + transactions) + *.schemas.ts (zod)
  src/jobs/                 email.send, users.import, event.fanout, invitation.expire (15 min),
                            deadline.reminder (hourly), coordinator.digest (17:00 IST)
  src/db/                   migrate, seed, stable seed ids shared with the e2e specs
  test/                     Vitest + Supertest against a real PostgreSQL
```

- **Auth**: argon2id passwords, 15-minute JWT access token held in memory by the app, rotating
  refresh token in an httpOnly `SameSite=Strict` cookie; replaying a used token revokes its family.
  5 failed sign-ins per account in 15 minutes lock it.
- **Authorization**: every router after `/auth` sits behind `authenticate`; `requireRole` per route;
  services check host/guest relationships; records from another school return 404.
- **Rules**: explicit action routes (`POST /invitations/:id/accept`, `/registrations/:id/school-approve`
  …) each check state, actor and deadline (database clock) in one transaction. School approvals lock
  the invitation row, so the quota holds under concurrent approvals.
- **Outbox**: data change, audit row, notifications and email jobs commit together; the worker
  claims jobs with `FOR UPDATE SKIP LOCKED`, retries with backoff, then dead-letters.
- **Errors**: `{ error: { code, message, details, requestId } }`; the app shows `message`.

The Angular app talks to it through `core/api.ts` (HttpClient + token refresh interceptor).
`GET /api/v1/state` returns everything the signed-in person may see, already scoped by the server
(other schools appear as directory entries; hosts see nominees as name + class only); the `Store`
caches it and `DomainService` reloads it after every write.

Deviations from the PRD, to keep v1 small: plain `pg` with SQL instead of Prisma, and a small
Postgres job table instead of pg-boss (same transactional-outbox behaviour). OpenAPI generation and
row-level security (PRD phase 2) are not built yet.
