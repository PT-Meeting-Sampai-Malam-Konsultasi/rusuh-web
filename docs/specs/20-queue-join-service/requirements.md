# Requirements Document

## Introduction

FR-04-W1 and FR-06-W1 (one PR): a buyer opens `/queue?event=<id>` from Home, the page gets this browser a device
token (Turnstile + `registerDevice`), joins the event's queue (Turnstile + `joinQueue`) and shows "Anda antrian
ke-n". This spec wraps the two `queue` operations (openapi `registerDevice`, `joinQueue`) and adds the stores and the
Turnstile contract they need (ADR-0003, `api/tokens.md`).

## Glossary

| Term            | Definition                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Device token    | `device+jwt` from `POST /devices`, 30 days; header `X-Device-Token`; kept in local storage (ADR-0003)  |
| Turnstile token | Single-use proof from the Cloudflare widget; header `X-Turnstile-Token`; one per call                  |
| Queue token     | `queue+jwt` from `joinQueue`; kept per event in local storage for the later queue calls (FR-07/08/10)  |
| Place           | `QueuePlace`: `state`, `seq` (null before the draw), `served`, `opensAt`, `turnExpiresAt`, `serverNow` |

## Requirements

### Requirement 1: Services

#### Acceptance Criteria

- `deviceService.registerDevice(turnstileToken)` SHALL `POST devices` on the queue API with `{ platform: 'web' }`
  and the `X-Turnstile-Token` header
- `queueService.joinQueue(eventId, deviceToken, turnstileToken)` SHALL `POST queue/{eventId}/join` with
  `X-Device-Token` and `X-Turnstile-Token`; the event id SHALL be URL-encoded
- Services SHALL return `HttpResponse<T>` and let errors through

### Requirement 2: Stores and Turnstile

#### Acceptance Criteria

- `deviceTokenStore` SHALL keep the device token in local storage (`rusuh.device`); `clear()` removes it
- `queuePlaceStore` SHALL keep `{ queueToken, seq, joinedServed }` per event (`rusuh.queue.<eventId>`) and ignore
  unreadable values
- `turnstile.getToken(action)` SHALL load the Cloudflare script once, render an `interaction-only` widget in the page's
  Turnstile slot (or the body), resolve the token, remove the widget, and reject with `VERIFICATION_UNAVAILABLE` on a
  widget error, expiry or timeout
