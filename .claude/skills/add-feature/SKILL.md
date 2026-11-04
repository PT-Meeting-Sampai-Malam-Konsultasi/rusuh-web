---
name: add-feature
description: Build one feature or page of rusuh-web end to end — write specs per layer from the Rusuh PRD, App Flow and API, then implement entity, service, use case, controller and page through the layer writer agents, with a gate check after each layer. Use for any new screen, state or flow (e.g. waiting room, sign in, detail, payment, e-ticket, account).
---

# Add a feature

One feature = one route or flow from the [App Flow](../../../../rusuh-documentation/product/app-flow.md). Work layer
by layer, inside out, and keep progress on disk so a new session can resume.

## 0. Understand

1. Read the feature's sections in the PRD (`../rusuh-documentation/product/prd.md` §6), the App Flow screen, the
   Design Brief, the Backend Schema API map and the operations in `../rusuh-documentation/api/openapi.yaml`.
2. Open the HiFi screens for every state (`design/hifi/<page>.html?state=…` in the project folder) and the App Flow
   "HiFi gaps" list: the ADRs win over the HiFi.
3. List: states, API operations, error codes, timers, translations, analytics events.
4. Ask the user only if an answer changes the behaviour and can't be found in those documents.

## 1. Specs

Delegate to the `spec-writer` agent: one spec per layer in `docs/specs/{nn}-{feature}-{layer}/` with `requirements.md`,
`design.md`, `tasks.md` (format: `reference/spec-format.md`). Layers, in order:

| Layer | Spec when | Reference | Writer |
| --- | --- | --- | --- |
| entity + service | The feature calls an API not yet wrapped | `reference/add-entity.md`, `reference/add-service.md` | service-writer |
| use case | There is business logic (see the use-case rule table) | `reference/add-use-case.md` | use-case-writer |
| controller | Always | `reference/add-controller.md` | controller-writer |
| page | Always | `reference/add-page.md` | presentation-writer |

Each `design.md` copies the relevant rule constraints verbatim under `## Layer Constraints`. Show the specs to the user
before implementing when the feature is new.

## 2. Implement, layer by layer

For each spec, delegate to its writer agent with: the three spec files, the reference file, the matching
`.claude/rules/*.md`, `src/infrastructure/di/registry.types.ts`, and the first completed file of that layer as a pattern
(if one exists). The writer marks tasks `[x]` as it goes and returns only after its gate passes:

| Layer | Gate |
| --- | --- |
| entity, service, use case, controller | `npx tsc --noEmit && npx vitest --run` |
| page | `npx tsc --noEmit && npx vitest --run && npm run build` |

Check the writer's result yourself (read the diff, run the gate) before starting the next layer.

## 3. Verify and hand over

1. Run `/verify`.
2. Open the screen in the browser at 390 and 1440 width, every state, ID and EN; compare with the HiFi.
3. Commit per layer on the feature branch, feature scope and ticket in the subject:
   `feat(login): [FR-06] add auth service`, `feat(login): [FR-06] add sign-in controller`, `feat(login): [FR-06] add sign-in screen`.
4. Report: what was built, states covered, anything deferred, test and gate results.

## Resume

If `docs/specs/` has unfinished `tasks.md` files, continue from the first unchecked task of the lowest-numbered spec.
