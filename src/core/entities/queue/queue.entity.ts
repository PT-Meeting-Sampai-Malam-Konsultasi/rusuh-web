// Queue types, matching rusuh-documentation/api/openapi.yaml (QueueState, QueuePlace, registerDevice).

/** `preopen`: numbers are drawn at opening; `paused`: nothing sellable but holds remain; `closed`: sold out. */
export type QueueState = 'preopen' | 'open' | 'paused' | 'closed';

export interface QueuePlace {
  eventId: string;
  state: QueueState;
  /** Null while waiting for the pre-sale draw. */
  seq: number | null;
  /** Served at the time of this answer; the first one seen is "Saat Anda bergabung" on the progress track. */
  served?: number;
  /** When numbers are handed out (sale opening): the pre-queue countdown. */
  opensAt?: string;
  /** Set once `seq <= served`: claim before this or the turn is missed (FR-08). */
  turnExpiresAt?: string | null;
  serverNow: string;
  queueToken: string;
  accountAttached?: boolean;
}

export interface DeviceRegistration {
  /** EdDSA-signed `device+jwt`, 30 days (api/tokens.md). */
  deviceToken: string;
  expiresAt: string;
}
