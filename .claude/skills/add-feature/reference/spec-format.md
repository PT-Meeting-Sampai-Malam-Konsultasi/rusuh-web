# Spec format

Specs live in `docs/specs/{nn}-{feature}-{layer}/`, numbered in build order (`01-scaffold-project-config`,
`12-waiting-room-controller`, …). Each has three files. Keep a spec to **3–8 tasks**; split it otherwise.

## `requirements.md`

```markdown
# Requirements Document

## Introduction

{1–3 sentences: what this spec implements and why. Cite PRD ids (e.g. W-1, D-3) and SRS codes.}

## Glossary

| Term | Definition |
| --- | --- |
| {Term} | {Definition} |

## Requirements

### Requirement 1: {Title}

**User Story:**

AS a {role}
I WANT {capability}
SO THAT {value}

#### Acceptance Criteria

- SHALL {behaviour}
- WHEN {trigger} THEN {outcome}
- SHALL NOT {prohibition}
```

## `design.md`

```markdown
# Design Document

## Overview
## Architecture            ← route, layers involved, data flow, API operations
## Components and Interfaces  ← TypeScript interfaces (service, use case, controller, component props)
## Data Models             ← entity types, results, state shapes
## Layer Constraints       ← verbatim rules from the matching .claude/rules file
## Correctness Properties  ← "Property N: …" then "**Validates: Requirements N**"
## Error Handling          ← every API error code and what the user sees
## Testing Strategy
```

## `tasks.md`

````markdown
# Implementation Plan: {Spec name}

## Overview

{One paragraph}

## Tasks

- [ ] 1. {Task} [Requirement 1]
- [ ] 2. {Task} [Requirement 1, Requirement 2]
- [ ] 3. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3]] }
```

## Notes

- {Order, caveats, reuse}
````

## Rules

- Flat numbered checkboxes; no `###` inside `## Tasks`; mark `[x]` as soon as a task is done.
- Every requirement has at least one task; every task cites a requirement (`[ALL]` for the gate).
- `waves` lists every task exactly once; tasks in a later wave depend on earlier waves.
- Paths: `src/core/…` (not `src/@core/`), screens in `src/presentation/pages/…`, routes in `src/app/…`, controllers in
  `src/controllers/{name}.controller.ts`.
