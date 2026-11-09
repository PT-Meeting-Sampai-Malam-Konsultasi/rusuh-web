# Requirements Document

## Introduction

Shows the estimate in the waiting room (FR-09-W1), as the HiFi `.wr-eta`: "± 4–6 menit lagi" in bold, then
"Diperbarui 2 detik lalu · 310 orang masuk / menit" (FR-07).

## Requirements

### Requirement 1: Controller

#### Acceptance Criteria

- SHALL add `eta` to the waiting view: "± 4–6 menit lagi", "± 4 menit lagi" when both ends meet, "kurang dari 1
  menit lagi" for `soon`, or null
- SHALL hold the shown range with `holdWaitEstimate` across updates, starting over for a new number

### Requirement 2: Screen

#### Acceptance Criteria

- SHALL show the estimate in bold before the live line, on the HiFi `.wr-eta` row (32 px / 44 px display type)
- SHALL keep the live line out of the announcements; the estimate is announced with the number (polite region)
