# InterSchool Connect

Invite-only inter-school competitions, built from the **InterSchool Connect — PRD v1 (Base Version)**.
A host school invites chosen schools, each invited school accepts or declines, eligible students apply,
their own school approves within a per-school quota, and the host confirms participants and exports the list.

- **Angular 22.2**, standalone components, **zoneless** (no `zone.js`), signals, Signal Forms, `OnPush` by default
- **Separate design system** library (`@isc/design-system`) with light/dark themes and WCAG 2.2 **AAA** colour tokens
- **Responsive** for phone, tablet and desktop
- **Vitest** unit tests and **Playwright** e2e tests with **axe-core** accessibility checks
- **Angular CLI MCP server** wired up for AI assistants (`.mcp.json`)

## Quick start

```bash
npm install
npm start            # http://localhost:4200
```

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

There is no backend yet: data lives in `localStorage`, seeded with dates relative to today. Use
**Display preferences → Reset demo data** to start over.

## Scripts

| Command                | What it does                                                            |
| ---------------------- | ----------------------------------------------------------------------- |
| `npm start`            | Dev server for the `web` app                                            |
| `npm run build`        | Builds the design-system package, then the app (production)             |
| `npm test`             | Vitest unit tests for the app and the design system                     |
| `npm run e2e`          | Playwright on desktop (1440×900), tablet (820×1180) and phone (Pixel 7) |
| `npm run tokens:check` | Verifies every design-token colour pair meets WCAG 2.2 AAA contrast     |
| `npm run mcp`          | Starts the Angular CLI MCP server manually                              |

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
e2e/                        Playwright specs (flows, accessibility, responsive)
scripts/check-tokens.mjs    contrast checker for design tokens
```

The app imports the design system from source through the `@isc/design-system` path alias, so changes
show up immediately. `npm run build:ds` produces a publishable package in `dist/design-system`.

## How the PRD maps to the code

| PRD                                                                        | Where                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Roles and permissions, tenant scoping by `school_id`                       | `core/domain.ts` (`require`, `requireHost`, `isHostStaff`, `isGuestStaff`) |
| State machines for event, invitation, registration                         | `core/state-machines.ts`, enforced only in `DomainService`                 |
| ON-1 onboard school + first admin                                          | `features/admin/schools`                                                   |
| ON-2 CSV import with row-level errors                                      | `core/csv.ts`, `features/people`                                           |
| ON-3 forced first-login password change                                    | `core/guards.ts`, `features/auth/change-password.ts`                       |
| EV-1/2/4/5 events, categories, material-change notices, cancel with reason | `features/events/*`                                                        |
| IN-1/2/3/4 invite, accept/decline with note, auto-expiry, revoke           | `features/events/event-detail`, `features/invitations`                     |
| RG-1/3/4/5/6 eligibility, quota, submit list, host confirm, withdraw       | `features/student/*`, `features/approvals/*`, nominations tab              |
| RP-1 CSV / print-to-PDF export of confirmed participants                   | `core/export.ts`                                                           |
| AU-1 append-only audit log                                                 | `DomainService.audit`, `features/admin/audit-log.ts`                       |
| Notifications (in-app, email, guardian email, digest channels)             | `DomainService.notify`, `features/notifications`                           |
| Privacy: host sees name/class/school/category only; App Admin sees counts  | `hostNominations`, admin dashboard                                         |

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
