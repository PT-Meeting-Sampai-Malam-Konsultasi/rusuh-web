# Requirements Document

## Introduction

Configure the generated Next.js 16 project for the rusuh-web architecture: path aliases, scripts, test runner, editor settings and public assets (scaffold-app step 1).

## Glossary

| Term     | Definition                                    |
| -------- | --------------------------------------------- |
| Scaffold | The architecture base every feature builds on |

## Requirements

### Requirement 1: Path aliases

**User Story:**

AS a developer
I WANT one alias per layer
SO THAT imports show which layer they reach

#### Acceptance Criteria

- SHALL define @core, @infrastructure, @controllers, @presentation, @contexts, @utils, @styles, @translation in tsconfig
- SHALL keep @/* pointing at src/*

### Requirement 2: Scripts and tests

**User Story:**

AS a developer
I WANT standard npm scripts and a working test runner
SO THAT every step has a gate

#### Acceptance Criteria

- SHALL provide dev, build, start (serves out/), lint, format, test, test:watch, test:coverage, typecheck, check:bundle
- SHALL configure Vitest with jsdom, Testing Library and 85% coverage thresholds

### Requirement 3: Public assets

**User Story:**

AS a user
I WANT Rusuh assets instead of the generator samples
SO THAT nothing from the template ships

#### Acceptance Criteria

- SHALL serve the HiFi fonts from public/fonts and a robots.txt
- SHALL replace the Next.js favicon with a Rusuh icon
- SHALL NOT keep the generator sample SVGs
