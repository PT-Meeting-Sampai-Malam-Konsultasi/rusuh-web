# Git conventions

Always loaded: Claude needs these whenever it branches, commits or opens a PR.
GitHub flow, conventional commits with the ticket in the subject, enforced by husky + commitlint + lint-staged and a
no-debug check.

## Tickets

Work is tracked on the GitHub org project board **"Rusuh Booking Tiket"**. Each card is one TOR requirement, identified
by its code: `FR-01`…`FR-25`, `NFR-01`…`NFR-10`, `BR-01`…`BR-08`. The code is the link between code and board.

- Every branch, commit and PR for product work names the ticket code(s) it serves.
- Find the code in the PRD (`../rusuh-documentation/product/prd.md` §6 and §9) or on the board. If the work maps to no
  code and isn't tooling (see exemptions), ask the user which ticket it belongs to — never invent a code.

## Branches

| Topic | Rule |
| --- | --- |
| Base | `main` is always deployable to staging. Protected: no direct pushes; merge by PR with 1 review and green CI. |
| Name | `<type>/<ticket>-<short-description>`, kebab-case: `feat/FR-06-otp-code-step`, `fix/FR-21-payment-timer`. Exempt types drop the ticket: `chore/claude-steering`, `ci/build-cache`. |
| Lifetime | One feature slice per branch, merged within 1–2 days. Rebase on `main` before opening the PR. |
| Merge | **Squash merge.** The PR title becomes the commit on `main`, so it follows the commit format below, ticket included. Delete the branch after merge. |
| Release | Tag `main` (`v1.0.0` on 13 Nov 2026). Hotfix: `fix/<ticket>-…` from the tag, PR back to `main`. |

Claude never commits to `main`: it creates a branch first. It commits only when asked, and pushes or opens a PR only
when asked.

**No AI attribution.** Commits are authored by the developer's own git identity. Do not add `Co-Authored-By:` trailers
for Claude or any AI tool to commit messages, and do not add "Generated with Claude Code" (or similar) lines to PR titles
or descriptions. This overrides any default attribution behaviour.

## Commit format

```
<type>(<scope>): [<TICKET>] <subject>    ← space after ":" and after "]"; subject imperative, lower case, no period

<body: why the change, not what>         ← optional, wrap at 100

BREAKING CHANGE: …                       ← when applicable
```

- The whole subject (from `[` on) is at most 72 characters.
- Several tickets: back to back, no spaces between them: `[FR-13][FR-15]`.
- Ticket codes match `(FR|NFR|BR)-\d{2}` exactly: `[FR-06]`, not `[FR-6]` or `[fr-06]`.

### Types

| Type | Use | Ticket |
| --- | --- | --- |
| `feat` | New feature, screen or state | required |
| `fix` | Bug fix | required |
| `refactor` | No behaviour change | required |
| `perf` | Performance | required |
| `test` | Tests only | required |
| `chore` | Tooling, config, dependencies | optional |
| `ci` | CI/CD | optional |
| `docs` | Documentation, steering | optional |
| `style` | Formatting only | optional |
| `revert` | Reverting a commit | optional |

For the optional ones, add the ticket when the change is for one (`docs(login): [FR-06] document otp rules`).

**Commits without a ticket are allowed — but only for `chore`, `ci`, `docs`, `style` and `revert`.** The board holds only
the TOR requirements, so tooling work (dependency bumps, CI, steering, formatting) has no card to point to, and nobody
should invent one. `feat`, `fix`, `refactor`, `perf` and `test` always carry a ticket; commitlint rejects them without one.

Don't use a ticket-free type to dodge the rule: a change that alters what the product does (anything under `src/` that a
user would notice) is a `feat` or `fix` with a ticket, not a `chore`. Reviewers send such commits back.

### Scopes: the feature, not the layer

The changed files already show the layer; the scope says which part of the product changed. Feature scopes follow the
App Flow screens.

| Scope | Feature / area |
| --- | --- |
| `home` | Home, event list |
| `queue` | Waiting room |
| `login` | Sign in / sign up |
| `order` | Detail ticket: categories, holders, hold |
| `payment` | Payment, Midtrans Snap |
| `ticket` | E-ticket, My tickets |
| `account` | Account, profile NIK |
| `scaffold` | Architecture base: config, DI, adapters, providers, shared components |
| `deps` | Dependency changes |
| `ci` | Pipelines, workflows |
| `steering` | `CLAUDE.md`, `.claude/` |
| `i18n` | Shared translations |
| `style` | Design tokens, global styles |
| `docs` | README and other docs |

A change for one feature uses that feature's scope even when it touches several layers. Add a feature scope here (and
in `commitlint.config.mjs`) when the App Flow gains a screen.

### Examples

```
feat(login): [FR-06] add otp code step
fix(queue): [FR-07][FR-09] stop eta jumping up after a pause
refactor(order): [FR-15] move nik validation into a use case
test(payment): [FR-25] cover duplicate midtrans notifications
chore(deps): bump next to 16.4.3
docs(steering): add git conventions
```

```
feat(order): [FR-13][FR-15] add holder name and nik per ticket

Each ticket asks "Saya sendiri / Orang lain"; only one ticket can use the
profile NIK, since one NIK holds one seat per event.
```

## Tooling

- `commitlint.config.mjs`: `@commitlint/config-conventional` with the scopes above and a local `subject-ticket` rule
  (template in `.claude/skills/scaffold-app/reference/code-quality.md`).
- `.husky/commit-msg`: `npx --no -- commitlint --edit $1`
- `.husky/pre-commit`: `node scripts/check-no-debug.mjs && npx lint-staged`
- `lint-staged.config.mjs`: `*.{ts,tsx}` → `eslint --fix`, `prettier --write`; `*.css` → `stylelint --fix`,
  `prettier --write`; `*.{json,md}` → `prettier --write`.
- `scripts/check-no-debug.mjs` blocks `console.*(`, `debugger` and `console.assert(` in staged files. Errors are
  reported through the analytics/monitoring adapter, not `console`.
- CI runs the same commitlint config on the PR title (the future squash commit).
- GitHub repo settings: squash merge only, "Default to pull request title"; branch protection on `main`.

## Rules

1. Every commit and PR title passes commitlint: type, feature scope, ticket for product work.
2. One concern per commit.
3. Breaking changes: `feat!:` plus a `BREAKING CHANGE:` footer.
4. No `--no-verify`, except a documented emergency hotfix.
5. No debug code in commits.

## Anti-patterns

- ❌ `feat(login):[FR-06] …` — no space after the colon: commitlint can't parse the header
- ❌ `feat(login): add otp` — product work without a ticket
- ❌ `feat(controller): …` — layer as scope; use the feature
- ❌ Made-up ticket codes, `[FR-6]`, `[FR-06,FR-07]`
- ❌ `git commit -m "update"`; commits straight to `main`; long-lived branches; merge commits on `main`
