You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

## Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

## This project

- Workspace has two projects: `projects/design-system` (`@isc/design-system`, imported from source via the tsconfig path) and `projects/web` (the app).
- Visual styles belong in the design system (`projects/design-system/src/styles`), not in app components. Use `--ds-*` tokens; never hard-code colours. Run `npm run tokens:check` after changing a token.
- Target WCAG 2.2 AAA: 7:1 text contrast, 44 px targets, visible focus, no timed content. `npm run e2e` runs axe with `wcag2aaa` tags on desktop, tablet and phone.
- Workspace also has `server/`: the Node.js + PostgreSQL API (Express 5, `pg`, zod). Business rules (roles, school scope, deadlines, quotas, state machines) live in its services; routes stay thin. Add schema changes as new files in `server/migrations/`.
- In the app, all writes go through `DomainService` (`projects/web/src/app/core/domain.ts`), which calls the API and reloads `Store` from `GET /api/v1/state`. Components must not mutate `Store` directly.
- Every page has one `<h1 data-page-heading tabindex="-1">` (or `ds-page-header`) so focus can move there after navigation.
- Tests: `npm test` (Vitest, app), `npm run test:api` (Vitest + Supertest, real PostgreSQL), `npm run e2e` (Playwright against the API). Local stack: `npm run db`, `npm run api`, `npm start`. Use the Angular CLI MCP server (`.mcp.json`) for docs and best practices.
