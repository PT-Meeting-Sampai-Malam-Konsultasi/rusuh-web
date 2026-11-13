// Queue types, matching the API contract (QueueState, QueuePlace, Frontier, registerDevice).

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

/** Why the queue is `paused` or `closed` (absent otherwise). */
export type QueuePauseReason = 'stock' | 'operator' | 'sold_out' | 'cancelled' | 'ended';

/** `getFrontier`: the same public snapshot for every device. */
export interface Frontier {
  event: string;
  state: QueueState;
  served: number;
  /** Units not yet reserved or held. */
  sellable?: number;
  reserved?: number;
  held?: number;
  /** People let in per minute ("450 orang masuk / menit"); 0 hides the estimate. */
  ratePerMin?: number;
  /** Slow end of the speed: the upper end of the wait range (FR-09). */
  rateLow?: number;
  /** Fast end of the speed: the lower end of the wait range (FR-09). */
  rateHigh?: number;
  rateSource?: 'prior' | 'measured';
  /** ADR-0015 stream threshold. Not used: the web follows the queue by polling only (SSE dropped, 13 Nov 2026). */
  streamFrom?: number;
  reason?: QueuePauseReason;
  /** Sale opening, Unix seconds. */
  opensAt?: number;
  /** Server time of the snapshot, Unix seconds. */
  ts: number;
}

/** `claimTurn`: the admission for the order page (ADR-0021). */
export interface Admission {
  /** Opaque; sent as `X-Admission-Token` on the order calls. */
  admissionToken: string;
  slotId: string;
  /** 1–3 (ADR-0024). */
  maxTickets: number;
  /** End of the 16-minute admission TTL: 60 s claim + 5 min order + 10 min payment. */
  expiresAt: string;
  serverNow: string;
}

export interface DeviceRegistration {
  /** EdDSA-signed `device+jwt`, 30 days (api/tokens.md). */
  deviceToken: string;
  expiresAt: string;
}
