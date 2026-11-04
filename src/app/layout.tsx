import type { Metadata, Viewport } from 'next';

import '@styles/app.css';

import { bricolage, spaceGrotesk } from './fonts';
import Providers from './providers';

export const metadata: Metadata = {
  title: { default: 'Rusuh', template: '%s · Rusuh' },
  description: 'Tiket konser tanpa rusuh.',
};

export const viewport: Viewport = {
  themeColor: '#F2EEE3',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className={`${bricolage.variable} ${spaceGrotesk.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
