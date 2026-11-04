# Implementation Plan: Scaffold step 4 — i18n and styles

## Overview

Set up bilingual text (ID default, EN) and the Poster Sablon theme, fonts and base styles (scaffold-app step 4).

## Tasks

- [x] 1. Write the i18n instance [Requirement 1]
- [x] 2. Write id.json and en.json with base and error keys [Requirement 1]
- [x] 3. Write src/styles/app.css with @theme and base layer [Requirement 2]
- [x] 4. Write src/app/fonts.ts; import styles and fonts in layout [Requirement 2]
- [x] 5. Write translation tests [Requirement 1]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4, 5], [6]] }
```

## Notes

- globals.css from the generator was replaced by src/styles/app.css.
- Error copy follows the Design Brief voice; review the wording with the BA.
