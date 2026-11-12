# Design Document

- `AnalyticsParams` allows GA4 `items[]` (`AnalyticsItem`); `createAnalyticsAdapter(sink, { getLanguage })` adds
  `language` to every event (the registry passes the UI language).
- `src/utils/analytics.ts`: `ANALYTICS_EVENTS`, `ANALYTICS_CURRENCY`, `positionBucket`, `waitBucket`, `eventItem`,
  `categoryItem`, `signInFrom`.
- Controllers send the events at the moments in Requirement 2, each guarded by a ref so a re-render never repeats one.
  Replaced: `home_event_select` → `select_item`, `queue_skip` → `queue_join` (`no_queue`), `login_verified` →
  `login` / `sign_up`, `order_nik_checked` → `nik_rejected`, `ticket_pdf_printed` → `ticket_download`,
  `ticket_calendar_added` → `ticket_add_calendar`.

## Layer Constraints

- Controllers call `analyticsAdapter` from DI only; helpers are pure (`src/utils`); no personal data in any parameter.
