# Requirements Document

## Introduction

The visible half of FR-02-W1: joinable events look and behave active on Home, as in `design/hifi/home.html`.

## Requirements

### Requirement 1: Featured call to action

#### Acceptance Criteria

- WHEN the featured event is joinable THEN SHALL show "Masuk antrian →" (ink button, pink offset) and the
  one-place-per-device hint
- SHALL NOT show the button for a featured event that is not joinable

### Requirement 2: Active cards

#### Acceptance Criteria

- WHEN a list event is joinable THEN the whole card SHALL be one link to its join target, with a visible
  "Masuk antrian →" call to action
- SHALL show hover, focus-visible and pressed states on active cards; focus ring around the whole card
- Cards that are not joinable SHALL stay plain (no link, no hover)

### Requirement 3: Analytics

#### Acceptance Criteria

- WHEN a join link is followed THEN SHALL call `selectEvent(eventId, position)`
