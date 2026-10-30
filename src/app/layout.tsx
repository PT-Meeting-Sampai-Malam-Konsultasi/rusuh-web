import type { Metadata } from 'next';

import '@styles/app.css';

import { bricolage, spaceGrotesk } from './fonts';

export const metadata: Metadata = {
  title: { default: 'Rusuh', template: '%s · Rusuh' },
  description: 'Tiket konser tanpa rusuh.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className={`${bricolage.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
