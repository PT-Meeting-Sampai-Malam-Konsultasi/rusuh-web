'use client';

import Link from 'next/link';

import type { InfoControllerInterface } from '@controllers/info.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/info';
import AppFooter from '@presentation/components/AppFooter';
import AppHeader from '@presentation/components/AppHeader';
import TabBar from '@presentation/components/TabBar';

import styles from './info.module.css';

/** Terms, privacy, refund and help: a title, short sections, the other pages beside them and the help address. */
export default function InfoScreen() {
  const { t, title, lead, updated, sections, links, contactEmail, locale, setLocale, nav } =
    container.resolve<InfoControllerInterface>('infoController');

  return (
    <div className={styles.page}>
      <AppHeader
        nav={nav}
        locale={locale}
        onLocaleChange={setLocale}
        labels={{ home: t('logo_home_label'), nav: t('nav_main_label'), language: t('language_switch_label') }}
      />
      <main className={styles.main}>
        <header className={styles.hero}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{lead}</p>
          <p className={styles.updated}>{updated}</p>
        </header>

        <div className={styles.layout}>
          <nav className={styles.side} aria-label={t('info_nav_label')}>
            <ul className={styles.sideList}>
              {links.map((link) => (
                <li key={link.href}>
                  <Link className={styles.sideLink} href={link.href} aria-current={link.current ? 'page' : undefined}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.body}>
            {sections.map((section) => (
              <section key={section.id} className={styles.section} aria-labelledby={section.id}>
                <h2 className={styles.sectionTitle} id={section.id}>
                  {section.title}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className={styles.paragraph}>
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}

            <aside className={styles.contact}>
              <h2 className={styles.contactTitle}>{t('info_contact_title')}</h2>
              <p className={styles.paragraph}>{t('info_contact_body')}</p>
              <a className={styles.contactLink} href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </aside>
          </div>
        </div>
      </main>
      <AppFooter t={t} />
      <TabBar label={t('nav_app_label')} nav={nav} />
    </div>
  );
}
