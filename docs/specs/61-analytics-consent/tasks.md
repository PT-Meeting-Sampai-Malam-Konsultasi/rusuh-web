# Implementation Plan: Analytics consent

## Tasks

- [x] 1. Config flag `NEXT_PUBLIC_ANALYTICS_ENABLED`, `.env.example`, deploy variable; tests [Requirement 1]
- [x] 2. Consent store protocol and localStorage adapter with the 12-month expiry; DI; tests [Requirement 2]
- [x] 3. Consent context: store, footer hash, settings state; `useConsent` in DI; tests [Requirements 2, 4]
- [x] 4. Switch, ConsentBanner (full and compact), ConsentSettings; providers; footer link; translations; tests
      [Requirements 3, 4]
- [x] 5. Account "3 Privasi" section; controller `privacy`; tests [Requirement 4]
- [x] 6. Checked in a static build at 390 and 1440: Home, waiting room (compact), settings from "Info" and from
      `#cookie-settings`, "Terima" saves and the footer link shows
- [x] 7. GA4 sink after a yes (part 3): `NEXT_PUBLIC_GA_MEASUREMENT_ID`, gtag.js loaded on the first event after a yes,
      stopped with its cookies cleared on a later no; CSP; tests. Checked in a static build: no request before "Terima",
      `gtag/js` + `g/collect` after, `_ga*` cookies gone after switching it off [Requirement 5]
