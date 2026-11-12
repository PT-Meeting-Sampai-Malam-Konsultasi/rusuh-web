# Requirements Document

## Introduction

Error monitoring with Sentry and an `X-Request-ID` on API calls (NFR-09-W1, rusuh-web#65; TRD §9 Observability). The
backend logs to CloudWatch; one request ID finds the browser error in Sentry and the log line in CloudWatch. Sentry
project `rusuh-app/rusuh-web`, created 12 Nov 2026.

## Requirements

### Requirement 1: Request ID

- The HTTP adapter SHALL send `X-Request-ID` (UUID v4) on every call except cacheable reads (`cacheable: true`: the
  frontier poll, where a custom header would add a CORS preflight to every poll)
- A replay after a session refresh SHALL keep the same ID
- `HttpError.requestId` SHALL be the server's echo (`X-Request-ID` response header, then the problem's `traceId`),
  otherwise the ID sent
- Error popups opened for an API error SHALL show "Kode bantuan: <first 8 characters>" (ID, EN)

### Requirement 2: Sentry

- Off without `NEXT_PUBLIC_SENTRY_DSN`; environment, traces sample rate (default 0.05) and replay-on-error rate
  (default 0.1) from config; release = `NEXT_PUBLIC_APP_VERSION` (tag or commit)
- Loaded after the page is interactive, in two lazy chunks: the core SDK (errors, web vitals) for every session, Session
  Replay only for sessions drawn for one, and never on the waiting room
- Errors from the error boundaries and unhandled errors; API failures leave an `api_error` breadcrumb with the request
  ID, and server errors (5xx) are reported with a `request_id` tag; network errors are not reported
- No trace headers to the API (`tracePropagationTargets: []`) until its CORS allows `sentry-trace` and `baggage`
- Privacy: no user info, cookies, headers or bodies; e-mails, NIKs and tokens masked in messages, breadcrumbs, extra
  data and URLs; replay masks all text and inputs
- Per session: the same error at most 3 times, at most 30 events

### Requirement 3: Build and deploy

- CI SHALL pass the DSN, environment (`production` on tags, `staging` on main, `preview` on pull requests), release
  and sample rates; with the `SENTRY_AUTH_TOKEN` secret it SHALL build source maps, inject debug IDs, upload them under
  the release, and delete them before deploying
- The bundle check SHALL keep the 50 KB per-chunk budget for the core SDK; the replay chunk is reported apart, like the
  mock API
