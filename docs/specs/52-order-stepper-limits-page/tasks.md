# Implementation Plan: Order stepper limits (page)

## Overview

Render the HiFi limit line ("3/3 Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori.", or the reservation
variant) under the category list inside an always-mounted `role="status"` region, style it per HiFi `.limit` with
Poster Sablon tokens, pass `limitNotice` from the shell, and pin the sold-out / stale-pick stepper states with tests in
ID and EN. Writer: presentation-writer. Depends on spec 51 (`limitNotice`, translation keys) and spec 50 (caps).

## Tasks

- [x] 1. `CategoryList/index.tsx`: add the `limitNotice: OrderLimitNotice | null` prop; after the `ul`, render `<div role="status" aria-atomic="true">` with the `p.limit` (`<b className={styles.limitCount}>{count}</b> <span>{message}</span>`) only when `limitNotice` is non-null; leave the stepper's native `disabled` as is [Requirement 1, Requirement 2, Requirement 4]
- [x] 2. `CategoryList/category-list.module.css`: add `.limit` and `.limitCount` per the design table (tokens only, no hex, no motion) [Requirement 3]
- [x] 3. Shell `src/presentation/pages/Order/index.tsx`: destructure `limitNotice` and pass it to `CategoryList` [Requirement 1]
- [x] 4. Tests: update `CategoryList/__tests__/index.test.tsx` (region, line shown/hidden, same node across rerenders, sold-out and stale-pick buttons, ID and EN strings) and `src/presentation/pages/Order/__tests__/index.test.tsx` (notice reaches the list) [Requirement 1, Requirement 2, Requirement 4, Requirement 5]
- [x] 5. Run the gate check and compare with HiFi `detail.html` at 390 and 1440, ID and EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build && npm run check:bundle`;
  `out/order.html` keeps scoped class names.
- Translation keys are added in spec 51 (the controller translates the notice); this spec adds none and tests with the
  real strings from the locale files.
- Visual source is the HiFi only (Figma not accessible). The reservation copy is proposed (spec 51); confirm with the
  designer.
- Out of scope: per-NIK seats across bookings / one active booking per account (server: `NIK_SEAT_TAKEN`,
  `ACCOUNT_HAS_ACTIVE_BOOKING`), hold errors `QUANTITY_OVER_RESERVATION` / `CATEGORY_SOLD_OUT`, live stock refresh
  (Q-20), summary aside "Ringkasan" and phone dock.
- Commit: `feat(order): [FR-14-W1] show the ticket limit line`.
