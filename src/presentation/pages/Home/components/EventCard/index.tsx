import Link from 'next/link';
import type { CSSProperties } from 'react';

import ButtonLink from '@presentation/components/ButtonLink';
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
 * One gig in the list: poster, stamp, what and where, then the price or how the sale ended. Three looks:
 * - joinable: one link, its call to action stretches over the whole card (FR-02);
 * - temporarily full: a plain card with a secondary "Tetap antre" button (FR-03);
 * - sold out or ended: dimmed poster (sold out stamped "HABIS"), muted title, nothing to press (FR-03).
 */
export default function EventCard({ event, index, onSelect }: EventCardProps) {
  const join = event.join?.kind === 'join' ? event.join : null;
  const anyway = event.join?.kind === 'anyway' ? event.join : null;
  const classes = [styles.card, join && styles.active, event.finished && styles.out].filter(Boolean).join(' ');
  const poster = (
    <Poster
      tone={event.posterTone}
      size="card"
      title={event.name}
      kicker={event.kicker}
      subtitle={event.subtitle}
      imageUrl={event.imageUrl}
    />
  );
  return (
    <li className={classes} style={{ '--i': index + 1 } as CSSProperties}>
      <div className={index % 2 ? styles.tiltRight : styles.tiltLeft}>
        {event.finished ? <div className={styles.dim}>{poster}</div> : poster}
        {/* The stamp already says "Habis terjual"; the plate is the poster's look, not extra information. */}
        {event.overlay && (
          <span className={styles.overlay} aria-hidden="true">
            {event.overlay}
          </span>
        )}
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
        {join && (
          <Link
            className={styles.join}
            href={join.href}
            prefetch={false}
            aria-label={`${join.label}: ${event.title}`}
            onClick={() => onSelect(event.id, index + 1)}
          >
            {join.label} <span aria-hidden="true">→</span>
          </Link>
        )}
        {anyway && (
          <ButtonLink
            href={anyway.href}
            variant="secondary"
            size="sm"
            className={styles.anyway}
            ariaLabel={`${anyway.label}: ${event.title}`}
            onClick={() => onSelect(event.id, index + 1)}
          >
            {anyway.label}
          </ButtonLink>
        )}
      </div>
    </li>
  );
}
