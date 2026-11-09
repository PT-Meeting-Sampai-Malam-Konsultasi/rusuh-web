'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import container from '@infrastructure/di/container';
import i18n from '@infrastructure/i18n';
import Button from '@presentation/components/Button';
import StatusScreen from '@presentation/components/StatusScreen';

import styles from '../fallback.module.css';

/** Order segment fallback. Static: no API calls; logs through analytics, then offers retry and home. */
export default function OrderError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    container.resolve('analyticsAdapter').reportError(error, { boundary: 'order' });
  }, [error]);

  return (
    <StatusScreen title={i18n.t('error_page_title')} body={i18n.t('error_page_body')}>
      <Button onClick={() => retry()}>{i18n.t('action_retry')}</Button>
      <Link className={styles.link} href="/">
        {i18n.t('action_back_home')}
      </Link>
    </StatusScreen>
  );
}
