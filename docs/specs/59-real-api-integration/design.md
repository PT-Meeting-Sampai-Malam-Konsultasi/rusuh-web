# Design Document

Services change paths only; their contracts and tests follow. The mock handlers move to the same paths; the auth mock
serves the profile on both `me` and `auth/profile`.

Live probe (12 Nov): `GET /core/events` 200 with 4 events; `/core/events/{id}` 200; categories, attendees, bookings and
tickets under `/core` answer 401 without a session; old paths 404; `POST /queue/devices` 400 without a Turnstile token
(Turnstile is verified); the queue frontier answers "Unknown event" for every event; CORS still blocks staging, and the
queue service does not allow `X-Request-ID`.

## Layer Constraints

- Services stay path + type only, no try/catch; the mock serves exactly the contract's paths.
