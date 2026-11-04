# Requirements Document

## Introduction

Home page logic for FR-01-W1: load the events, format them for the current language, expose loading, empty and error
states, and switch ID/EN (ADR-0014). Clicking events (FR-02/04/05), disabled styling (FR-03) and the in-queue strip
(H-3) are later tickets.

## Glossary

| Term      | Definition                                                                             |
| --------- | -------------------------------------------------------------------------------------- |
| Card view | An event already formatted for the screen: stamp, date line, venue line, price or note |

## Requirements

### Requirement 1: Load the list

**User Story:**

AS a buyer
I WANT the list to load and stay fresh
SO THAT the stamps are right during a sale

#### Acceptance Criteria

- SHALL load through `useQueryTanstack` with key `[QUERY_KEYS.EVENTS]`, `staleTime` 5 s, `refetchInterval` 30 s
- SHALL expose `status`: `loading`, `error`, `empty` or `ready`
- WHEN the query fails THEN SHALL expose the translated error (`ERROR_CODE_MAP`, offline text for `NETWORK_ERROR`) and `retry()`
- SHALL track the `home` page view once

### Requirement 2: Format every event

**User Story:**

AS a buyer
I WANT dates, prices and stamps in my language and the venue's time zone
SO THAT I read them correctly

#### Acceptance Criteria

- SHALL format dates as `Sab, 12 Des 2026 · 19.00 WIB` (EN `Sat, 12 Dec 2026 · 7.00 pm WIB`) in the event time zone
- SHALL format money as `Rp 450.000` (EN `Rp 450,000`)
- SHALL map each `EventState` to a stamp tone and label
- WHEN `coming_soon` THEN note = opening time and time left from `serverNow`
- WHEN `temporarily_full` THEN note = tickets being paid, unpaid return within 10 minutes
- WHEN `sold_out` THEN price line = "Semua n tiket terjual dalam …" when `capacity` and `soldOutAt` are known
- WHEN `ended` THEN price line = "Penjualan online ditutup …" when `saleEndsAt` is known

### Requirement 3: Language switch

#### Acceptance Criteria

- SHALL expose `locale` and `setLocale(locale)`; `setLocale` changes i18n and saves the choice in storage
