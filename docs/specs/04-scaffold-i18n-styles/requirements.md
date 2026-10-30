# Requirements Document

## Introduction

Set up bilingual text (ID default, EN) and the Poster Sablon theme, fonts and base styles (scaffold-app step 4).

## Glossary

| Term     | Definition                                    |
| -------- | --------------------------------------------- |
| Scaffold | The architecture base every feature builds on |

## Requirements

### Requirement 1: Bilingual text

**User Story:**

AS a user
I WANT the app in Bahasa Indonesia or English
SO THAT I can read it (ADR-0014)

#### Acceptance Criteria

- SHALL initialise i18next with id (default, fallback) and en, useSuspense false
- SHALL keep id.json and en.json with identical flat snake_case keys
- SHALL have a message for every API error code and transport code

### Requirement 2: Theme and fonts

**User Story:**

AS a designer
I WANT the HiFi tokens in Tailwind
SO THAT screens match Poster Sablon

#### Acceptance Criteria

- SHALL define colours, fonts, square corners, offsets, easing and breakpoints in @theme
- SHALL load Bricolage Grotesque (width axis 75–100%) and Space Grotesk with next/font/local
- SHALL apply paper background, grain, focus ring and reduced-motion handling in the base layer
