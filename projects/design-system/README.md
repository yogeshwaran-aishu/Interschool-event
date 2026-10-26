# @isc/design-system

Design tokens, themes and Angular components for InterSchool Connect.

```scss
// angular.json → "styles"
"projects/design-system/src/styles/index.scss"
```

```ts
import { DsButton, DsField, DsControl, DsDialog, DsToastService } from '@isc/design-system';
```

- Themes: `<html data-theme="light|dark|system">`, set by `DsPreferencesService` (also `data-motion`, `data-text`).
- Tokens: `--ds-*` custom properties in `src/styles/_tokens.scss`. Every colour pair is AAA (7:1);
  run `npm run tokens:check` after changing one.
- Components never rely on colour alone, keep 44 px targets, and are covered by `src/lib/design-system.spec.ts`.

Build a publishable package with `ng build design-system` (output in `dist/design-system`).
