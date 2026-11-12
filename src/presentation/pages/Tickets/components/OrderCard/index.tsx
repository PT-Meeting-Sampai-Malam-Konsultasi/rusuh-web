import Link from 'next/link';
import type { TFunction } from 'i18next';

import ButtonLink from '@presentation/components/ButtonLink';
import Poster from '@presentation/components/Poster';
import Stamp from '@presentation/components/Stamp';
import type { MyOrderCardView } from '@utils/format/tickets';

import styles from './order-card.module.css';

interface OrderCardProps {
  t: TFunction;
  order: MyOrderCardView;
}

/** One paid order: poster, event, its tickets as small stubs (category over holder, no NIK), the date on the right. */
export default function OrderCard({ t, order }: OrderCardProps) {
  return (
    <li className={[styles.card, order.past && styles.past].filter(Boolean).join(' ')}>
      <Link className={styles.poster} href={order.href} prefetch={false} aria-hidden="true" tabIndex={-1}>
        <Poster
          tone={order.posterTone}
          size="tile"
          title={order.posterTitle}
          subtitle={order.posterSubtitle}
          imageUrl={order.imageUrl}
        />
      </Link>
      <div className={styles.info}>
        {order.past ? (
          <Stamp tone="ended">{t('tickets_ended')}</Stamp>
        ) : (
          <Stamp tone="paid">✓ {t('tickets_paid')}</Stamp>
        )}
        <h3 className={styles.title}>
          <Link href={order.href} prefetch={false}>
            {order.title}
          </Link>
        </h3>
        {order.dateLine && <p className={styles.meta}>{order.dateLine}</p>}
        <ul className={styles.stubs} aria-label={order.ticketCount}>
          {order.stubs.map((stub) => (
            <li key={stub.id}>
              <b>{stub.category}</b>
              {stub.holder}
            </li>
          ))}
        </ul>
        <p className={styles.order}>
          {t('tickets_order')}{' '}
          {order.orderCode && (
            <>
              <b>{order.orderCode}</b> ·{' '}
            </>
          )}
          <span className={styles.nowrap}>{order.total}</span>
        </p>
      </div>
      <div className={styles.when}>
        {order.day && (
          <p className={styles.date}>
            <span className={styles.day}>{order.day}</span>
            <span className={styles.month}>{order.month}</span>
          </p>
        )}
        {order.daysLeft && <p className={styles.left}>{order.daysLeft}</p>}
        <ButtonLink className={styles.action} href={order.href} variant={order.past ? 'secondary' : 'primary'}>
          {t('tickets_view')}
          {!order.past && <span aria-hidden="true"> →</span>}
        </ButtonLink>
      </div>
    </li>
  );
}
