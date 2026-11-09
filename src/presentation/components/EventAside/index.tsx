import Poster, { type PosterTone } from '@presentation/components/Poster';

import styles from './event-aside.module.css';

/** The event as the aside shows it (waiting room, sign-in). */
export interface EventAsideView {
  name: string;
  subtitle?: string;
  imageUrl?: string;
  posterTone: PosterTone;
  posterDate: string;
  posterPlace: string;
  dateLine: string;
  venueLine: string;
  kicker: string;
}

interface EventAsideProps {
  event: EventAsideView;
  label: string;
  /** Sold out: the poster goes grey and gets the stamped plate. */
  overlay?: string | null;
  /** A small line above the poster ("Setelah masuk, Anda lanjut ke"). */
  caption?: string;
}

/** Which show the page is about: the tilted poster beside the content on desktop, a printed banner on phones. */
export default function EventAside({ event, label, overlay = null, caption }: EventAsideProps) {
  return (
    <aside className={`${styles.event} ${overlay ? styles.closed : ''}`} aria-label={label}>
      {caption && <p className={styles.caption}>{caption}</p>}
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
