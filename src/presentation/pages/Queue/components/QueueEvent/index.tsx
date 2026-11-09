import type { QueueEventView } from '@controllers/queue.controller';
import Poster from '@presentation/components/Poster';

import styles from './queue-event.module.css';

interface QueueEventProps {
  event: QueueEventView;
  label: string;
  /** Sold out: the poster goes grey and gets the stamped plate. */
  overlay: string | null;
}

/** Which show this queue is for: the tilted poster beside the number on desktop, a printed banner on phones. */
export default function QueueEvent({ event, label, overlay }: QueueEventProps) {
  return (
    <aside className={`${styles.event} ${overlay ? styles.closed : ''}`} aria-label={label}>
      {/* Only one of the two is displayed at a time, so screen readers meet the event once. */}
      <div className={styles.poster}>
        <Poster
          tone={event.posterTone}
          size="hero"
          className={styles.narrow}
          title={event.name}
          kicker={event.kicker}
          subtitle={event.subtitle}
          imageUrl={event.imageUrl}
          meta={{ date: event.posterDate, place: event.posterPlace }}
        />
      </div>
      <div className={`${styles.banner} ${styles[event.posterTone]}`}>
        <span className={styles.kicker}>{event.kicker}</span>
        <p className={styles.name}>{event.name.toUpperCase()}</p>
        {event.subtitle && <span className={styles.subtitle}>{event.subtitle}</span>}
        <p className={styles.meta}>
          {event.dateLine}
          <br />
          {event.venueLine}
        </p>
      </div>
      {overlay && (
        <span className={styles.overlay} aria-hidden="true">
          {overlay}
        </span>
      )}
    </aside>
  );
}
