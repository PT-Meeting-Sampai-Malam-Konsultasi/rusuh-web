# Requirements Document

## Introduction

FR-03-W1: events that cannot be bought now stay on Home, but look and act differently (PRD H-1, FR-03, App Flow
4.1). Sold-out and ended events are disabled. Temporarily full events keep a secondary "Tetap antre" action, as in
the HiFi: the queue is only paused (`Frontier.reason = stock`), unpaid tickets come back within about 10 minutes, and
`joinQueue` accepts joins while paused (customer journey C4: `open / paused` → new number).

Spec numbers 14–17 are left to the order page specs of FR-11-W1 (#42).

## Glossary

| Term         | Definition                                                                          |
| ------------ | ----------------------------------------------------------------------------------- |
| Finished     | `sold_out` or `ended`: shown, disabled, nothing to buy                              |
| Queue anyway | `temporarily_full`: the queue is paused for stock; joining is allowed, not promoted |
| Join kind    | `join` (primary, FR-02) or `anyway` (secondary, this spec)                          |

## Requirements

### Requirement 1: Queue anyway on temporarily full events

**User Story:**

AS a buyer
I WANT to still queue for an event that is only temporarily full
SO THAT I get a place if unpaid tickets come back

#### Acceptance Criteria

- WHEN the state is `temporarily_full` THEN the card view SHALL carry
  `join: { href: /queue?event=<id>, label: "Tetap antre", kind: 'anyway' }`
- WHEN joinable (FR-02) THEN `join.kind` SHALL be `'join'`
- WHEN coming soon, sold out or ended THEN `join` SHALL stay `null`
- The choice SHALL be tracked like FR-02 (`home_event_select` with the state)

### Requirement 2: Sold-out overlay label

#### Acceptance Criteria

- WHEN the state is `sold_out` THEN the card view SHALL carry the overlay word ("HABIS" / "SOLD OUT")
- WHEN any other state THEN the overlay SHALL be `null` (ended has no overlay in the HiFi)
