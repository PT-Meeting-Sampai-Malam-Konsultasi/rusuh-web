# Design Document

## Overview

`PaymentController` (`src/controllers/payment.controller.ts`) is new. It holds:

1. **Three queries and one mutation** — the view (`load`), the snap.js preload (`snap.load`), the status poll
   (`checkStatus`, 4 s while verifying) and "Bayar" (`pay`). One TanStack operation per async operation; nothing calls a
   service in a callback.
2. **Phase state** — `ready → (opening) → verifying → paid | failed | inactive`, `busy` after a retryable failure,
   `ready` again after Snap is closed.
3. **The attempt ref** — `{ key, reusable }` (spec 76's table): reuse the live attempt; same key on a busy retry; a new
   key only after a `failed` step.
4. **Views** — steps, summary, pay action, notice, progress, message; all translated and formatted.
5. **Analytics** — `add_payment_info`, `purchase`, `payment_failed`.

**No use case is skipped**: spec 76 holds the logic; this controller only wires it.

**No loading overlay.** The controller rule asks for `toggleLoading()` in all three mutation paths of a mutation that
uses the overlay. This one does not: the mutation stays pending while the Snap popup is open (`snap.pay` resolves only
when it closes), and a full-page overlay would sit under or race Midtrans' own iframe overlay. The pending state is shown
on the button (`pay.busy`, "Membuka pembayaran…", `aria-busy`), so `useLoading` is not a dependency.

**Navigation uses `replace`.** Going back from the e-ticket must not reopen a paid payment page.

**Back link = home.** `PaymentView` has no `eventId`, so the app bar cannot point to `/order?event=`; and going back to
the order page would only meet `ACCOUNT_HAS_ACTIVE_BOOKING`. The held booking is safe either way.

**Differences from the HiFi (ADRs win):** no method list, no VA / QRIS screens and no "Bayar dengan QRIS" label (H-3,
ADR-0008): one "Bayar", the method is picked on Snap; no timer (FR-21-W1 deferred), so "pay" is the page's one loud
thing; the expired state is a plain "no longer active" message (FR-23-W1 deferred) with the H-4 copy "akan kami
kembalikan" instead of "dikembalikan otomatis"; the legal line has no Terms / Refund links (no such pages exist yet);
"Biaya layanan" is the view's `adminFee` once per order (ADR-0010; the HiFi's "Rp 30.000" is per ticket, H-1).

## Architecture

```
PaymentScreen ─► container.resolve('paymentController')       (src/infrastructure/di/controllers/payment.ts)
  │
  ├─ bookingId = useSearchParamsNext().get('booking')?.trim() ?? ''
  ├─ pageQuery   = useQueryTanstack<PaymentPageResult, HttpError>({ queryKey: [PAYMENT, bookingId], queryFn: load, enabled: id !== '' })
  ├─ snapQuery   = useQueryTanstack<boolean>({ queryKey: [SNAP_SCRIPT], queryFn: load snap.js, enabled: ready view, staleTime: ∞ })
  ├─ [phase, setPhase]   = useState<Phase>({ kind: 'ready' })
  ├─ attemptRef  = useRef<{ key: string | null; reusable: SnapTransaction | null | undefined }>   (undefined: take view.currentSnap)
  ├─ payGuard    = useRef(false) · trackedAttempts = useRef<Set<number>> · purchased = useRef(false) · handledAt = useRef(0)
  ├─ payMutation = useMutationTanstack<PayResult, HttpError, PayInput>({ mutationKey: [PAYMENT_PAY], retry: false, … })
  ├─ statusQuery = useQueryTanstack<PaymentStep, HttpError>({ queryKey: [PAYMENT_STATUS, bookingId, hint],
  │                  enabled: phase.kind === 'verifying', refetchInterval: 4000, refetchOnWindowFocus: true, retry: false })
  ├─ useEffect: statusQuery.data (once per dataUpdatedAt) → phase / navigation / analytics / attempt renewal
  ├─ useEffect: load result paid → replace(e-ticket); unauthorized or 401 (page, poll) → replace(sign-in)
  └─ views
        │ PAID (server only)
        ▼
  router.replace('/tickets/detail?booking=<id>')
```

Route `/payment?booking=<id>` (the shell is behind `<Suspense>`, spec 78). API operations through spec 76:
`getPaymentPage`, `startSnapPayment` (no `method`), `getPaymentStatus`; snap.js through `snap`.

## Components and Interfaces

```ts
// src/controllers/payment.controller.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import type { SnapTransaction } from '@core/entities/payment/payment.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type {
  PayInput,
  PayResult,
  PaymentPageResult,
  PaymentStep,
  SnapHint,
} from '@core/use_case/payment/pay-booking.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { ANALYTICS_CURRENCY, ANALYTICS_EVENTS, priceItems } from '@utils/analytics';
import { MUTATION_KEYS, QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import { formatEventDay, type FormatLocale } from '@utils/format/date';
import { formatRupiah } from '@utils/format/number';
import { randomUuid } from '@utils/random-uuid';

export type PaymentScreenState =
  | 'loading'
  | 'ready'
  | 'opening'
  | 'verifying'
  | 'failed'
  | 'busy'
  | 'inactive'
  | 'not-found'
  | 'error'
  | 'leaving';

/** FlowHeader step; `done` draws "✓" (spec 78 adds it to FlowHeaderStep). */
export interface PaymentFlowStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
  done: boolean;
}

export interface PaymentSummaryLine {
  /** `${index}`: attendees can repeat a category. */
  key: string;
  /** "Festival B". */
  category: string;
  /** "NIK 3174 •••• •••• 0004". */
  nik: string;
  /** "Rp 850.000"; '' when the price is unknown. */
  amount: string;
}

/** The "Pesanan" aside (trust zone: quiet). */
export interface PaymentSummaryView {
  /** "Pesanan" / "Order". */
  heading: string;
  /** "RSH-26-084731". */
  orderCode: string;
  /** "SAMUDRA · Sab, 12 Des 2026 · GBK"; '' when the view has no event fields. */
  eventLine: string;
  lines: PaymentSummaryLine[];
  /** "Biaya layanan" / "Service fee". */
  feeLabel: string;
  /** Once per order (ADR-0010). */
  fee: string;
  totalLabel: string;
  total: string;
  /** "Pembayaran diproses oleh Midtrans. Rusuh tidak menyimpan data kartu Anda." */
  legal: string;
}

/** "Bayar" in the aside and the phone dock. */
export interface PaymentActionView {
  /** Aside button: "Bayar" · "Bayar lagi" · "Coba lagi" · "Buka lagi pembayaran". */
  label: string;
  /** Dock button: "Bayar Rp 2.160.000" (or the label above when it is not a first pay). */
  dockLabel: string;
  /** Dock region name: "Pembayaran" / "Payment". */
  dockRegionLabel: string;
  /** Shown while busy: "Membuka pembayaran…". */
  busyLabel: string;
  /** The mutation is pending (Snap opening or open). */
  busy: boolean;
  enabled: boolean;
  onPay: () => void;
}

export interface PaymentNotice {
  text: string;
  tone: 'error' | 'info';
}

/** Verifying / leaving panel (role="status"). */
export interface PaymentProgressView {
  reason: 'confirming' | 'waiting' | 'paid';
  title: string;
  body: string;
  /** "Tiket Anda tetap ditahan selama pengecekan ini."; '' when paid. */
  held: string;
}

/** Inactive / not-found / load error. */
export interface PaymentMessageView {
  title: string;
  body: string;
  /** H-4 refund note; null unless inactive with refund. */
  note: string | null;
  /** "Coba lagi" on the load error only. */
  actionLabel: string | null;
  onAction: (() => void) | null;
  homeHref: string;
  homeLabel: string;
}

export interface PaymentIntroView {
  /** "Bayar dengan Midtrans". */
  heading: string;
  body: string;
  note: string;
}

export interface PaymentControllerInterface {
  t: TFunction;
  state: PaymentScreenState;
  steps: PaymentFlowStep[];
  /** App bar title: "Pembayaran". */
  title: string;
  /** Main column copy in ready / opening / failed / busy; null otherwise. */
  intro: PaymentIntroView | null;
  summary: PaymentSummaryView | null;
  pay: PaymentActionView | null;
  notice: PaymentNotice | null;
  progress: PaymentProgressView | null;
  message: PaymentMessageView | null;
  homeHref: string;
  backHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
}

type PaymentControllerDeps = Pick<
  AwilixRegistry,
  | 'payBookingUseCase'
  | 'snap'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useMutationTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
  | 'usePopupError'
>;

const PaymentController = (deps: PaymentControllerDeps): PaymentControllerInterface;
export default PaymentController;
```

Module-scope type (not exported):

```ts
type Phase =
  | { kind: 'ready' }
  | { kind: 'verifying'; hint: SnapHint; reason: 'confirming' | 'waiting' }
  | { kind: 'failed' }
  | { kind: 'busy'; code: string }
  | { kind: 'inactive'; refund: boolean }
  | { kind: 'not-found' }
  | { kind: 'paid' };
```

Behaviour:

- `view = pageQuery.data?.kind === 'ready' ? pageQuery.data : null`.
- `onPay` (`useCallback`): return if `!view || payGuard.current || payMutation.isPending`; `payGuard.current = true`;
  `attemptRef.current.key ??= randomUuid()`; `reusable = attemptRef.current.reusable === undefined ? (view.view.currentSnap
?? null) : attemptRef.current.reusable`; `payMutation.mutate({ bookingId, idempotencyKey: key, reusable })`.
- `onSuccess(result)` (`payGuard.current = false` first):

| Result           | Effect                                                                                     | Analytics                               |
| ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| `snap` `success` | `reusable = result.snap`; `setPhase({ verifying, hint: 'success', reason: 'confirming' })` | `add_payment_info` once per `attemptId` |
| `snap` `pending` | `reusable = result.snap`; `setPhase({ verifying, hint: 'pending', reason: 'waiting' })`    | same                                    |
| `snap` `error`   | `reusable = result.snap`; `setPhase({ verifying, hint: 'error', reason: 'confirming' })`   | same                                    |
| `snap` `closed`  | `reusable = result.snap`; `setPhase({ ready })`                                            | same                                    |
| `paid`           | `setPhase({ paid })`; `router.replace(eTicketHref)`                                        | `purchase` (once)                       |
| `inactive`       | `setPhase({ inactive, refund })`                                                           | —                                       |
| `retryable`      | `reusable = result.snap` (null keeps "start again", same key); `setPhase({ busy, code })`  | —                                       |
| `not-found`      | `setPhase({ not-found })`                                                                  | —                                       |
| `unauthorized`   | `router.replace(signInHref)`                                                               | —                                       |

- `onError(error)`: `payGuard.current = false`; 401 / `UNAUTHORIZED` → `router.replace(signInHref)`; else
  `openPopupError({ message: t(ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR), reference: error.requestId })`.
- Status effect (`statusQuery.data` with `dataUpdatedAt !== handledAt.current`, and phase still `verifying`):
  `paid` → `setPhase({ paid })`, `purchase` once, `router.replace(eTicketHref)`; `verifying` → `setPhase({ …phase, reason
})` when it changed; `failed` → `attemptRef.current = { key: null, reusable: null }`, `setPhase({ failed })`,
  `payment_failed { booking_id, reason: step.paymentStatus }`; `inactive` → `setPhase({ inactive, refund })`.
- Redirect effect: `pageQuery.data?.kind === 'paid'` → `replace(eTicketHref)`; `pageQuery.data?.kind === 'unauthorized'`
  or `pageQuery.error?.status === 401` or `statusQuery.error?.status === 401` → `replace(signInHref)` (once; a ref).
- `signInHref = withQuery(ROUTES.LOGIN, { next: withQuery(ROUTES.PAYMENT, { booking: bookingId }) })`;
  `eTicketHref = withQuery(ROUTES.TICKET_DETAIL, { booking: bookingId })`.
- `setLocale(next)`: `storage.set(STORAGE_KEYS.LANGUAGE, next)`; `void i18n.changeLanguage(next)` (as the order
  controller).
- `state` (first match): `bookingId === ''` → `not-found`; `pageQuery.isPending` → `loading`; `pageQuery.isError` (not 401) → `error`; load `not-found` / phase `not-found` → `not-found`; load `inactive` / phase `inactive` → `inactive`;
  load `paid` / phase `paid` → `leaving`; `payMutation.isPending` → `opening`; else the phase kind.

Views (pure wiring of use-case data; formatting by utils):

```ts
const steps: PaymentFlowStep[] = [
  { number: 1, label: t('order_step_choose'), current: false, done: true },
  { number: 2, label: t('order_step_pay'), current: true, done: false },
  { number: 3, label: t('order_step_ticket'), current: false, done: false },
];
// summary (when view && state ∈ ready | opening | verifying | failed | busy | leaving):
//   heading t('payment_summary_heading'); orderCode view.orderCode;
//   eventLine [eventName?.toLocaleUpperCase(locale-tag), eventStartsAt && formatEventDay(eventStartsAt, locale, timezone), venueShort]
//             .filter(Boolean).join(' · ')
//   lines tickets.map((x, i) => ({ key: String(i), category: x.categoryName, nik: t('payment_summary_nik', { nik: x.nikMasked }),
//             amount: x.unitPrice === null ? '' : formatRupiah(x.unitPrice, locale) }))
//   feeLabel t('order_summary_fee'); fee formatRupiah(price.adminFee.amount); totalLabel t('order_summary_total'); total …
//   legal t('payment_legal')
// pay (state ∈ ready | opening | failed | busy, or verifying with reason 'waiting'):
//   label: failed → t('payment_pay_again') · busy → t('action_retry') · waiting → t('payment_pay_reopen') · else t('payment_pay_label')
//   dockLabel: ready / opening → t('payment_pay_amount', { amount: total }) · else label
//   busy: payMutation.isPending · enabled: !busy · busyLabel t('payment_pay_busy') · dockRegionLabel t('payment_dock_label')
// notice: failed → { text: t('payment_failed'), tone: 'error' } · busy → { text: t(ERROR_CODE_MAP[code] ?? …UNKNOWN_ERROR), tone: 'error' }
// progress: verifying confirming → t('payment_verifying_title' / '_body'), held t('payment_verifying_held')
//           verifying waiting → t('payment_waiting_title' / '_body'), held same · leaving → t('payment_paid_title' / '_body'), held ''
// intro (ready | opening | failed | busy): t('payment_heading'), t('payment_intro'), t('payment_intro_note')
// message: inactive → t('payment_inactive_title'), t('payment_inactive_body'), note refund ? t('payment_inactive_refund') : null
//          not-found → t('payment_not_found_title'), t('payment_not_found_body')
//          error → t('payment_error_title'), t(ERROR_CODE_MAP[code] ?? …), actionLabel t('action_retry'), onAction refetch
//          all: homeHref ROUTES.HOME, homeLabel t('action_back_home')
```

Utilities (pure, tested in `src/utils/**/__tests__`):

```ts
// src/utils/format/date.ts (addition)
/** `Sab, 12 Des 2026` (ID) / `Sat, 12 Dec 2026` (EN), in the venue's zone. */
export function formatEventDay(iso: string, locale: FormatLocale, timeZone = DEFAULT_TIME_ZONE): string;
// = the day part of formatEventDate, without " · 19.00 WIB"; formatEventDate reuses it

// src/utils/analytics.ts (addition)
import type { PriceBreakdown } from '@core/entities/booking/booking.entity';
/** One GA4 item per price line: item_id categoryId, item_name name, price unitPrice, quantity (plan §5). */
export function priceItems(price: PriceBreakdown): AnalyticsItem[];

// src/utils/constants/query-keys.ts (additions)
  PAYMENT: 'payment', PAYMENT_STATUS: 'payment-status', SNAP_SCRIPT: 'snap-script',   // QUERY_KEYS
  PAYMENT_PAY: 'payment-pay',                                                        // MUTATION_KEYS
```

DI:

```ts
// src/infrastructure/di/controllers/payment.ts — FIRST register call (registry.test maps a file to it)
import PaymentController from '@controllers/payment.controller';
container.register({ paymentController: asFunction(PaymentController) });
// …then spec 75's `snap` registration, unchanged

// src/infrastructure/di/registry.types.ts ("controllers")
import type { PaymentControllerInterface } from '@controllers/payment.controller';
paymentController: PaymentControllerInterface;
```

Compile check against `AwilixRegistry`: `payBookingUseCase` (spec 76), `snap` (spec 75), `analyticsAdapter`, `storage`,
`ERROR_CODE_MAP`, `useTranslation`, `useQueryTanstack`, `useMutationTanstack`, `useRouterNext`, `useSearchParamsNext`,
`usePopupError` are all keys with registrations. `useQueryTanstack<boolean>` for the preload because TanStack rejects
`undefined` data. `PayInput.reusable: SnapTransaction | null`, so the ref's `undefined` ("not decided yet") is resolved
before `mutate`. `PaymentFlowStep` is structurally a `FlowHeaderStep` once spec 78 adds `done?: boolean`.

## Data Models

Translation keys used by this controller; **written by spec 78 task 1** (same PR, as specs 73/74). Reused existing keys:
`order_step_choose`, `order_step_pay`, `order_step_ticket`, `order_steps_label`, `order_summary_fee`,
`order_summary_total`, `action_retry`, `action_back_home`, `state_loading`, `logo_home_label`, `language_switch_label`,
every `error_*` (plus `error_snap_unavailable` from spec 75).

| Key                       | ID                                                                                                                               | EN                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `payment_title`           | Pembayaran                                                                                                                       | Payment                                                                                                                          |
| `payment_back_label`      | Kembali ke beranda                                                                                                               | Back to home                                                                                                                     |
| `payment_step_done`       | selesai                                                                                                                          | done                                                                                                                             |
| `payment_heading`         | Bayar dengan Midtrans                                                                                                            | Pay with Midtrans                                                                                                                |
| `payment_intro`           | Tekan Bayar, lalu pilih cara bayar di halaman Midtrans yang terbuka di atas halaman ini.                                         | Tap Pay, then choose how to pay on the Midtrans page that opens over this one.                                                   |
| `payment_intro_note`      | Biarkan halaman ini terbuka sampai pembayaran selesai.                                                                           | Keep this page open until the payment is done.                                                                                   |
| `payment_summary_heading` | Pesanan                                                                                                                          | Order                                                                                                                            |
| `payment_summary_nik`     | NIK {{nik}}                                                                                                                      | NIK {{nik}}                                                                                                                      |
| `payment_legal`           | Pembayaran diproses oleh Midtrans. Rusuh tidak menyimpan data kartu Anda.                                                        | Payments are processed by Midtrans. Rusuh never stores your card details.                                                        |
| `payment_pay_label`       | Bayar                                                                                                                            | Pay                                                                                                                              |
| `payment_pay_amount`      | Bayar {{amount}}                                                                                                                 | Pay {{amount}}                                                                                                                   |
| `payment_pay_again`       | Bayar lagi                                                                                                                       | Pay again                                                                                                                        |
| `payment_pay_reopen`      | Buka lagi pembayaran                                                                                                             | Open the payment again                                                                                                           |
| `payment_pay_busy`        | Membuka pembayaran…                                                                                                              | Opening the payment…                                                                                                             |
| `payment_dock_label`      | Pembayaran                                                                                                                       | Payment                                                                                                                          |
| `payment_failed`          | Pembayaran belum berhasil. Tiket Anda masih ditahan, jadi Anda bisa bayar lagi, juga dengan metode lain.                         | The payment didn't go through. Your tickets are still held, so you can pay again, with another method too.                       |
| `payment_verifying_title` | Memastikan pembayaran Anda…                                                                                                      | Confirming your payment…                                                                                                         |
| `payment_verifying_body`  | Kami menunggu konfirmasi Midtrans, biasanya beberapa detik. Jangan bayar ulang.                                                  | We're waiting for Midtrans to confirm, usually a few seconds. Please don't pay again.                                            |
| `payment_waiting_title`   | Menunggu pembayaran Anda                                                                                                         | Waiting for your payment                                                                                                         |
| `payment_waiting_body`    | Selesaikan pembayaran sesuai petunjuk Midtrans. Halaman ini berganti sendiri setelah dana masuk.                                 | Finish the payment as Midtrans showed you. This page updates by itself once it arrives.                                          |
| `payment_verifying_held`  | Tiket Anda tetap ditahan selama pengecekan ini.                                                                                  | Your tickets stay held while we check.                                                                                           |
| `payment_paid_title`      | Pembayaran diterima.                                                                                                             | Payment received.                                                                                                                |
| `payment_paid_body`       | Membuka e-tiket Anda…                                                                                                            | Opening your e-tickets…                                                                                                          |
| `payment_inactive_title`  | Pesanan ini sudah tidak aktif.                                                                                                   | This order is no longer active.                                                                                                  |
| `payment_inactive_body`   | Waktu pembayaran sudah habis atau pesanan dibatalkan, jadi tiketnya kami lepas untuk pembeli lain.                               | The time to pay ran out or the order was cancelled, so we've released the tickets to other buyers.                               |
| `payment_inactive_refund` | Saldo terpotong? Pembayaran Anda masuk setelah waktu habis. Dana akan kami kembalikan; rinciannya kami kirim ke email akun Anda. | Money already taken? Your payment arrived after the time ran out. We'll refund it and email the details to your account address. |
| `payment_not_found_title` | Pesanan tidak ditemukan.                                                                                                         | Order not found.                                                                                                                 |
| `payment_not_found_body`  | Tautan pembayaran ini salah, atau pesanannya milik akun lain.                                                                    | This payment link is wrong, or the order belongs to another account.                                                             |
| `payment_error_title`     | Halaman pembayaran gagal dimuat.                                                                                                 | The payment page didn't load.                                                                                                    |

Analytics events (tracking plan names in `ANALYTICS_EVENTS`; `snake_case` params like `view_ticket` / `begin_checkout`):

| Event              | Params                                                                             | When                                 |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------ |
| page view          | `trackPageView('payment')`                                                         | mount                                |
| `add_payment_info` | `booking_id`, `currency: 'IDR'`, `value`, `payment_type: 'midtrans_snap'`, `items` | first `snap` result per `attemptId`  |
| `purchase`         | `transaction_id` (= booking id), `booking_id`, `currency`, `value`, `items`        | first `paid` seen with a loaded view |
| `payment_failed`   | `booking_id`, `reason` (`denied`, `failed`, `cancelled`, `expired`, `none`)        | each `failed` step                   |

`purchase` is not sent when the page is opened already paid (load → `paid`, no view to price it); GA4 dedupes by
`transaction_id` if a later screen sends it. Recorded as an open question.

State examples (view: Festival B × 2 at 850 000, Tribun Atas 450 000, fee 10 000, Samudra 12 Dec 2026 19.00 WIB, GBK):

| State                  | `intro` | `summary` | `pay.label` / `dockLabel`            | `notice`                   | `progress` | `message`         |
| ---------------------- | ------- | --------- | ------------------------------------ | -------------------------- | ---------- | ----------------- |
| `loading`              | null    | null      | null                                 | null                       | null       | null              |
| `ready`                | ✓       | ✓         | "Bayar" / "Bayar Rp 2.160.000"       | null                       | null       | null              |
| `opening`              | ✓       | ✓         | same, `busy: true`, `enabled: false` | null                       | null       | null              |
| `verifying` confirming | null    | ✓         | null                                 | null                       | confirming | null              |
| `verifying` waiting    | null    | ✓         | "Buka lagi pembayaran" (both)        | null                       | waiting    | null              |
| `failed`               | ✓       | ✓         | "Bayar lagi" (both)                  | failed copy                | null       | null              |
| `busy`                 | ✓       | ✓         | "Coba lagi" (both)                   | "Pembayaran sedang padat…" | null       | null              |
| `leaving`              | null    | ✓         | null                                 | null                       | paid       | null              |
| `inactive`             | null    | null      | null                                 | null                       | null       | inactive (+ note) |
| `not-found`            | null    | null      | null                                 | null                       | null       | not-found         |
| `error`                | null    | null      | null                                 | null                       | null       | error + retry     |

Summary in ID: "Pesanan RSH-26-900001", "SAMUDRA · Sab, 12 Des 2026 · GBK", lines "Festival B / NIK 3174 •••• •••• 0004 /
Rp 850.000" ×2 and "Tribun Atas / … / Rp 450.000", "Biaya layanan Rp 10.000", "Total Rp 2.160.000"; EN "Sat, 12 Dec
2026", "Rp 2,160,000".

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Reading search params (`useSearchParamsNext`) — the route file must wrap the screen in `<Suspense>`
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Timers derived from server time, polling intervals (`refetchInterval`), SSE subscriptions through a DI adapter
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
- ✅ import type { ... } from '@core/...';
- ✅ import type { AwilixRegistry } from '@infrastructure/di/registry.types';
- ✅ import type { TFunction } from 'i18next';
- ❌ import { useTranslation } from 'react-i18next'; // DI: useTranslation
- ❌ import { useQuery, useMutation } from '@tanstack/react-query'; // DI: useQueryTanstack, useMutationTanstack
- ❌ import { useRouter, useSearchParams } from 'next/navigation'; // DI: useRouterNext, useSearchParamsNext
- ❌ import { useLoading } from '@contexts/loading.context'; // DI: useLoading
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- `toggleLoading()` in **all three** mutation paths: `mutationFn`, `onSuccess`, `onError`. A missing one leaves the
  overlay stuck.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- `trackPageView` inside `useEffect(..., [])`, not in the render body.
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- File name `{page-name}.controller.ts`, never `use-…`.
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

Notes: the overlay is not used by this mutation (see Overview), so the `toggleLoading()` item does not apply; the effects
only react to query data (navigation, phase, analytics), they never call a service; `snap.load` runs inside a
`useQueryTanstack`, so it is TanStack-managed async work through a DI protocol; `NETWORK_ERROR` from a pay attempt comes
back as `retryable` and shows `error_network_error` in the busy notice (the offline banner shows as well).

From `.claude/rules/error-handling.md`:

- `401` always goes to sign-in; never an "unauthorized" page.
- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.
- No automatic replay of failed mutations; the user retries.
- ❌ Auto-retrying mutations without the user

From `.claude/rules/presentation.md` (route table):

- `/payment` | Payment (Snap) | `booking`
- `/tickets/detail` | E-ticket | `booking`
- Keep the paths in `src/utils/constants/routes.ts`; never hard-code them in controllers.

From `CLAUDE.md`:

- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.
- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.
- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: no `booking` param → `state: 'not-found'`, the load query disabled, every view but `message` null.
  **Validates: Requirements 1**
- Property 2: each `load` result gives the state of the table (`ready`, `inactive` with / without the refund note,
  `not-found`, `leaving` + `replace('/tickets/detail?booking=bk1')`, `unauthorized` →
  `replace('/login?next=%2Fpayment%3Fbooking%3Dbk1')`); a rejected load gives `error` with the mapped message and a
  `retry` that refetches. **Validates: Requirements 1**
- Property 3: the first tap with `currentSnap: S1` calls `mutate({ bookingId, idempotencyKey: 'uuid-1', reusable: S1 })`;
  after `closed`, the next tap sends the same key and `reusable: S1`; after `retryable` `snap: null`, the same key and
  `reusable: null`; after a `failed` step, `idempotencyKey: 'uuid-2'` and `reusable: null`; two taps in one act call
  `mutate` once. **Validates: Requirements 2**
- Property 4: every row of the `onSuccess` table sets its phase / navigation / analytics and nothing else; `onError`
  opens the popup with `ERROR_CODE_MAP[code]` and `reference`, or goes to sign-in on 401. **Validates: Requirements 2**
- Property 5: the status query is enabled only in `verifying`, with `refetchInterval: 4000` and the hint in its key; each
  step is handled once; `paid` → `replace(e-ticket)`; `failed` → phase `failed` + new attempt; a poll 401 → sign-in.
  **Validates: Requirements 3**
- Property 6: no `snap` result (`success`, `pending`, `error`, `closed`) ever calls `router.replace(e-ticket)` or tracks
  `purchase`. **Validates: Requirements 3**
- Property 7: the views of every state row match the state table (non-null set, labels, `busy`, `enabled`); with the
  example view the ID and EN summaries read exactly as in Data Models; `fee` is the same for 1–3 tickets; no countdown
  field exists on the interface. **Validates: Requirements 4**
- Property 8: `add_payment_info` once per `attemptId`, `purchase` once, `payment_failed` per failure, each with exactly
  the table's params; no param value contains a name, a NIK, a snap token or an e-mail. **Validates: Requirements 5**
- Property 9: the snap preload query is enabled only with a ready view and returns `true`; its failure changes no view.
  **Validates: Requirements 2**
- Property 10: `di/controllers/payment.ts`'s first `register` call is `paymentController`; key count = registration
  count; `formatEventDay` and `priceItems` pass their unit tests. **Validates: Requirements 4, 5, 6**

## Error Handling

| Source / outcome                                                          | User sees                                                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| no `booking` param, load / pay `not-found` (404)                          | "Pesanan tidak ditemukan." + home                                                                    |
| load / start 409 `BOOKING_NOT_HELD` → `paid`                              | "Pembayaran diterima. Membuka e-tiket Anda…" → `/tickets/detail?booking=`                            |
| load / start 409 → `inactive`; poll EXPIRED / CANCELLED                   | "Pesanan ini sudah tidak aktif." + home (FR-23-W1 builds the full screen)                            |
| `paid_after_expiry`                                                       | the same + "Saldo terpotong? … Dana akan kami kembalikan …" (H-4)                                    |
| 401 anywhere (load, pay, poll)                                            | `/login?next=/payment?booking=<id>`                                                                  |
| start 503 `PAYMENT_PROVIDER_BUSY`, 5xx, `TIMEOUT`                         | busy notice with the mapped copy ("Pembayaran sedang padat. Coba lagi sebentar lagi.") + "Coba lagi" |
| `NETWORK_ERROR`                                                           | busy notice "Koneksi terputus…" + "Coba lagi" (+ the offline banner)                                 |
| `SNAP_UNAVAILABLE`                                                        | busy notice "Halaman pembayaran Midtrans tidak bisa dibuka…" + "Coba lagi" (same token)              |
| poll `failed` (denied / failed / cancelled / expired / Snap error + none) | failed notice + "Bayar lagi" (new attempt)                                                           |
| load 5xx / transport                                                      | "Halaman pembayaran gagal dimuat." + mapped message + "Coba lagi" + home                             |
| pay rethrown (422 `VALIDATION_FAILED`, `UNKNOWN_ERROR`)                   | popup with the mapped message and "Kode bantuan"                                                     |
| poll transient errors                                                     | nothing; the next interval tries again                                                               |

No new error code here (spec 75 adds `SNAP_UNAVAILABLE`).

**Open questions / doc notes:**

- `purchase` on an already-paid reload is not sent (no view to price it); confirm with the tracking-plan owner.
- `PaymentView.snapClientKey` vs `config.midtransClientKey`: snap.js uses the config key (spec 75); a mismatch between the
  two environments would make Snap reject the token. Confirm they are the same key per environment.
- Spec 73's note that the payment page calls `enterPayment` again is superseded: `getPaymentPage` returns
  `currentSnap` (spec 75).

## Testing Strategy

`src/controllers/__tests__/payment.controller.test.ts` (`renderHook`, every DI dep a plain fake):

- `useQueryTanstack` fake that returns per `queryKey[0]` (`payment`, `snap-script`, `payment-status`) a controllable
  `{ data, isPending, isError, error, dataUpdatedAt, refetch }` and records the options; `useMutationTanstack` captures
  options and returns `{ mutate, isPending }`; `@utils/random-uuid` mocked with a counter; `t` as `(k, o) => k +
JSON.stringify(o ?? '')` plus real-i18n checks for the formatted examples; `useSearchParamsNext` returns a
  `URLSearchParams`.
- One `it` per Property 1–9; `it.each` over the `onSuccess` table, the state table and the step list.
- `src/utils/format/__tests__/date.test.ts`: `formatEventDay` ID / EN, zone. `src/utils/__tests__/analytics.test.ts`:
  `priceItems`.
- `registry.test.ts`: `paymentController` in `KEYS` (the "every page shell imports its registration" check runs once
  spec 78's shell exists).
- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%; `npm run lint` (react-hooks: refs written only
  in handlers / effects, no `Date.now()` in render).
