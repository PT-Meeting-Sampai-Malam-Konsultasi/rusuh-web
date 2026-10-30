<!--
PR title = the commit on main (squash merge), so use the commit format:
  feat(queue): [FR-06-W1] show queue position in the waiting room
-->

Closes #

<!-- One issue per keyword: "Closes #6, closes #7". -->

## What

<!-- What changed and why, in a few lines. Link the parent requirement if useful. -->

## Screens

| Desktop (1440) | Mobile web (390) |
| -------------- | ---------------- |
|                |                  |

<!-- Screenshots or a short recording of every state you touched. Delete this section for non-UI changes. -->

## How to test

1.

## Checklist

- [ ] PR title follows `type(scope): [CODE] subject` and the body closes the sub-issue
- [ ] `npx tsc --noEmit`, `npm run lint`, tests and `npm run build` pass
- [ ] Checked at 390 and 1440, in Bahasa Indonesia and English
- [ ] Matches the Figma frames for every state covered
- [ ] Every API error code shows a translated message
- [ ] No secrets, real NIKs, `console.log` or `debugger`
