import type { TFunction } from 'i18next';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';
import type { JoinQueueResult } from '@core/use_case/queue/join-queue.use-case';

export type QueueStatus =
  | 'no-event'
  | 'joining'
  | 'waiting'
  | 'prequeue'
  | 'paused'
  | 'sold-out'
  | 'not-found'
  | 'elsewhere'
  | 'error'
  /** FR-08: `seq <= served`; the controller sets these, not the join answer. */
  | 'turn'
  | 'missed'
  /** FR-05: no queue at all; on the way to the order page. */
  | 'entering';

/** Which waiting room view to show for the join answer (App Flow 4.2). */
export function queueStatusFor(hasEventId: boolean, result: JoinQueueResult | undefined, failed: boolean): QueueStatus {
  if (!hasEventId) return 'no-event';
  if (result?.kind && result.kind !== 'joined') return result.kind;
  if (!result) return failed ? 'error' : 'joining';
  const { state, seq } = result.place;
  if (state === 'closed') return 'sold-out';
  if (state === 'paused') return 'paused';
  if (state === 'preopen' || seq === null) return 'prequeue';
  return 'waiting';
}

/** The event from the Home list (featured or not), or null when it isn't listed. */
export function findHomeEvent(data: HomeEvents | undefined, eventId: string): EventSummary | null {
  if (!data) return null;
  return [data.featured, ...data.others].find((event) => event?.eventId === eventId) ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "8:42", "3:08:42", or "7 hari 21 jam" when a day or more is left. A clock: whole units, rounded down. */
export function formatCountdown(seconds: number, t: TFunction): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return t('queue_countdown_days', { days, hours });
  const s = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(s)}` : `${minutes}:${pad(s)}`;
}
