import type { TFunction } from 'i18next';

import type { TicketStub as TicketStubData } from '@controllers/ticket-detail.controller';
import Poster from '@presentation/components/Poster';
import QrCode from '@presentation/components/QrCode';

import styles from './ticket-stub.module.css';

interface TicketStubProps {
  t: TFunction;
  stub: TicketStubData;
}

/** One e-ticket: poster end, who and where, and the QR with its code behind a perforation. */
export default function TicketStub({ t, stub }: TicketStubProps) {
  return (
    <article className={styles.stub} aria-label={stub.label}>
      <div className={styles.poster}>
        <Poster
          tone={stub.posterTone}
          size="stub"
          title={stub.posterTitle}
          kicker={stub.label}
          subtitle={stub.category}
        />
      </div>
      <dl className={styles.details}>
        <div className={styles.holder}>
          <dt>{t('ticket_holder')}</dt>
          <dd>
            {stub.holder}
            <small>NIK {stub.nikMasked}</small>
          </dd>
        </div>
        {stub.entry && (
          <div>
            <dt>{t('ticket_entry')}</dt>
            <dd>{stub.entry}</dd>
          </div>
        )}
        {stub.doorsOpen && (
          <div>
            <dt>{t('ticket_doors')}</dt>
            <dd>{stub.doorsOpen}</dd>
          </div>
        )}
      </dl>
      <div className={styles.code}>
        <QrCode modules={stub.qr} label={stub.qrLabel} />
        {stub.code && <span>{stub.code}</span>}
      </div>
      <p className={styles.printNote}>{t('ticket_print_note')}</p>
    </article>
  );
}
