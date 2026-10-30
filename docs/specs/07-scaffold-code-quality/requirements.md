# Requirements Document

## Introduction

Add the quality gates that run locally and in CI: ESLint, Stylelint, tests with coverage, bundle budgets, and the PR-title check (scaffold-app step 7).

## Glossary

| Term     | Definition                                    |
| -------- | --------------------------------------------- |
| Scaffold | The architecture base every feature builds on |

## Requirements

### Requirement 1: Linting

**User Story:**

AS a reviewer
I WANT style and debug rules enforced
SO THAT reviews focus on behaviour

#### Acceptance Criteria

- SHALL run ESLint (no-console, no-debugger) and Stylelint (Tailwind at-rules, camelCase module classes) in npm run lint
- SHALL run Stylelint on staged CSS in the pre-commit hook

### Requirement 2: CI

**User Story:**

AS the team
I WANT every PR checked the same way
SO THAT main stays deployable

#### Acceptance Criteria

- SHALL run typecheck, lint, tests with 85% coverage, build and the bundle check on every PR and push to main
- SHALL lint the PR title with commitlint

### Requirement 3: Bundle budgets

**User Story:**

AS a user on a phone
I WANT small pages
SO THAT the waiting room loads in a crowd

#### Acceptance Criteria

- SHALL fail when a non-framework chunk exceeds 50 KB gzip or CSS exceeds 30 KB
- SHALL report the home first-load JS
