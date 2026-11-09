'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import container from '@infrastructure/di/container';
import i18n from '@infrastructure/i18n';
import Button from '@presentation/components/Button';
import StatusScreen from '@presentation/components/StatusScreen';

import styles from '../fallback.module.css';

/** Sign-in segment fallback. Static: no API calls; a queue place is kept while signing in, so say so. */
export default function LoginError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    container.resolve('analyticsAdapter').reportError(error, { boundary: 'login' });
  }, [error]);

  return (
    <StatusScreen
      title={i18n.t('error_page_title')}
      body={i18n.t('error_page_body')}
      note={i18n.t('error_page_queue_note')}
    >
      <Button onClick={() => retry()}>{i18n.t('action_retry')}</Button>
      <Link className={styles.link} href="/">
        {i18n.t('action_back_home')}
      </Link>
    </StatusScreen>
  );
}
