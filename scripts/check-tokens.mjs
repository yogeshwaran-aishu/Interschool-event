// Verifies design-token colour pairs against WCAG 2.2 contrast thresholds.
// AAA text: 7:1. Non-text UI (borders, focus rings): 3:1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../projects/design-system/src/styles/_tokens.scss', import.meta.url)),
  'utf8',
);

function tokensFor(mixin) {
  const body = src.split(`@mixin ${mixin}`)[1].split('@mixin')[0];
  const out = {};
  for (const [, name, hex] of body.matchAll(/--ds-([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[name] = hex;
  return out;
}

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const backgrounds = ['bg', 'surface', 'surface-2'];
const text = [
  'text',
  'text-muted',
  'primary',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
  'neutral',
];
const pairs = [
  ...text.flatMap((t) => backgrounds.map((b) => [t, b, 7])),
  ['on-primary', 'primary', 7],
  ['on-primary', 'primary-hover', 7],
  ['on-primary-soft', 'primary-soft', 7],
  ['on-danger', 'danger', 7],
  ...['success', 'warning', 'danger', 'info', 'neutral', 'accent'].map((t) => [t, `${t}-soft`, 7]),
  ['text', 'surface-3', 7],
  ['border-strong', 'surface', 3],
  ['border-strong', 'bg', 3],
  ['focus', 'surface', 3],
  ['focus', 'bg', 3],
];

let failed = 0;
for (const theme of ['light-tokens', 'dark-tokens']) {
  const t = tokensFor(theme);
  for (const [fg, bg, min] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${theme.padEnd(12)} ${fg.padEnd(16)} on ${bg.padEnd(14)} ${r.toFixed(2)}:1 (min ${min})`,
    );
  }
}
if (failed) {
  console.error(`\n${failed} pair(s) below threshold`);
  process.exit(1);
}
console.log('\nAll token pairs meet WCAG 2.2 AAA targets.');
