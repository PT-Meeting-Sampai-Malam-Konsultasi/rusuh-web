# Requirements Document

## Introduction

The Detail Ticket screen and the mock API for FR-19-W1 (rusuh-web#18, "Countdowns from server time, kept across
refresh"; parent FR-19, rusuh-documentation#19). Specs 64 and 65 make a reload of `/order` claim the turn again (when a
queue place is stored) and continue the countdown from the server's lease end, or show the FR-18 time's-up sheet when
the window has ended. This spec (1) confirms the page shell needs no new UI and pins with a test that the sheet renders
over the loading state; (2) makes the **mock** `getCategories` window follow the claim like the real server
(`expiresAt` = the admitted place's claim time + the order window, the same on every request), and makes the mock queue
end an admitted place once its order window is over (a rejoin gets a new number at the back, a claim answers 410
`EXPIRED`), so the reload can be checked by hand under `?mock=short_window`. Sources: SRS FR-19
(`requirements/srs-v1.0-rusuh-booking-tiket.html` line 249); `architecture/sequence-diagrams.md` J9.6 (line 878) and
lines 881–882 (clocks); `openapi.yaml` `claimTurn` (lines 786–792, 862) and `joinQueue` (a place whose time ran out
rejoins at the back); `api/tokens.md` lines 40–43 (core's Detail countdown is the lease end) and 87–88 (a retried claim
keeps the slot and `exp`); ADR-0005, ADR-0014 (ID/EN), ADR-0030 (line 45).

Out of scope: any new section, style or copy (the `ADMISSION_UNAVAILABLE` message is spec 65); order input across a
refresh; the payment countdown (FR-21-W1, when the payment page is built: rusuh-web#18 lists Payment too); removing the
mock `fallbackToken` (kept: see Requirement 2).

## Glossary

| Term                | Definition                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mock queue state    | The mock queue's places, numbers and queues, kept in localStorage `rusuh.mock.queue` and shared by the tabs |
| Admitted place      | A mock place with `admittedAt` set by the first mock claim; a repeat claim keeps it                         |
| Mock order window   | 300 s, or 75 s under `?mock=short_window` (`MOCK_SHORT_ORDER_WINDOW_MS`)                                    |
| Mock admission life | 16 min from `admittedAt` (`ADMISSION_MS`: claim + order + payment, ADR-0021); the mock's record lifetime    |
| Fallback token      | `MOCK_ADMISSION_TOKEN`: what `admissionStore.get` returns in mock mode when nothing is stored               |
| Reload check        | The manual check: queue → order, wait to about 0:40, reload; and reload after 0:00                          |

## Requirements

### Requirement 1: No new UI; the sheet covers any state

**User Story:**

AS a buyer who reopens the order page after my time ran out
I WANT the time's-up sheet even while the page behind is still a skeleton
SO THAT I see the message at once and can queue again

#### Acceptance Criteria

- SHALL keep `src/presentation/pages/Order/index.tsx`, its sections and `src/app/order/page.tsx` without changes: the
  shell already renders `{timeUpSheet && <OrderTimeUpSheet sheet={timeUpSheet} />}` after `</main>`, independent of
  `status`
- WHEN `status` is `'loading'` and `timeUpSheet` is non-null THEN the screen SHALL render the dialog and the skeleton
  (`OrderSkeleton`) under it, and no `Timer` (timer null)
- WHEN `status` is `'error'` and `timeUpSheet` is non-null THEN the screen SHALL render the dialog and the error message
- WHEN a resumed answer is ready THEN the page SHALL look exactly as a first load (no "resumed" UI)

### Requirement 2: The mock order window follows the claim

**User Story:**

AS a developer or QA checking FR-19 without a backend
I WANT the mock to keep the same order window across requests
SO THAT a reload continues the countdown as the real server does

#### Acceptance Criteria

- WHEN the mock `getCategories` answers for an event that has an admitted mock place claimed less than the mock
  admission life ago THEN `expiresAt` SHALL be the latest such `admittedAt` + the mock order window (by the current
  scenario), and `serverNow` the mock clock
- WHEN that `expiresAt` has already passed THEN the mock SHALL still answer 200 with that past `expiresAt` (the client
  shows time's up at once)
- WHEN the event has no admitted place (e.g. `/order` opened directly) or only older ones THEN `expiresAt` SHALL be the
  mock clock + the mock order window, as today
- WHEN the same admitted place is asked twice (a reload, a language switch) THEN both answers SHALL have the same
  `expiresAt`
- SHALL keep every other `getCategories` behaviour (403 without a token or for an unknown event, `admission_invalid`,
  `sold_out`, `error`, `offline`, `slow`, the locale)
- SHALL keep the mock `fallbackToken` in mode `NEXT_PUBLIC_API_MOCK=true`; the no-token branches of spec 64 (stored-place
  check, re-claim) are therefore not exercised in mock mode and are covered by unit tests

### Requirement 3: The mock queue ends an admitted place after its order window

**User Story:**

AS a developer checking "Antre lagi" after time's up in the mock
I WANT the mock queue to treat a used place as over
SO THAT a rejoin gets a new number at the back instead of the old admitted place (which would show time's up again)

#### Acceptance Criteria

- SHALL treat an admitted mock place as ended once the mock clock is at or past `admittedAt` + the mock order window
- WHEN `joinQueue` finds the device's place ended THEN it SHALL give a new number at the back (as for a missed place)
- WHEN `claimTurn` or `getMyPlace` finds the place ended THEN it SHALL delete it and answer 410 `EXPIRED`
- WHEN the place is admitted and its window is still open THEN a repeat claim SHALL return the same admission (unchanged)
- SHALL share one mock queue state between the queue and booking handlers of one `createHandlers` call, still persisted
  in localStorage `rusuh.mock.queue`

### Requirement 4: Tests and manual check

**User Story:**

AS a developer
I WANT the reload behaviour pinned and checked by hand
SO THAT FR-19 keeps working

#### Acceptance Criteria

- SHALL extend `src/presentation/pages/Order/__tests__/index.test.tsx`: the sheet over `status` `'loading'` (skeleton
  under it, no timer) and over `'error'`
- SHALL add `src/infrastructure/mocks/__tests__/order-window.handlers.test.ts` (node, MSW, a mutable clock): window from
  the claim; same `expiresAt` across requests and locales; 132 s left after 168 s; `short_window` 75 s from the claim;
  a past `expiresAt` answered as is; fresh window with no admitted place and after the mock admission life; claim and
  `getMyPlace` 410 `EXPIRED` after the window; rejoin at the back; a repeat claim inside the window unchanged; one state
  per `createHandlers` call
- SHALL keep `queue.handlers.test.ts`, `booking.handlers.test.ts` and `scenario.test.ts` passing
- SHALL pass `npx tsc --noEmit && npx vitest --run && npm run build`, then the manual reload check under
  `?mock=short_window` at 390 and 1440, ID and EN
