---
paths:
  - "src/styles/**"
  - "src/**/*.module.css"
  - "src/presentation/**"
  - "public/fonts/**"
---

# Design system: Poster Sablon

Source of truth: [Design Brief](../../../rusuh-documentation/product/design-brief.md) and the HiFi
(`design/hifi/assets/rusuh.css`, `design/hifi/style-guide.html` in the project folder). Port values exactly; don't
approximate with Tailwind's default palette.

## Five rules

1. One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
   E-ticket: "Sampai jumpa").
2. Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
3. Print effects (misregistration, halftone, tilt, stamps) only on hero elements.
4. Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
5. Say the real number ("± 4 menit"), never inflate.

## Tokens in `src/styles/app.css`

```css
@import "tailwindcss";

@theme {
  --color-paper: #F2EEE3;   --color-card: #FBF9F3;   --color-paper-2: #E8E2D2;
  --color-ink: #141414;     --color-ink-2: #4A4740;  --color-ink-3: #6B665E;  --color-hair: #CFC8B6;
  --color-pink: #D81F72;    --color-pink-ink: #B8125C; --color-pink-tint: #F8D3E2;
  --color-blue: #2F5BEA;    --color-blue-ink: #1F3FB8; --color-blue-tint: #D6DFFB;
  --color-red: #C21F1F;     --color-green: #16784A;

  --font-display: var(--font-bricolage), 'Arial Narrow', sans-serif;  /* use with font-stretch 75% / 85% */
  --font-sans: var(--font-space-grotesk), system-ui, sans-serif;

  --radius-*: initial;                     /* square corners everywhere */
  --shadow-off: 6px 6px 0 var(--color-ink);
  --shadow-off-s: 4px 4px 0 var(--color-ink);
  --ease-click: cubic-bezier(.3, 1.5, .5, 1);
  --ease-out-print: cubic-bezier(.2, .8, .2, 1);
  --breakpoint-md: 45rem;   /* 720px: phone/app chrome below */
  --breakpoint-lg: 73.75rem; /* 1180px */
}
```

- Border width 2.5px ink; offsets 6px (cards, posters) and 4px (buttons, focus), 0 blur, in ink, pink or blue.
- Content max width 1328px; gutters 56px desktop, 16px phone.
- Paper grain: one fixed SVG-noise layer at 32% on `body::before`, not per component.

## Type roles

| Role | Font | Size |
| --- | --- | --- |
| Display XXL (queue number) | Bricolage 800, stretch 75% | clamp(140px, 26vw, 390px), lh .8 |
| Display XL (shouts) | same | clamp(64px, 9vw, 128–176px) |
| Display L / M / S | Bricolage 800/700, 75–85% | 40–64 / 28–40 / 22px |
| Lead / Body / Small / Label | Space Grotesk 500/400/400/600 | 18–24 / 16 (15 phone) / 13–14 / 13 caps |

Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.

## Components (one grammar)

- **Button:** ink plate + pink offset; press sinks into the shadow (90ms in, 150ms out); min height 56 web / 54 phone.
- **Stamp:** rotated −2°, caps, word first; one style per status (fill, outline, dashed, dark, grey).
- **Input:** 54px, card fill, ink border, blue offset on focus; error = red border + "!" message; valid = "✓".
- **Timer:** ink stamp; pink at 60 s (Detail) / 120 s (Payment).
- **Holder block:** "Saya sendiri / Orang lain" segmented control; "Myself" in pink with a profile card.
- **Code boxes:** 6 boxes; paste and autofill fill all six.
- **Snap:** our page only; Snap's UI is Midtrans's (theme colour `--color-pink-ink`).

## Motion

Print pass on first entry (blue plate then pink, 550ms, stagger 60ms, once); number bump on update (450ms);
"Giliran Anda!" slam and "HABIS" stamp (450–500ms); wrong-code shake (380ms). All off under
`prefers-reduced-motion`.

## Voice

Short, warm, "Anda". ID first, full EN translation. Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026`
(EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`, `Sat, 12 Dec 2026`). NIK masked as first 4 + last 4.
