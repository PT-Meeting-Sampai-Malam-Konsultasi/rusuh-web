import type { TFunction } from 'i18next';

import type { EventCardView } from '@utils/format/event-card';

import EventCard from '../EventCard';
import styles from './event-list.module.css';

interface EventListProps {
  t: TFunction;
  events: EventCardView[];
  countLabel: string;
  /** With no featured poster, the list heading is the page's h1. */
  isMainHeading: boolean;
  onSelect: (eventId: string, position: number) => void;
}

/** "Semua event": every other event, finished ones last but still shown (PRD H-1). */
export default function EventList({ t, events, countLabel, isMainHeading, onSelect }: EventListProps) {
  const Heading = isMainHeading ? 'h1' : 'h2';
  return (
    <section className={styles.list} aria-labelledby="home-all-events">
      <div className={styles.head}>
        <Heading className={styles.heading} id="home-all-events">
          {t('home_all_events')}
        </Heading>
        <span className={styles.count}>{countLabel}</span>
      </div>
      <ol className={styles.gigs}>
        {events.map((event, index) => (
          <EventCard key={event.id} event={event} index={index} onSelect={onSelect} />
        ))}
      </ol>
    </section>
  );
}
