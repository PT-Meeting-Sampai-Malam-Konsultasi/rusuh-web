# Requirements Document

## Introduction

FR-03-W1, presentation: sold-out and ended cards are dimmed and inert; temporarily full cards and a temporarily full
featured event offer a secondary "Tetap antre" button. Data comes from spec 18.

## Requirements

### Requirement 1: Disabled finished cards

#### Acceptance Criteria

- WHEN the event is finished THEN the poster SHALL be greyed and faded and the title muted (HiFi `is-out`, `is-dim`)
- WHEN sold out THEN a tilted "HABIS" plate SHALL sit on the poster, hidden from screen readers (the stamp already
  says "Habis terjual")
- A finished card SHALL have no link, button or hover effect

### Requirement 2: Queue anyway

#### Acceptance Criteria

- WHEN `join.kind` is `anyway` THEN the card SHALL show a small secondary button "Tetap antre" under the note, not a
  stretched link; its accessible name SHALL include the event title
- WHEN the featured event is temporarily full THEN the hero SHALL show the same secondary button with the hint
- Following it SHALL call `onSelect(eventId, position)` like FR-02
