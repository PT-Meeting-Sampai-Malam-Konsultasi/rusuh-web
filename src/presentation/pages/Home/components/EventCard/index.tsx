import Link from 'next/link';
import type { CSSProperties } from 'react';

import Poster from '@presentation/components/Poster';
import Stamp from '@presentation/components/Stamp';
import type { EventCardView } from '@utils/format/event-card';

import styles from './event-card.module.css';

interface EventCardProps {
  event: EventCardView;
  index: number;
  /** Called when the buyer follows the join link (analytics); position 1 is the first list card. */
  onSelect: (eventId: string, position: number) => void;
}

/**
 * One gig in the list: poster, stamp, what and where, then the price or how the sale ended.
 * A joinable event is one link: its call to action stretches over the whole card (FR-02).
 */
export default function EventCard({ event, index, onSelect }: EventCardProps) {
  return (
    <li
      className={event.join ? `${styles.card} ${styles.active}` : styles.card}
      style={{ '--i': index + 1 } as CSSProperties}
    >
      <div className={index % 2 ? styles.tiltRight : styles.tiltLeft}>
        <Poster
          tone={event.posterTone}
          size="card"
          title={event.name}
          kicker={event.kicker}
          subtitle={event.subtitle}
          imageUrl={event.imageUrl}
        />
      </div>
      <div className={styles.info}>
        <Stamp tone={event.stamp.tone}>{event.stamp.label}</Stamp>
        <h3 className={styles.title}>{event.title}</h3>
        <p className={styles.when}>
          {event.dateLine}
          <br />
          {event.venueLine}
        </p>
        {event.price && (
          <p className={styles.price}>
            {event.price.label} <b>{event.price.amount}</b>
          </p>
        )}
        {event.outcome && <p className={styles.outcome}>{event.outcome}</p>}
        {event.note && (
          <p className={styles.note}>
            {event.note.lead} {event.note.strong && <b>{event.note.strong}</b>}
            {event.note.detail && <span className={styles.detail}>{event.note.detail}</span>}
          </p>
        )}
        {event.join && (
          <Link
            className={styles.join}
            href={event.join.href}
            prefetch={false}
            aria-label={`${event.join.label}: ${event.title}`}
            onClick={() => onSelect(event.id, index + 1)}
          >
            {event.join.label} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </li>
  );
}
