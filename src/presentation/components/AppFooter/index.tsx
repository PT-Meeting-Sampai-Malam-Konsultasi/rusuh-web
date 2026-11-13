import type { TFunction } from 'i18next';

import styles from './app-footer.module.css';

interface AppFooterProps {
  t: TFunction;
}

// Legal and help pages are not built yet; the links keep their place in the layout.
const LINKS = ['footer_terms', 'footer_privacy', 'footer_refund', 'footer_help'] as const;

/** Desktop footer (the phone has the tab bar instead). */
export default function AppFooter({ t }: AppFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>{t('footer_copyright')}</span>
        <nav className={styles.links}>
          {LINKS.map((key) => (
            <a key={key} className={styles.link} href="#">
              {t(key)}
            </a>
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
