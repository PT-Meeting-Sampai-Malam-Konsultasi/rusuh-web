# Requirements Document

## Introduction

Make the app runnable: root layout, providers, error boundaries, 404 and a placeholder home (scaffold-app step 6).

## Glossary

| Term     | Definition                                    |
| -------- | --------------------------------------------- |
| Scaffold | The architecture base every feature builds on |

## Requirements

### Requirement 1: Providers

**User Story:**

AS a page author
I WANT DI, React Query, i18n and the contexts ready on every page
SO THAT controllers just work

#### Acceptance Criteria

- SHALL call registerAll() once before any provider renders
- SHALL nest I18nextProvider → QueryClientProvider → NetworkStatus → Loading → PopupError
- SHALL render the loading overlay, error popup and offline banner from the contexts
- SHALL apply the saved language after mount and keep <html lang> in step

### Requirement 2: Fallbacks

**User Story:**

AS a user
I WANT a calm page instead of a white screen
SO THAT I can recover

#### Acceptance Criteria

- SHALL provide app/error.tsx ({ error, retry }) and app/global-error.tsx with its own html/body
- SHALL log errors through the analytics adapter
- SHALL provide a 404 in both languages

### Requirement 3: Reference chain

**User Story:**

AS the next developer
I WANT one complete example of route → screen → controller
SO THAT features follow the same pattern

#### Acceptance Criteria

- SHALL build the 404 as route file → client page shell → NotFoundController from DI
