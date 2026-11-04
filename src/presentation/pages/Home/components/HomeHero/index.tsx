import type { CSSProperties } from 'react';
import type { TFunction } from 'i18next';

import Poster from '@presentation/components/Poster';
import Stamp from '@presentation/components/Stamp';
import type { EventCardView } from '@utils/format/event-card';

import styles from './home-hero.module.css';

interface HomeHeroProps {
  t: TFunction;
  event: EventCardView;
}

/** The one loud thing on Home: the featured event's poster, its stamp and the facts. */
export default function HomeHero({ t, event }: HomeHeroProps) {
  return (
    <section className={styles.hero} aria-labelledby="home-featured">
      <div className={`${styles.art} ${styles.rise}`} style={{ '--i': 0 } as CSSProperties}>
        <Poster
          tone="blue"
          size="hero"
          title={event.name}
          kicker={t('home_presents')}
          subtitle={event.subtitle}
          imageUrl={event.imageUrl}
          meta={{ date: event.posterDate, place: event.posterPlace }}
          titleAs="h1"
          titleId="home-featured"
        />
      </div>
      <div className={styles.info}>
        <div className={styles.rise} style={{ '--i': 1 } as CSSProperties}>
          <Stamp tone={event.stamp.tone}>{event.stamp.label}</Stamp>
        </div>
        <p className={`${styles.title} ${styles.rise}`} style={{ '--i': 2 } as CSSProperties} aria-hidden="true">
          {event.name}
          {event.subtitle && <span className={styles.sub}>{event.subtitle}</span>}
        </p>
        <dl className={`${styles.facts} ${styles.rise}`} style={{ '--i': 3 } as CSSProperties}>
          <div className={styles.fact}>
            <dt>{t('home_fact_date')}</dt>
            <dd>{event.dateLine}</dd>
          </div>
          <div className={styles.fact}>
            <dt>{t('home_fact_venue')}</dt>
            <dd>{event.venueLine}</dd>
          </div>
          {(event.price || event.outcome) && (
            <div className={styles.fact}>
              <dt>{t('home_fact_price')}</dt>
              <dd>
                {event.price ? (
                  <>
                    {event.price.label} <b className={styles.amount}>{event.price.amount}</b>
                  </>
                ) : (
                  event.outcome
                )}
              </dd>
            </div>
          )}
        </dl>
        {event.note && (
          <p className={`${styles.note} ${styles.rise}`} style={{ '--i': 4 } as CSSProperties}>
            {event.note.lead} {event.note.strong && <b>{event.note.strong}</b>}
            {event.note.detail && <span className={styles.detail}>{event.note.detail}</span>}
          </p>
        )}
      </div>
    </section>
  );
}
