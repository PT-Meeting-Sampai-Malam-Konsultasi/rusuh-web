'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import container from '@infrastructure/di/container';
import i18n from '@infrastructure/i18n';
import Button from '@presentation/components/Button';
import StatusScreen from '@presentation/components/StatusScreen';

import styles from '../fallback.module.css';

/** Payment segment fallback. Static: no API calls; logs through analytics, says the held tickets are safe, then
 * offers retry and home. */
export default function PaymentError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    container.resolve('analyticsAdapter').reportError(error, { boundary: 'payment' });
  }, [error]);

  return (
    <StatusScreen title={i18n.t('error_page_title')} body={i18n.t('payment_fallback_body')}>
      <Button onClick={() => retry()}>{i18n.t('action_retry')}</Button>
      <Link className={styles.link} href="/">
        {i18n.t('action_back_home')}
      </Link>
    </StatusScreen>
  );
}
