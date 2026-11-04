# Implementation Plan: Home page

## Overview

Shared chrome, Home sections, styles, translations, tests and the build gate.

## Tasks

- [x] 1. Shared components: `Poster`, `LanguageSwitch`, `AppHeader`, `TabBar`, `AppFooter` with tests [Requirement 1]
- [x] 2. Sections: `HomeHero`, `EventList`, `EventCard`, `HomeSkeleton`, `HomeMessage` with tests [Requirement 1, Requirement 2]
- [x] 3. Page shell `src/presentation/pages/Home/index.tsx` + test; route metadata [Requirement 2]
- [x] 4. Translations in `id.json` and `en.json` [Requirement 1, Requirement 2]
- [x] 5. Motion and reduced motion [Requirement 3]
- [x] 6. Run the gate check and compare with the HiFi at 390 and 1440, ID and EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 4], [2], [3, 5], [6]] }
```

## Notes

- No CTA on the hero or cards yet: joining is FR-02/04/05; dimmed posters and the "HABIS" overlay are FR-03.
