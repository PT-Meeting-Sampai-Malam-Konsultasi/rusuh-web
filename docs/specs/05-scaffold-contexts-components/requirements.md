# Requirements Document

## Introduction

Create the app-wide contexts (loading, error popup, network status) and the shared Poster Sablon components, and replace the step 3 DI placeholders (scaffold-app step 5).

## Glossary

| Term     | Definition                                    |
| -------- | --------------------------------------------- |
| Scaffold | The architecture base every feature builds on |

## Requirements

### Requirement 1: Contexts

**User Story:**

AS a controller author
I WANT loading, error-popup and network-status state through DI
SO THAT pages show consistent feedback

#### Acceptance Criteria

- SHALL provide LoadingProvider/useLoading, PopupErrorProvider/usePopupError, NetworkStatusProvider/useNetworkStatus
- SHALL register the real hooks in infrastructure.registry (no placeholders)
- WHEN the heartbeat fails THEN isOnline SHALL become false

### Requirement 2: Shared components

**User Story:**

AS a page author
I WANT one control grammar
SO THAT every screen looks like the HiFi

#### Acceptance Criteria

- SHALL provide Button, Stamp, Timer, TextField, LoadingOverlay, ErrorPopup, OfflineBanner with CSS modules starting with @reference
- SHALL NOT call useTranslation() in shared components
- SHALL make the error popup an alertdialog that focuses close and closes on Escape

### Requirement 3: Error codes

**User Story:**

AS a controller author
I WANT every API code mapped to a translation key
SO THAT no raw code reaches the user

#### Acceptance Criteria

- SHALL map every ErrorCode and transport code to error_<code>
- SHALL register ERROR_CODE_MAP in helpers.registry
