# Requirements Document

## Introduction

`queueController` for FR-10-W1: refreshes and new tabs resume the place; "Antre lagi" really joins again.

## Requirements

### Requirement 1

#### Acceptance Criteria

- SHALL show `missed` for a `missed` join answer (refresh after a missed turn)
- "Antre lagi" SHALL call the join with `{ rejoin: true }`; every other join resumes
- SHALL track `queue_join` with `outcome: 'resumed'` for a resumed place
