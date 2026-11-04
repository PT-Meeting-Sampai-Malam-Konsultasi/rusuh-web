# Requirements Document

## Introduction

Turns the `listEvents` response into what Home shows: a featured event and the rest of the list in a fixed order
(PRD H-1, App Flow 4.1, FR-01-W1).

## Glossary

| Term           | Definition                                            |
| -------------- | ----------------------------------------------------- |
| Live event     | State `waiting_room_open`, `on_sale` or `almost_gone` |
| Featured event | The poster hero at the top of Home                    |

## Requirements

### Requirement 1: Order the list

**User Story:**

AS a buyer
I WANT events I can act on at the top and finished ones at the bottom
SO THAT I find the sale I came for first

#### Acceptance Criteria

- SHALL order by state: live → `coming_soon` → `temporarily_full` → `sold_out` → `ended`
- WHEN two events share a state rank THEN SHALL order by `saleOpensAt` (missing last), then `startsAt`
- SHALL keep every event, including sold-out and ended ones (H-1)

### Requirement 2: Pick the featured event

**User Story:**

AS a buyer
I WANT the most relevant event shown large
SO THAT the main sale is obvious

#### Acceptance Criteria

- SHALL feature the first event of the ordered list when it is live, `coming_soon` or `temporarily_full`
- WHEN no event qualifies THEN `featured` SHALL be `null` and every event stays in `others`
- SHALL NOT list the featured event again in `others`
- SHALL return `total` (all events) and `serverNow` from the response
