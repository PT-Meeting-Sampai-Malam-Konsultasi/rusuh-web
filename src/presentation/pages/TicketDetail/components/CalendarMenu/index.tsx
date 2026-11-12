import type { TFunction } from 'i18next';

import type { CalendarMenu as CalendarMenuData } from '@controllers/ticket-detail.controller';
import button from '@presentation/components/Button/button.module.css';

import styles from './calendar-menu.module.css';

interface CalendarMenuProps {
  t: TFunction;
  calendar: CalendarMenuData;
}

/** "Tambah ke kalender": a native disclosure (keyboard and screen readers for free) with the three ways to add it. */
export default function CalendarMenu({ t, calendar }: CalendarMenuProps) {
  return (
    <details className={styles.menu}>
      <summary className={`${button.button} ${button.secondary} ${button.full} ${styles.summary}`}>
        {t('ticket_calendar')}
      </summary>
      <ul className={styles.options}>
        <li>
          <a
            href={calendar.googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => calendar.onPick('google')}
          >
            {t('ticket_calendar_google')} <span aria-hidden="true">↗</span>
          </a>
        </li>
        <li>
          <a
            href={calendar.outlookUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => calendar.onPick('outlook')}
          >
            {t('ticket_calendar_outlook')} <span aria-hidden="true">↗</span>
          </a>
        </li>
        <li>
          <button type="button" onClick={calendar.downloadIcs}>
            {t('ticket_calendar_ics')} <span aria-hidden="true">↓</span>
          </button>
        </li>
      </ul>
    </details>
  );
}
