import type { ReactNode } from 'react';
import Link from 'next/link';

import type { NavLink } from '@presentation/components/AppHeader';

import styles from './tab-bar.module.css';

interface TabBarProps {
  label: string;
  nav: NavLink[];
}

const ICONS: Record<NavLink['icon'], ReactNode> = {
  events: <path d="M3 10.5 12 4l9 6.5V20h-6v-6H9v6H3z" />,
  queue: (
    <>
      <path d="M4 6h16M4 12h10M4 18h6" />
      <circle cx="18" cy="17" r="2.5" />
    </>
  ),
  tickets: (
    <>
      <path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
      <path d="M14 7v10" strokeDasharray="2 2" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5" />
    </>
  ),
};

/** Phone-only bottom tab bar (the app look below 720px). */
export default function TabBar({ label, nav }: TabBarProps) {
  return (
    <nav className={styles.tabbar} aria-label={label} data-tabbar="">
      {nav.map((item) => (
        <Link key={item.href} className={styles.tab} href={item.href} aria-current={item.current ? 'page' : undefined}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS[item.icon]}
          </svg>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
