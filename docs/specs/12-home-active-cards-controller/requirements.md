# Requirements Document

## Introduction

FR-02-W1: events that can still be queued for are shown active and clickable on Home (PRD H-2, FR-02). The click
leads to the waiting room route; joining the queue (device token, Turnstile, `joinQueue`) is FR-04-W1 and the
waiting room screen is FR-06-W1.

## Glossary

| Term        | Definition                                                                           |
| ----------- | ------------------------------------------------------------------------------------ |
| Joinable    | `waiting_room_open`, `on_sale` or `almost_gone`: the queue is open and stock remains |
| Join target | `/queue?event=<eventId>` (static export: ids are search params)                      |

## Requirements

### Requirement 1: Mark joinable events

**User Story:**

AS a buyer
I WANT to see which events I can join now
SO THAT I go straight to the right sale

#### Acceptance Criteria

- SHALL mark an event joinable only in `waiting_room_open`, `on_sale` or `almost_gone`
- WHEN joinable THEN the card view SHALL carry `join: { href, label }`
- WHEN not joinable THEN `join` SHALL be `null` (coming soon, temporarily full, sold out, ended)

### Requirement 2: Track the choice

#### Acceptance Criteria

- WHEN the buyer opens an event THEN SHALL track `home_event_select` with `eventId`, `state` and `position`
  (0 = featured poster, 1… = list order)
- SHALL expose the one-place-per-device hint for the featured call to action
