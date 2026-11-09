# Requirements Document

## Introduction

Page logic for `/order?event=<eventId>`, FR-11-W1 (rusuh-web#11, parent FR-11 "Sistem menampilkan detail event
beserta kategori tempat"): read the event id, load the event header (`getEvent`) and the categories
(`getCategories` through `getOrderCategoriesUseCase`), send a buyer without a live admission back to the waiting room
(NFR-07, `AdmissionInvalid`), format everything for ID and EN (ADR-0014), and expose loading, error, not-found and
ready states. Categories show name and description only; seating is by category, no seat numbers (aanwijzing T-11).
Price and availability (FR-12-W1), steppers, limits and summary (FR-13/14-W1), NIK (FR-15-W1), the countdown and
time's-up sheet (FR-17/18-W1) and the login sheet on 401 (NFR-07-W2, ADR-0006) are later tickets. Sources:
`../rusuh-documentation/api/openapi.yaml`, `../rusuh-documentation/analysis/hifi/src/detail.html`,
`../rusuh-documentation/analysis/hifi-api-review.md`, ADR-0004, ADR-0005, ADR-0006, ADR-0014.

## Glossary

| Term          | Definition                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Event view    | The event already formatted for the header: name, subtitle, poster tone, meta line "Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta" |
| Category view | One category for the read-only list: id, name, description                                                                                     |
| Category note | "Maks. 3 tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori." with 3 = `maxTicketsPerOrder`                                        |
| Flow steps    | 1 Pilih tiket · 2 Bayar · 3 E-tiket, step 1 current                                                                                            |

## Requirements

### Requirement 1: Read the event and load the data

**User Story:**

AS a buyer whose turn came
I WANT the order page to load the event and its categories
SO THAT I can see what I am buying before the 5 minutes run out

#### Acceptance Criteria

- SHALL read the event id from the `event` search param through `useSearchParamsNext`
- SHALL load the event with `useQueryTanstack`, key `[QUERY_KEYS.EVENT, eventId]`, calling `catalogService.getEvent`
  directly (simple GET: no use case)
- SHALL load the categories with `useQueryTanstack`, key `[QUERY_KEYS.CATEGORIES, eventId, locale]`, calling
  `getOrderCategoriesUseCase.execute({ eventId, admissionToken: admissionStore.get(eventId) })` with the token read
  inside `queryFn`
- SHALL NOT poll the categories (`refetchInterval` absent): stock is a snapshot at load (Q-20)
- SHALL NOT put the admission token in a query key, storage or analytics
- WHEN `event` is missing or blank THEN SHALL run neither query
- WHEN the language changes THEN SHALL refetch the categories (descriptions come in the request language) and keep the
  previous list on screen until the new one arrives

### Requirement 2: States and errors

**User Story:**

AS a buyer
I WANT a calm message when the page cannot load
SO THAT I know whether to retry or go home

#### Acceptance Criteria

- SHALL expose `status`: `loading`, `error`, `not-found` or `ready`
- WHEN `event` is missing or blank THEN `status` SHALL be `not-found`
- WHEN `getEvent` fails with `NOT_FOUND` (or HTTP 404) THEN `status` SHALL be `not-found`
- WHEN either query fails with any other error THEN `status` SHALL be `error`, `errorMessage` SHALL be
  `t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR)`, and `retry()` SHALL refetch every failed query
- WHEN `getCategories` fails with `UNAUTHORIZED` THEN `status` SHALL be `error` with the translated `UNAUTHORIZED` text
  (interim until the login sheet, NFR-07-W2)
- WHEN the event and an `ok` categories result are both loaded THEN `status` SHALL be `ready`
- SHALL retry a failed query at most once, and only for transport failures and 5xx; never for 4xx
- SHALL NOT show raw API messages

### Requirement 3: Back to the waiting room

**User Story:**

AS a buyer without a live turn (no token, expired or rejected)
I WANT to be sent back to the waiting room for this event
SO THAT I can queue again (`api/tokens.md`: "Any failure → `403 ADMISSION_INVALID`; the client goes back to the waiting room")

#### Acceptance Criteria

- WHEN the categories result is `{ kind: 'admission-invalid' }` and the event loaded THEN SHALL call
  `router.replace(withQuery(ROUTES.QUEUE, { event: eventId }))` once
- WHILE redirecting THEN `status` SHALL stay `loading` (no error flash)
- WHEN the event is not found THEN SHALL NOT redirect (the not-found state wins)
- SHALL NOT hard-code the path (`ROUTES` + `withQuery`)

### Requirement 4: Format for the screen

**User Story:**

AS a buyer
I WANT the event and categories in my language and the venue's time zone
SO THAT I read the date and the rules correctly

#### Acceptance Criteria

- SHALL expose `event` as an event view: `name`, `subtitle`, `posterTone` (same tone as on Home), `imageUrl`, and
  `metaLine` = `formatEventDate(startsAt, locale, timezone)` + `·` + venue and city, e.g. ID
  `Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta`, EN `Sat, 12 Dec 2026 · 7.00 pm WIB · Stadion Utama GBK, Jakarta`
- SHALL use `Asia/Jakarta` when the event has no `timezone`
- SHALL expose `categories` in server order with `id`, `name` and `description` only
- SHALL expose `categoryNote` = `t('order_category_note', { count: maxTicketsPerOrder })`
- SHALL NOT expose price, availability, seating labels or stock counts (FR-12-W1)

### Requirement 5: Flow chrome, language and analytics

**User Story:**

AS a buyer
I WANT to see where I am in the purchase, go back, and switch ID/EN
SO THAT the flow feels short and readable

#### Acceptance Criteria

- SHALL expose `steps`: three translated steps (Pilih tiket, Bayar, E-tiket), the first `current`
- SHALL expose `backHref` = `/queue?event=<eventId>` (Home when there is no event id) and `homeHref` = Home
- SHALL expose `locale` and `setLocale(locale)`; `setLocale` saves the choice in `storage` (`STORAGE_KEYS.LANGUAGE`)
  and changes the i18n language
- SHALL track the `order` page view once on mount
- SHALL be registered as `orderController` with `asFunction(OrderController)` (no `.singleton()`) and typed in
  `AwilixRegistry`
