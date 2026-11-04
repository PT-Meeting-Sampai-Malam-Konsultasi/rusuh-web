import Link from 'next/link';

import LanguageSwitch, { type SwitchLocale } from '@presentation/components/LanguageSwitch';

import styles from './app-header.module.css';

export interface NavLink {
  href: string;
  label: string;
  icon: 'events' | 'queue' | 'tickets' | 'account';
  current: boolean;
  desktop: boolean;
}

interface AppHeaderProps {
  nav: NavLink[];
  locale: SwitchLocale;
  onLocaleChange: (locale: SwitchLocale) => void;
  labels: { home: string; nav: string; language: string };
}

/** Sticky site header from 720px; below it, the app bar (logo + language) with the tab bar at the bottom. */
export default function AppHeader({ nav, locale, onLocaleChange, labels }: AppHeaderProps) {
  const desktop = nav.filter((item) => item.desktop);
  const last = desktop[desktop.length - 1];
  const switcher = <LanguageSwitch label={labels.language} locale={locale} onChange={onLocaleChange} />;

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link className={styles.logo} href="/" aria-label={labels.home}>
          RUSUH<b>!</b>
        </Link>
        <nav className={styles.nav} aria-label={labels.nav}>
          {desktop.map((item) => (
            <span key={item.href} className={styles.item}>
              {item === last && switcher}
              <Link className={styles.link} href={item.href} aria-current={item.current ? 'page' : undefined}>
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
        <div className={styles.phoneSwitch}>{switcher}</div>
      </div>
    </header>
  );
}
