# Design Document

## Overview

`PaymentController` (`src/controllers/payment.controller.ts`) is extended, not replaced:

1. **Outcome everywhere.** `Phase`'s inactive member becomes `{ kind: 'inactive'; outcome: InactiveOutcome }`; the pay
   `onSuccess` and the status-step handler store the whole outcome. One derived value:
   `ended = pageQuery.data?.kind === 'inactive' ? pageQuery.data : phase.kind === 'inactive' ? phase.outcome : null`
   (the page answer first: it is the latest server read after the FR-21 refetch).
2. **New state.** `else if (ended) state = ended.reason === 'expired' ? 'expired' : 'inactive';` replaces today's
   inactive line. `refund = ended?.refund ?? false`.
3. **Seen order.** `seen: { view: PaymentView; tickets: PaymentTicketLine[] } | null` in `useState`, written in the same
   guarded render-time block as the FR-21 anchor (`setSeen(loaded)`), so it survives the refetch that turns
   `pageQuery.data` into the inactive outcome. Used for the count fallback, the e-mail and the summary.
4. **`expired: PaymentExpiredView | null`**, built only in the `expired` state; `message` stays for `inactive`,
   `not-found`, `error`.
5. **"Antre lagi"**: `onQueueAgain` with a once-only ref.

No use case beyond spec 81 and the existing `endOrderWindowUseCase`; no new query, mutation, popup or overlay.

**Reusing `endOrderWindowUseCase`.** Its contract (spec 61) is exactly what "forget this device's ended turn" needs:
`execute(eventId)` sets the event's admission token to `null` and removes its stored queue place, makes no API call,
returns `{ kind: 'ended' }` and is safe to repeat. At payment time the place was already removed by `claimTurn`, but the
admission token is still stored; without clearing it the waiting room would treat the buyer as admitted. The name says
"order window", the effect is the same ("the next waiting-room visit joins at the back", Q-26), so a second use case
would only forward the same two store calls (rule anti-pattern). It is synchronous, so calling it from a click handler
is not async work for TanStack (as `order.controller.ts` calls it from an effect).

**Analytics decisions.** `payment_expired` stays where FR-21-W1 put it (the countdown's zero, once per visit); this spec
adds none, so a page that turns expired after zero is not counted twice, and a reopened expired booking is not counted
again. `ORDER_EXPIRED` belongs to the order window (spec 60 Requirement 3 lists it with "the order-timer screens";
`order.controller.ts` currently sends `order_time_up`), not here. `queue_rejoin` uses `{ eventId, from: 'payment' }`,
the shape `order.controller.ts` sends with `from: 'order'`, through the constant `ANALYTICS_EVENTS.QUEUE_REJOIN`.

**Differences from the HiFi (ADRs / review win):**

| Topic        | HiFi (`payment.html` 84–90)                                             | This spec                                                                                          |
| ------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Trigger      | `data-onzero="expired"` on the device-clock countdown                   | the server's 409 / dead status, through spec 81 (ADR-0026); the client's zero only refetches       |
| Refund note  | "dana dikembalikan **otomatis** ke metode yang sama"                    | "dana akan kami kembalikan" (H-4, ADR-0009: flagged, Finance refunds); definite text when `refund` |
| E-mail       | a literal address                                                       | `view.customerEmail` of this visit, else "email akun Anda"                                         |
| Count        | "3 tiket"                                                               | `ticketCount` from `getBooking`, else the seen order, else a count-free body                       |
| "Antre lagi" | link to `waiting-room.html`                                             | forget the turn, `queue_rejoin`, `router.replace('/queue?event=…')`; hidden without `eventId`      |
| Aside        | stays (no `data-state` on `aside.sum`; its pay button is `select` only) | kept when a seen order exists, `pay` null; absent on a first load (no `PaymentView` on a 409)      |

## Architecture

```
PaymentScreen ─► container.resolve('paymentController')       (src/infrastructure/di/controllers/payment.ts, unchanged)
  ├─ pageQuery (load) / payMutation / statusQuery            unchanged calls; inactive results now carry InactiveOutcome
  ├─ anchor + seen                                           guarded render-time update (one block)
  ├─ phase: … | { kind: 'inactive'; outcome }                pay onSuccess / status-step handler store the outcome
  ├─ ended = page inactive ?? phase inactive ?? null
  ├─ state: … → ended ? (reason === 'expired' ? 'expired' : 'inactive') → leaving → …
  ├─ timer / timeUp / clock / time-up effect                 unchanged (TIMER_STATES has no 'expired')
  ├─ summary: order = state === 'expired' ? seen : loaded;   showsOrder gains 'expired'
  ├─ expired: PaymentExpiredView | null                      new
  └─ onQueueAgain → endOrderWindowUseCase.execute → trackEvent(QUEUE_REJOIN) → router.replace(/queue?event=)
```

Route `/payment?booking=<id>` (unchanged) → "Antre lagi" → `/queue?event=<eventId>` (replace, so Back never returns to
the dead order). API operations, all through spec 81: `getPaymentPage`, `startSnapPayment`, `getPaymentStatus`,
`getBooking`.

## Components and Interfaces

```ts
// src/controllers/payment.controller.ts (changes; everything else unchanged)
import type { InactiveOutcome, PaymentTicketLine /* …existing… */ } from '@core/use_case/payment/pay-booking.use-case';
import type { PaymentView } from '@core/entities/payment/payment.entity';

export type PaymentScreenState =
  | 'loading'
  | 'ready'
  | 'opening'
  | 'verifying'
  | 'failed'
  | 'busy'
  | 'inactive'
  | 'expired'
  | 'not-found'
  | 'error'
  | 'leaving';

/** The "Waktu habis" screen (FR-23-W1, HiFi payment.html 84–90). Texts are translated. */
export interface PaymentExpiredView {
  /** "Waktu habis" / "Time's up" (Stamp uppercases it). */
  stamp: string;
  /** "Pesanan dibatalkan." / "Order cancelled." */
  title: string;
  /** With the held-ticket count, or the count-free text. */
  body: string;
  /** "Saldo terpotong?" shown bold before `note`; null when `note` is the definite refund text (it carries the lead). */
  noteLead: string | null;
  note: string;
  /** "Antre lagi" / "Queue again". */
  queueAgainLabel: string;
  /** Null when the event is unknown: the page hides the button. */
  onQueueAgain: (() => void) | null;
  /** ROUTES.HOME. */
  homeHref: string;
  /** "Ke beranda" / "Go home". */
  homeLabel: string;
}

export interface PaymentControllerInterface {
  // …all existing fields unchanged…
  /** Non-null exactly when state is 'expired'. */
  expired: PaymentExpiredView | null; // ← new
}

type PaymentControllerDeps = Pick<
  AwilixRegistry,
  /* …existing keys… */ 'endOrderWindowUseCase' // ← new
>;
```

Module scope (not exported):

```ts
type Phase = /* …unchanged members… */ { kind: 'inactive'; outcome: InactiveOutcome };

/** The last real ready answer of this visit: survives the refetch that turns the page inactive. */
interface SeenOrder {
  view: PaymentView;
  tickets: PaymentTicketLine[];
}
```

Body sketch (no helpers in the body; expressions only):

```ts
const [seen, setSeen] = useState<SeenOrder | null>(null);
if (loaded && !pageQuery.isPlaceholderData && pageQuery.dataUpdatedAt !== anchor?.receivedAt) {
  setAnchor({
    expiresAt: loaded.view.expiresAt,
    serverNow: loaded.view.serverNow,
    receivedAt: pageQuery.dataUpdatedAt,
  });
  setSeen(loaded);
}

const rejoined = useRef(false);
const eventId = ended?.eventId ?? null;
const onQueueAgain = useCallback(() => {
  if (!eventId || rejoined.current) return;
  rejoined.current = true;
  endOrderWindowUseCase.execute(eventId);
  analyticsAdapter.trackEvent(ANALYTICS_EVENTS.QUEUE_REJOIN, { eventId, from: 'payment' });
  router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
}, [eventId, endOrderWindowUseCase, analyticsAdapter, router]);

const count = ended?.ticketCount || seen?.tickets.length || null;
const email = seen?.view.customerEmail?.trim() || null;
const expired: PaymentExpiredView | null =
  state === 'expired' && ended
    ? {
        stamp: t('payment_expired_stamp'),
        title: t('payment_expired_title'),
        body: count ? t('payment_expired_body', { count }) : t('payment_expired_body_unknown'),
        noteLead: ended.refund ? null : t('payment_expired_note_lead'),
        note: ended.refund
          ? t('payment_inactive_refund')
          : email
            ? t('payment_expired_note_email', { email })
            : t('payment_expired_note_account'),
        queueAgainLabel: t('payment_expired_queue_again'),
        onQueueAgain: eventId ? onQueueAgain : null,
        homeHref: ROUTES.HOME,
        homeLabel: t('action_back_home'),
      }
    : null;
```

Compile check: `pageQuery.data` narrowed by `kind === 'inactive'` is `InactiveOutcome`; `PaymentStep`'s inactive member
is the same type, so `setPhase({ kind: 'inactive', outcome: step })` type-checks. `endOrderWindowUseCase:
EndOrderWindowUseCaseInterface` is already an `AwilixRegistry` key registered in `registerAll()`; `asFunction(PaymentController)`
and `paymentController: PaymentControllerInterface` are unchanged. The hooks stay unconditional (`useState` for `seen`
next to `anchor`; `useRef` + `useCallback` before the views).

## Data Models

Translation keys used here, **written to `id.json` / `en.json` by spec 83 task 1** (same PR):

| Key                                | ID                                                                                                                   | EN                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `payment_expired_stamp`            | Waktu habis                                                                                                          | Time's up                                                                                                      |
| `payment_expired_title`            | Pesanan dibatalkan.                                                                                                  | Order cancelled.                                                                                               |
| `payment_expired_body_one`         | Waktu 10 menit untuk membayar sudah lewat. {{count}} tiket yang ditahan kami lepaskan untuk pembeli lain.            | The 10 minutes to pay ran out. We've released the held ticket to other buyers.                                 |
| `payment_expired_body_other`       | Waktu 10 menit untuk membayar sudah lewat. {{count}} tiket yang ditahan kami lepaskan untuk pembeli lain.            | The 10 minutes to pay ran out. We've released the {{count}} held tickets to other buyers.                      |
| `payment_expired_body_unknown`     | Waktu 10 menit untuk membayar sudah lewat. Tiket yang ditahan kami lepaskan untuk pembeli lain.                      | The 10 minutes to pay ran out. We've released the held tickets to other buyers.                                |
| `payment_expired_note_lead`        | Saldo terpotong?                                                                                                     | Money already taken?                                                                                           |
| `payment_expired_note_email`       | Jika pembayaran Anda masuk setelah waktu habis, dana akan kami kembalikan. Rinciannya kami kirim ke {{email}}.       | If your payment arrived after the time ran out, we'll refund it and email the details to {{email}}.            |
| `payment_expired_note_account`     | Jika pembayaran Anda masuk setelah waktu habis, dana akan kami kembalikan. Rinciannya kami kirim ke email akun Anda. | If your payment arrived after the time ran out, we'll refund it and email the details to your account address. |
| `payment_expired_queue_again`      | Antre lagi                                                                                                           | Queue again                                                                                                    |
| `payment_inactive_refund` (exists) | Saldo terpotong? Pembayaran Anda masuk setelah waktu habis. Dana akan kami kembalikan; rinciannya …                  | Money already taken? Your payment arrived after the time ran out. …                                            |
| `action_back_home` (exists)        | Ke beranda                                                                                                           | Go home                                                                                                        |

Analytics: `queue_rejoin` `{ eventId, from: 'payment' }` on "Antre lagi" (once). Nothing else new.

State examples (booking `bk1`, event `evt_1`, 3 tickets, `customerEmail` `rina@example.com`):

| Situation                                                    | state    | expired.body (count) | noteLead | note                      | onQueueAgain | summary |
| ------------------------------------------------------------ | -------- | -------------------- | -------- | ------------------------- | ------------ | ------- |
| countdown zero → refetch → `{ reason: 'expired', 3, evt_1 }` | expired  | 3                    | lead     | `…_note_email` (rina@…)   | fn           | seen    |
| first load → 409 → `{ reason: 'expired', 3, evt_1 }`         | expired  | 3                    | lead     | `…_note_account`          | fn           | null    |
| first load → `{ refund: true, reason: 'expired' }`           | expired  | 3                    | null     | `payment_inactive_refund` | fn           | null    |
| first load → getBooking failed (`null`, `null`)              | expired  | unknown              | lead     | `…_note_account`          | null         | null    |
| countdown zero → getBooking failed                           | expired  | 3 (seen order)       | lead     | `…_note_email`            | null         | seen    |
| poll step `{ reason: 'expired' }`                            | expired  | 3                    | lead     | `…_note_email`            | fn           | seen    |
| `{ reason: 'other' }` (CANCELLED)                            | inactive | —                    | —        | (existing `message`)      | —            | null    |

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
- ✅ import type { ... } from '@core/...';
- ✅ import type { AwilixRegistry } from '@infrastructure/di/registry.types';
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- `src/controllers/__tests__/{page-name}.controller.test.ts`
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.
- [ ] No `.then(`, `.catch(`, or `useEffect` with a service call
- [ ] No direct imports of framework or context hooks
- [ ] No business logic or helpers in the body
- [ ] One query/mutation per async operation
- [ ] `toggleLoading()` in all three mutation paths
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface

Notes: expired vs other, the event and the count are decided in spec 81; the controller only picks keys. The
`endOrderWindowUseCase` call is a synchronous store update in a click handler, not a service call. `toggleLoading()`
does not apply (no mutation added). `ROUTES.QUEUE` and `withQuery` come from `@utils/constants/routes` (no hard-coded
path).

From `.claude/rules/error-handling.md`:

- `401` always goes to sign-in; never an "unauthorized" page.
- Never show stack traces or status codes.

From `CLAUDE.md`:

- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.
- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: `pageState.data = expiredOutcome` (`reason: 'expired'`, 3, `evt_1`) on first load gives `state: 'expired'`,
  `message: null`, `summary: null`, `timer: null`, `timeUp: false`, `intro`/`pay`/`notice`/`progress` null, and `expired`
  with the keys of Requirement 1. **Validates: Requirements 1, 5**
- Property 2: ready → countdown zero → `rerender` with `pageState.data = expiredOutcome` gives `expired`, `summary` from
  the seen order (same `orderCode`), `pay: null`. **Validates: Requirements 1, 5**
- Property 3: pay `onSuccess(expiredOutcome)` and a status step `expiredOutcome` both give `state: 'expired'`; the
  status query is disabled afterwards. **Validates: Requirements 1, 5**
- Property 4: `{ reason: 'other' }` gives `state: 'inactive'`, `expired: null` and the existing `message`.
  **Validates: Requirements 1**
- Property 5: body is `payment_expired_body` with `{ count: 3 }` from `ticketCount`; with `ticketCount: null` after a
  seen order of 2 tickets `{ count: 2 }`; with neither, `payment_expired_body_unknown`. **Validates: Requirements 2**
- Property 6: `refund: true` → `noteLead: null`, `note: 'payment_inactive_refund'`; `refund: false` with a seen
  `customerEmail` → `payment_expired_note_email` called with `{ email: 'rina@example.com' }`; without a seen order or with
  `customerEmail: '  '` → `payment_expired_note_account`. **Validates: Requirements 3**
- Property 7: `onQueueAgain()` calls `endOrderWindowUseCase.execute('evt_1')`, then `trackEvent('queue_rejoin',
{ eventId: 'evt_1', from: 'payment' })`, then `router.replace('/queue?event=evt_1')`, in that order; a second call does
  nothing; with `eventId: null` `onQueueAgain` is `null`. **Validates: Requirements 4, 6**
- Property 8: reaching `expired` (any source) never calls `execute`, `router.replace` or `trackEvent('payment_expired')`
  beyond what FR-21 already did (one at zero); no `trackEvent` argument contains the e-mail. **Validates: Requirements 4, 6**
- Property 9: every existing `PaymentController` test passes with inactive fixtures widened to `InactiveOutcome`
  (`reason: 'other'` where they assert today's `message`); `PaymentControllerDeps` gains only `endOrderWindowUseCase`.
  **Validates: Requirements 7**

## Error Handling

| Source / outcome                                                    | state / view                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| load / refetch / pay / poll → `InactiveOutcome` `reason: 'expired'` | `expired` (full screen)                                                 |
| same with `refund: true` (`paid_after_expiry`, `refundRequired`)    | `expired`, definite H-4 note                                            |
| same, `getBooking` failed (404, 5xx, `NETWORK_ERROR`, `TIMEOUT`)    | `expired`, count from the seen order or count-free, no "Antre lagi"     |
| `InactiveOutcome` `reason: 'other'` (CANCELLED, SELECTION)          | `inactive`, existing message                                            |
| 401 from any call (incl. `getBooking`, spec 81)                     | `/login?next=/payment?booking=<id>` (unchanged)                         |
| refetch at zero fails (5xx, `NETWORK_ERROR`, `TIMEOUT`)             | `error` view + "Coba lagi" (unchanged); its retry can land on `expired` |
| 404 / no param                                                      | `not-found` (unchanged)                                                 |
| `PAYMENT_PROVIDER_BUSY`, `SNAP_UNAVAILABLE`, `VALIDATION_FAILED`, … | unchanged (spec 77)                                                     |

No new `ERROR_CODE_MAP` entry: expiry is an outcome, not an error code.

## Testing Strategy

`src/controllers/__tests__/payment.controller.test.ts`:

- Harness: add `endOrderWindowUseCase: { execute: vi.fn(() => ({ kind: 'ended' })) }`; `expiredOutcome(overrides)` and
  `otherOutcome()` fixtures; widen today's `{ kind: 'inactive', refund }` fixtures (refund-true fixtures become
  `reason: 'expired'` and move to the expired assertions).
- New `describe('payment expired (FR-23-W1)')`: one `it` per Property 1–8; Property 2 reuses the FR-21 fake-timer flow
  (zero → `pageRefetch` → rerender with the outcome); Property 7 checks call order with `mock.invocationCallOrder`.
- Fixture: `expired: null` in `base()` of `src/presentation/pages/Payment/__tests__/index.test.tsx`.
- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%; `npm run lint`.
