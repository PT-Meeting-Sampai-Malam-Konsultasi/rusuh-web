# Step 4 — i18n and styles

## i18n

| File | Content |
| --- | --- |
| `src/infrastructure/i18n/index.ts` | i18next init with local resources; `lng: 'id'`, `fallbackLng: 'id'`, `interpolation.escapeValue: false`, `react.useSuspense: false`; export the instance |
| `src/translation/locale/id.json` | Base keys: common actions, errors (`error_network`, `error_unknown`, one per API `code`), not-found, offline banner |
| `src/translation/locale/en.json` | Same keys, full English |
| `src/utils/constants/storage-keys.ts` | `STORAGE_KEYS.LANGUAGE`, etc. |

- Flat `snake_case` keys, single namespace, `{{variable}}` interpolation.
- The persisted locale is applied on the client after mount (`i18n.changeLanguage(saved)`), never during prerender.
- Copy follows the Design Brief voice; ID first, EN complete.

## Styles

- Move the generator's `src/app/globals.css` to `src/styles/app.css` and replace its content with the Poster Sablon
  `@theme` from the design-system rule (colours, fonts, square radius, offsets, easing, breakpoints).
- Base layer: `html` text size, `body` paper background + ink text + Space Grotesk, the grain `body::before`, focus ring
  (3px blue, 3px offset), `prefers-reduced-motion` reset.
- `src/app/layout.tsx` imports `@styles/app.css`.

## Fonts

```ts
// src/app/fonts.ts
import localFont from 'next/font/local';
export const bricolage = localFont({
  src: '../../public/fonts/BricolageGrotesque.ttf', variable: '--font-bricolage', display: 'swap',
  weight: '200 800', preload: true,
});
export const spaceGrotesk = localFont({
  src: '../../public/fonts/SpaceGrotesk.ttf', variable: '--font-space-grotesk', display: 'swap', weight: '300 700',
});
```

Apply both `variable` classes on `<html>`. Check `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`
for the current `next/font/local` options.

## Gate

```bash
npx tsc --noEmit && npm run build
```
