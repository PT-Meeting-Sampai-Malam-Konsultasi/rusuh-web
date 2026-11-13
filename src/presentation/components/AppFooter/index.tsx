import Link from 'next/link';
import type { TFunction } from 'i18next';

import { ROUTES } from '@utils/constants/routes';

import styles from './app-footer.module.css';

interface AppFooterProps {
  t: TFunction;
}

const LINKS = [
  ['footer_terms', ROUTES.TERMS],
  ['footer_privacy', ROUTES.PRIVACY],
  ['footer_refund', ROUTES.REFUND],
  ['footer_help', ROUTES.HELP],
] as const;

/** Desktop footer (the phone has the tab bar instead). */
export default function AppFooter({ t }: AppFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>{t('footer_copyright')}</span>
        <nav className={styles.links}>
          {LINKS.map(([key, href]) => (
            <Link key={key} className={styles.link} href={href}>
              {t(key)}
            </Link>
          ))}
          {/* Opens the privacy settings (NFR-09-W2); shown only while analytics is on (`html[data-consent]`). */}
          <a className={`${styles.link} ${styles.cookies}`} href="#cookie-settings">
            {t('footer_cookies')}
          </a>
        </nav>
      </div>
    </footer>
  );
}
