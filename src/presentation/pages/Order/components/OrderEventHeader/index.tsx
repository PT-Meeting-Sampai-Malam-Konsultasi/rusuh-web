import Poster from '@presentation/components/Poster';
import type { OrderEventView } from '@utils/format/order-event';

import styles from './order-event-header.module.css';

interface OrderEventHeaderProps {
  event: OrderEventView;
}

/** Which show: small poster, the name as the page heading, date · time · venue. */
export default function OrderEventHeader({ event }: OrderEventHeaderProps) {
  return (
    <div className={styles.header}>
      {/* The h1 already names the event; the thumb is decoration. */}
      <div className={styles.art} aria-hidden="true">
        <Poster tone={event.posterTone} size="thumb" title={event.name} imageUrl={event.imageUrl} loading="eager" />
      </div>
      <div className={styles.text}>
        <h1 className={styles.title}>
          {event.name}
          {event.subtitle && <span className={styles.subtitle}> {event.subtitle}</span>}
        </h1>
        <p className={styles.meta}>{event.metaLine}</p>
      </div>
    </div>
  );
}
