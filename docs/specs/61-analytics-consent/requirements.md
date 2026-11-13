# Requirements Document

## Introduction

The analytics cookie consent (NFR-09-W2 part 2, rusuh-web#72). GA4 sets cookies, so under Indonesia's PDP law it loads
only after a yes; Sentry and Cloudflare Web Analytics are cookieless and are not part of the choice. HiFi: `home.html`
states `consent` and `settings`, `waiting-room.html` state `consent`, `account.html` section Privasi
(`design/hifi/assets/consent.css`). The whole feature sits behind `NEXT_PUBLIC_ANALYTICS_ENABLED`, off by default, until
the GA4 web stream exists (part 3).

## Requirements

### Requirement 1: Switch

- Without `NEXT_PUBLIC_ANALYTICS_ENABLED=true` there SHALL be no banner, no settings, no footer link and no Privacy
  section, and the stored choice SHALL NOT be read
- The deploy workflow SHALL pass the repository variable `ANALYTICS_ENABLED`

### Requirement 2: The choice

- Stored per device in localStorage `rusuh.consent` as `{ analytics: 'granted' | 'denied', at }`
- A choice older than 12 months, or anything unreadable, SHALL count as not asked
- Read on the client only (the HTML is prerendered without it)

### Requirement 3: Banner

- Shown while the choice is not given and the settings are closed; a fixed strip at the bottom that blocks nothing,
  above the tab bar on phones
- "Terima" is the main button; "Tolak" a full button of the same size beside it; "Info" opens the settings
- On `/queue` the short version: one line, so it never covers the number
- The page keeps room at the end so its last lines can scroll above the strip

### Requirement 4: Settings and Account

- "Pengaturan privasi": Wajib (always on) and the analytics switch, which starts from the saved choice (off when never
  asked); "Simpan pilihan" saves, "Batal" and Escape close without saving; a dialog on desktop, a sheet on phones
- Opened from the banner's "Info" and from the desktop footer link "Pengaturan cookie" (`#cookie-settings`, any page)
- Account section "3 Privasi" (the phone's way in): the same switch, saved on change
- Copy in ID and EN; the switch writes "Aktif" / "Nonaktif" beside it

### Requirement 5: GA4 (part 3)

- GA4 SHALL run only with `NEXT_PUBLIC_ANALYTICS_ENABLED=true`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` set (deploy variable
  `GA_MEASUREMENT_ID`) and the analytics choice `granted`; before that no script loads and nothing is sent
- It SHALL get the tracking plan events from the analytics adapter (not `api_error`, which stays in Sentry), page views
  from the screens only, and URLs scrubbed like Sentry's; Google signals and ad storage off
- A yes given on a screen SHALL count that screen's page view; a later no SHALL stop GA4 and delete its `_ga*` cookies
