# Requirements Document

## Introduction

The Home screen for FR-01-W1, ported from `design/hifi/home.html`: header with ID/EN switch, featured poster, the
"Semua event" list, footer, phone app bar and tab bar; loading, empty and error states.

## Requirements

### Requirement 1: Layout

#### Acceptance Criteria

- SHALL show the featured event as a poster hero with stamp, title, subtitle and facts (date, venue, price)
- SHALL show every other event as a card: poster, stamp, title, date, venue, price or note
- SHALL show 4 columns ≥ 1180 px, 2 columns ≥ 720 px, a row list on phones (poster 104 px left)
- SHALL show the desktop header ≥ 720 px and the app bar + tab bar below 720 px

### Requirement 2: States

#### Acceptance Criteria

- WHEN loading THEN SHALL show a skeleton with the same layout, `aria-busy`
- WHEN empty THEN SHALL say there are no events yet
- WHEN error THEN SHALL show the message and a "Coba lagi" button that calls `retry`

### Requirement 3: Accessibility and motion

#### Acceptance Criteria

- SHALL use `main`, `section` + headings, `ol` for the list, `dl` for facts
- SHALL never show status by colour alone (stamp word)
- SHALL animate the first entry (rise, 60 ms stagger) only without `prefers-reduced-motion`
