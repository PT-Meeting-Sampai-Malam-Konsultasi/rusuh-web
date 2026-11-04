import localFont from 'next/font/local';

/** Display: condensed poster type; the width axis (75–100%) is used through font-stretch. */
export const bricolage = localFont({
  src: '../../public/fonts/BricolageGrotesque.ttf',
  variable: '--font-bricolage',
  display: 'swap',
  preload: true,
  declarations: [{ prop: 'font-stretch', value: '75% 100%' }],
});

/** Text: Space Grotesk. */
export const spaceGrotesk = localFont({
  src: '../../public/fonts/SpaceGrotesk.ttf',
  variable: '--font-space-grotesk',
  display: 'swap',
});
