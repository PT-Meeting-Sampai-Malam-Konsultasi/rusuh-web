# Design Document

```ts
// core/protocols/consent-store.protocol.ts
type AnalyticsConsent = 'granted' | 'denied';
interface ConsentStoreProtocol { get(): AnalyticsConsent | null; set(choice): void }

// infrastructure
config.analyticsEnabled                          // NEXT_PUBLIC_ANALYTICS_ENABLED (boolEnv)
createConsentStore({ storage, now? })            // DI: consentStore; CONSENT_MAX_AGE_MS = 365 days

// contexts/consent.context.tsx
<ConsentProvider enabled store>                  // inside PopupErrorProvider, around the app
useConsent(): ConsentApi                         // DI: { enabled, analytics, setAnalytics(granted), openSettings }
useConsentPrompt()                               // providers only: bannerVisible, settingsOpen, closeSettings, …

// presentation/components
ConsentBanner({ visible, compact, labels, onAccept, onDecline, onMore })
ConsentSettings({ open, analytics, labels, onSave, onClose })
Switch({ checked, onChange, onLabel, offLabel, ariaLabel?, describedBy? })

// controllers/account.controller.ts
privacy: { analytics: boolean; setAnalytics } | null
```

The provider reads the store with `useSyncExternalStore` (server snapshot: not asked), so the prerendered HTML never
shows the banner and there is no hydration mismatch. The footer link is a plain `#cookie-settings` anchor on every page:
the provider opens the settings on that hash and clears it on close; it is hidden by CSS unless the provider has marked
`<html data-consent>`, so no page passes the flag down.

Part 3: `createGa4Sink({ measurementId, consent: consentStore, scrubUrl })`, combined with the Sentry sink
(`combineSinks`) in DI. It asks the store on every call and loads gtag.js on the first one after `granted`
(`send_page_view: false`, signals and ad storage off). `ConsentStoreProtocol.subscribe` tells it about a change: a yes
sends the current screen's page view, a no sets `consent update denied` and `ga-disable-<id>` and deletes `_ga*`.

## Layer Constraints

- Only `config.ts` reads `process.env`; the protocol stays import-free; the adapter is the only code that touches the
  storage key.
- Controllers receive `useConsent` from DI and never import the context.
- Presentation components are props in, JSX out; the overlays render in `providers.tsx` only when the flag is on.
