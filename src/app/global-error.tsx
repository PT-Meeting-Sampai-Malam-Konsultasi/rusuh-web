'use client';

import '@styles/app.css';

import styles from './global-error.module.css';

/**
 * Replaces the root layout when it crashes, so it renders its own <html> and <body> and depends on nothing that
 * might have failed (no providers, DI or i18n): the text is shown in both languages.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="id">
      <body className={styles.body}>
        <main className={styles.screen}>
          <h1 className={styles.title}>Ada yang tidak beres.</h1>
          <p className={styles.en}>Something went wrong.</p>
          <p className={styles.text}>Muat ulang halaman. · Reload the page.</p>
          <button type="button" className={styles.button} onClick={() => retry()}>
            Coba lagi · Try again
          </button>
        </main>
      </body>
    </html>
  );
}
