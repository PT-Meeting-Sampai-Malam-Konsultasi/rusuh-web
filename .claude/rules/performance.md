---
paths:
  - "src/app/**"
  - "src/presentation/**"
  - "next.config.ts"
  - "package.json"
  - "scripts/**"
---

# Performance budgets

Every page ships with all-green Core Web Vitals. The waiting room must stay light: up to 300,000 phones load it during a
sale (PRD §3, NFR-06).

## Targets

| Metric | Green |
| --- | --- |
| LCP | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |

| Budget (gzip) | Limit |
| --- | --- |
| JS loaded by any one route on first load | ≤ 150 KB |
| Any single chunk | ≤ 50 KB |
| Total CSS | ≤ 30 KB |
| Largest image | ≤ 100 KB (WebP/AVIF, sized) |

Checked by `npm run check:bundle` (`scripts/check-bundle-size.mjs` over `out/_next/static/chunks`).

## Techniques

1. Keep route files as server components; put `'use client'` as deep as the architecture allows (page shells), so static
   chrome stays HTML.
2. Next.js splits by route; lazy-load heavy, below-the-fold or rarely used parts with `next/dynamic`
   (e.g. the QR renderer, PDF download, Snap loader).
3. Load `snap.js` only on the payment screen, `afterInteractive`, never in `<head>` of every page.
4. No barrel `index.ts` re-exports; import from the source file. `"sideEffects": false` where safe.
5. Images: explicit `width`/`height`, `loading="lazy"` below the fold, WebP/AVIF from `public/`.
6. Fonts: `next/font/local` with `display: 'swap'`, subset to Latin + Indonesian glyphs, preload the display font.
7. Queue polling: one small request per interval with jitter (ADR-0003); no re-render of the whole screen per tick —
   only the number, ETA and track update.

## Measure

```bash
npm run build && npx serve out    # serve the static export
npx lighthouse http://localhost:3000/antrian?event=demo --only-categories=performance --form-factor=mobile
```

Mobile emulation, 4G throttling. Optional CI gate: Lighthouse CI with `categories:performance ≥ 0.9` and the CWV
thresholds above.

## Rules

- No page ships amber.
- A PR that grows first-load JS of a route by > 5 KB states why.
- Above-the-fold content is never behind a dynamic import.

## Anti-patterns

- ❌ Whole libraries for one function (lodash, date libraries) — use small imports or `Intl`
- ❌ `'use client'` on layouts or route files without need
- ❌ Third-party scripts in `<head>` synchronously
- ❌ Images without dimensions; base64 images > 2 KB
