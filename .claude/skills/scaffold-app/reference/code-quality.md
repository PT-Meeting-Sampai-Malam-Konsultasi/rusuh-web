# Step 7 — Code quality, tests, bundle check

## Files

| File | Content |
| --- | --- |
| `eslint.config.mjs` | Keep `eslint-config-next`; add `no-console: error`, import order via Prettier plugin or `import/order`, `react-hooks` rules; ignore `out/`, `.next/`, `coverage/` |
| `.prettierrc.json` | `singleQuote`, `printWidth: 120`, `trailingComma: 'all'` |
| `.stylelintrc.json` | `stylelint-config-standard`; allow at-rules `reference`, `apply`, `theme`, `variant`, `custom-variant`, `utility`, `import`; `selector-class-pattern` camelCase |
| `commitlint.config.mjs` | Conventional + feature scopes + `subject-ticket` rule (template below; rules in `.claude/rules/git-conventions.md`) |
| `lint-staged.config.mjs` | ts/tsx → eslint --fix + prettier; css → stylelint --fix + prettier; json/md → prettier |
| `.husky/commit-msg`, `.husky/pre-commit` | `npx husky init` then the two hooks (git-conventions rule) |
| `scripts/check-no-debug.mjs` | Below |
| `scripts/check-bundle-size.mjs` | Below |
| `vitest.config.mts` | `plugins: [tsconfigPaths(), react()]`, `environment: 'jsdom'`, `setupFiles: ['./vitest.setup.ts']`, coverage v8 with 85% thresholds on branches/functions/lines/statements, include `src/**` except `src/app/**` route files and `*.d.ts` |
| `vitest.setup.ts` | `@testing-library/jest-dom/vitest`, `cleanup` after each, `matchMedia` and `IntersectionObserver` mocks, `next/navigation` mock helpers |
| `.github/workflows/ci.yml` | `npm ci` → typecheck → lint → test:coverage → build → check:bundle; upload `out/` as an artifact |
| `.github/workflows/pr-title.yml` | On `pull_request`: `printf '%s\n' "$PR_TITLE" \| npx commitlint` (pass the title via `env`, never inline `${{ }}` in the script); the title is the squash commit |

Check `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` for the current Vitest setup. Async server
components are not unit-testable with Vitest; keep route files thin and test screens instead.

## `commitlint.config.mjs`

Tested with `@commitlint/cli` 21.2.4. Passes: `feat(login): [FR-06] add otp code step`,
`fix(queue): [FR-07][FR-09] …`, `chore(deps): bump next` (exempt), `docs(steering): [FR-06] …`. Rejects: no ticket on
`feat`, `feat(login):[FR-06] …` (no space), `[FR-6]`, `[FR-06]add` (no space after `]`), a layer scope
(`controller`), a missing scope, and a bracket that isn't a ticket on exempt types.

```js
// Conventional commits with the ticket in the subject: `feat(login): [FR-06] add otp code step`.
// Rules: .claude/rules/git-conventions.md
const EXEMPT = ['chore', 'ci', 'docs', 'style', 'revert'];
const TICKETS = /^((\[(FR|NFR|BR)-\d{2}\])+) \S/;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-ticket': ({ type, subject }) => {
          const s = subject ?? '';
          if (TICKETS.test(s)) return [true];
          if (EXEMPT.includes(type ?? '') && !s.startsWith('[')) return [true];
          return [false, 'start the subject with the ticket, e.g. "[FR-06] add otp code step" (FR-xx, NFR-xx, BR-xx; several: [FR-13][FR-15])'];
        },
      },
    },
  ],
  rules: {
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', [
      'home', 'queue', 'login', 'order', 'payment', 'ticket', 'account',
      'scaffold', 'deps', 'ci', 'steering', 'i18n', 'style', 'docs',
    ]],
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'style', 'chore', 'ci', 'revert']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'subject-ticket': [2, 'always'],
  },
};
```

## `scripts/check-no-debug.mjs`

```js
import { execSync } from 'node:child_process';

const PATTERNS = [
  { re: /console\.(log|debug|info|warn|error|trace|dir|table|group|groupEnd|time|timeEnd)\s*\(/, label: 'console.*()' },
  { re: /\bdebugger\b/, label: 'debugger' },
  { re: /\bconsole\.assert\s*\(/, label: 'console.assert()' },
];
const staged = execSync('git diff --cached --name-only --diff-filter=ACM')
  .toString().trim().split('\n').filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !f.startsWith('scripts/'));

let failed = false;
for (const file of staged) {
  let content;
  try { content = execSync(`git show :${file}`).toString(); } catch { continue; }
  content.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    for (const { re, label } of PATTERNS) {
      if (re.test(line)) { process.stderr.write(`Debug code [${label}] in ${file}:${i + 1}\n`); failed = true; }
    }
  });
}
if (failed) { process.stderr.write('Pre-commit blocked: remove debug statements.\n'); process.exit(1); }
```

## `scripts/check-bundle-size.mjs`

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const CHUNK_BUDGET = 50 * 1024;   // per chunk, gzip
const CSS_BUDGET = 30 * 1024;     // all CSS, gzip
const dir = 'out/_next/static/chunks';
const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => statSync(join(dir, f)).isFile());

let failed = false, css = 0;
for (const f of files) {
  const size = gzipSync(readFileSync(join(dir, f))).length;
  if (f.endsWith('.css')) css += size;
  else if (f.endsWith('.js') && size > CHUNK_BUDGET) { process.stderr.write(`Chunk over budget: ${f} ${size} B\n`); failed = true; }
}
if (css > CSS_BUDGET) { process.stderr.write(`CSS over budget: ${css} B\n`); failed = true; }
if (failed) process.exit(1);
process.stdout.write('Bundle size check passed.\n');
```

The per-route 150 KB first-load budget is read from the `next build` route table; Lighthouse CI enforces CWV.

## Gate

```bash
npm run build && npm run test && npm run lint
```
