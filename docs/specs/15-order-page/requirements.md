# Requirements Document

## Introduction

The Detail Ticket screen for FR-11-W1 (rusuh-web#11, parent FR-11 "Sistem menampilkan detail event beserta kategori
tempat"), ported from the left column of `../rusuh-documentation/analysis/hifi/src/detail.html` (shots
`analysis/hifi/shots/detail/default-1440x900.png`, `default-390x844.png`): flow header with step indicator and ID/EN
switch, phone app bar with back link, event header, and section "1 Kategori" with the quantity note and a read-only
list of category names and descriptions. Seating by capacity only, no seat map (aanwijzing T-11). States: loading,
error, not-found, ready (the redirect on `ADMISSION_INVALID` is the controller's). Price, availability, steppers,
NIK, summary, dock and timer are later tickets (FR-12/13/14/15/17-W1).

## Glossary

| Term        | Definition                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow header | Chrome of the purchase flow (order, payment, e-ticket): logo, steps, language switch, timer slot; on phones an app bar with back link and title |
| Timer slot  | Empty place in the flow header and app bar where the order countdown (FR-17-W1) will render                                                     |
| Flow grid   | HiFi `.flow-grid`: main column + 400 px summary column (340 px below 1180); the summary aside is not built in this ticket                       |

## Requirements

### Requirement 1: Route and error boundary

**User Story:**

AS a buyer opening `/order?event=evt_samudra`
I WANT a page that loads on the static site and never shows a white screen
SO THAT I can pick tickets even when something fails

#### Acceptance Criteria

- SHALL add `src/app/order/page.tsx` as a server component exporting `metadata` with title `Pilih tiket` (the layout
  template makes it "Pilih tiket · Rusuh") and rendering `<Suspense fallback={<OrderSkeleton withHeader />}><OrderScreen /></Suspense>`
- SHALL add `src/app/order/error.tsx` (`'use client'`, `{ error, retry }`): log through the analytics adapter with
  `boundary: 'order'`, then show the error page title and body with "Coba lagi" (`retry()`) and "Ke beranda"
- SHALL NOT fetch data, use hooks or hold logic in the route file
- SHALL build with `output: "export"` (no dynamic segment; the id is a search param)

### Requirement 2: Flow header

**User Story:**

AS a buyer
I WANT to see that I am on step 1 of 3, switch language, and go back on my phone
SO THAT the purchase feels short and I am never stuck

#### Acceptance Criteria

- WHEN the viewport is ≥ 720 px THEN SHALL show a header with the RUSUH! logo (link to Home), the steps
  "1 Pilih tiket · 2 Bayar · 3 E-tiket" as an `ol` with step 1 `aria-current="step"`, the ID/EN switch and an empty
  timer slot
- WHEN the viewport is < 1180 px THEN SHALL hide the steps (HiFi `flow.css`)
- WHEN the viewport is < 720 px THEN SHALL show the app bar instead: a "←" back link to `backHref` with
  `aria-label` "Kembali", the title "Pilih tiket" and an empty timer slot
- SHALL render the timer slot only when a `timer` node is passed (none in this ticket)
- SHALL be a shared component in `src/presentation/components/FlowHeader/` so payment and e-ticket reuse it

### Requirement 3: Event header

**User Story:**

AS a buyer
I WANT the event name, date, time and venue at the top
SO THAT I am sure I am buying for the right show

#### Acceptance Criteria

- SHALL show a small poster (shared `Poster`, new size `thumb`: 58×72 phone, 84×104 from 720 px, ink offset), the
  event name as the page `h1` with the subtitle beside it (below it on phones), and the meta line
  "Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta" (EN "Sat, 12 Dec 2026 · 7.00 pm WIB · …")
- WHEN the event has `imageUrl` THEN the poster SHALL show it with `alt=""`, explicit size and eager loading (above the
  fold); otherwise the generated poster with the event name

### Requirement 4: Category section

**User Story:**

AS a buyer
I WANT to see which categories exist and what each means
SO THAT I know where I will stand or sit (no seat numbers)

#### Acceptance Criteria

- SHALL show a `section` labelled by `h2` "Kategori" with the number badge "1"
- SHALL show the controller's note ("Maks. 3 tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori.") beside
  the heading from 720 px, below it on phones
- SHALL list every category in server order as a `ul`; each item shows the name as `h3` and the description below it
- WHEN a category has no description THEN SHALL show the name only, with no empty paragraph
- SHALL NOT show price, availability labels, steppers, sold-out styling or a selected state (FR-12/13-W1)

### Requirement 5: States

**User Story:**

AS a buyer on a slow or failing connection
I WANT clear feedback for every state
SO THAT I know what is happening and what to do

#### Acceptance Criteria

- WHEN `status` is `loading` THEN SHALL show `OrderSkeleton` with the same layout (poster, two text lines, section
  heading, four rows), `aria-busy` on `main` and a visually hidden "Memuat…"
- WHEN `status` is `error` THEN SHALL show `OrderMessage`: "Kategori gagal dimuat.", the controller's `errorMessage`,
  a "Coba lagi" button calling `retry`, and a "Ke beranda" link
- WHEN `status` is `not-found` THEN SHALL show `OrderMessage`: "Event tidak ditemukan.", a short explanation and a
  "Ke beranda" link, no retry
- WHEN `status` is `ready` THEN SHALL show the event header and the category section
- SHALL keep the flow header in every state
- SHALL show every string in ID and EN from the locale files

### Requirement 6: Layout, accessibility and motion

**User Story:**

AS a buyer on a phone or a desktop, with or without assistive tech
I WANT the page to match the HiFi and be usable by keyboard and screen reader
SO THAT it reads well at 390 px and at 1440 px

#### Acceptance Criteria

- SHALL be mobile first: one column with 16 px gutters below 720 px; from 720 px the flow grid with 56 px gutters,
  main column + 340 px column (40 px gap); from 1180 px main column + 400 px column (72 px gap); max width 1328 px; the
  second column stays empty in this ticket
- SHALL use `header`, `main`, `section`, `h1`–`h3`, `ol` for steps and `ul` for categories
- SHALL give every link a visible focus style and a ≥ 44 px target, with `:hover` and `:focus-visible` states
- SHALL animate the first entry (rise, 60 ms stagger: event header, then categories) only without
  `prefers-reduced-motion`
- SHALL NOT shift the layout when the screen replaces the route fallback (CLS ≤ 0.1)
