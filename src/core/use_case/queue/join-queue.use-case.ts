import type { QueuePlace, QueueState } from '@core/entities/queue/queue.entity';
import { errorCodeOf, withDeviceToken } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

import { positionOf, progressOf } from './place';

/** The place as the waiting room needs it. */
export interface JoinedPlace {
  eventId: string;
  state: QueueState;
  /** Null while waiting for the pre-sale draw. */
  seq: number | null;
  served: number | null;
  /** First `served` seen for this `seq`: the start of the progress track. */
  joinedServed: number | null;
  /** `seq − served`, at least 1 (the turn itself is FR-08); null before the draw. */
  position: number | null;
  /** 0–100: how far the line moved from `joinedServed` towards `seq`. */
  progress: number;
  opensAt: string | null;
  turnExpiresAt: string | null;
  serverNow: string;
}

export type JoinQueueResult =
  /** `resumed`: read back with the stored tokens (refresh, new tab), not joined again (FR-10). */
  | { kind: 'joined'; place: JoinedPlace; resumed: boolean }
  /** 410 QUEUE_CLOSED: sold out, nobody waits for nothing (W-7). */
  | { kind: 'sold-out' }
  | { kind: 'not-found' }
  /** 409: a signed-in account already holds a place on another device (Q-51). */
  | { kind: 'elsewhere' }
  /** 410 MISSED or EXPIRED on resume: the turn passed; say so instead of handing out a new number. */
  | { kind: 'missed' };

export interface JoinQueueOptions {
  /** "Antre lagi": forget the stored place and join at the back. */
  rejoin?: boolean;
}

export interface JoinQueueUseCaseInterface {
  execute: (eventId: string, options?: JoinQueueOptions) => Promise<JoinQueueResult>;
}

type Deps = Pick<
  AwilixRegistry,
  'deviceService' | 'queueService' | 'deviceTokenStore' | 'queuePlaceStore' | 'turnstile'
>;

const OUTCOMES: Readonly<Record<string, JoinQueueResult['kind']>> = {
  QUEUE_CLOSED: 'sold-out',
  NOT_FOUND: 'not-found',
  ACCOUNT_HAS_PLACE_ELSEWHERE: 'elsewhere',
};

/** Resuming: the place is gone (410), so say why; 401 / 404 mean "join instead". */
const GONE_ON_RESUME: Readonly<Record<string, JoinQueueResult['kind']>> = {
  MISSED: 'missed',
  EXPIRED: 'missed',
  MOVED: 'elsewhere',
  QUEUE_CLOSED: 'sold-out',
};
const JOIN_INSTEAD = new Set(['UNAUTHORIZED', 'NOT_FOUND']);

/**
 * FR-04: device token (Turnstile + registerDevice, once per browser), then joinQueue with a fresh Turnstile token.
 * A rejected device token (401) is replaced once. The place is kept per event for the later queue calls, and FR-10
 * reads it back with those tokens on a refresh or a new tab before joining again.
 */
export const JoinQueueUseCase = ({
  deviceService,
  queueService,
  deviceTokenStore,
  queuePlaceStore,
  turnstile,
}: Deps): JoinQueueUseCaseInterface => {
  const joinWithDevice = (eventId: string): Promise<QueuePlace> =>
    withDeviceToken({ deviceService, deviceTokenStore, turnstile }, async (deviceToken) => {
      const { data } = await queueService.joinQueue(eventId, deviceToken, await turnstile.getToken('join'));
      return data;
    });

  /** FR-10: read the place back with the stored tokens (no Turnstile, no write); null means "join". */
  const resume = async (eventId: string): Promise<QueuePlace | JoinQueueResult | null> => {
    const deviceToken = deviceTokenStore.get();
    const queueToken = queuePlaceStore.get(eventId)?.queueToken;
    if (!deviceToken || !queueToken) return null;
    try {
      const { data } = await queueService.getMyPlace(eventId, deviceToken, queueToken);
      return data;
    } catch (error) {
      const code = errorCodeOf(error) ?? '';
      if (JOIN_INSTEAD.has(code)) return null;
      const kind = GONE_ON_RESUME[code];
      if (!kind) throw error;
      queuePlaceStore.remove(eventId);
      return { kind } as JoinQueueResult;
    }
  };

  return {
    execute: async (eventId, { rejoin = false } = {}) => {
      if (rejoin) queuePlaceStore.remove(eventId);
      const resumed = await resume(eventId);
      if (resumed && 'kind' in resumed) return resumed;

      let place: QueuePlace;
      if (resumed) {
        place = resumed;
      } else {
        try {
          place = await joinWithDevice(eventId);
        } catch (error) {
          const kind = OUTCOMES[errorCodeOf(error) ?? ''];
          if (!kind) throw error;
          if (kind === 'sold-out') queuePlaceStore.remove(eventId);
          return { kind } as JoinQueueResult;
        }
      }

      const served = place.served ?? null;
      const previous = queuePlaceStore.get(eventId);
      const joinedServed =
        previous && previous.seq !== null && previous.seq === place.seq ? previous.joinedServed : served;
      queuePlaceStore.set(eventId, { queueToken: place.queueToken, seq: place.seq, joinedServed });

      return {
        kind: 'joined',
        resumed: !!resumed,
        place: {
          eventId: place.eventId,
          state: place.state,
          seq: place.seq,
          served,
          joinedServed,
          position: positionOf(place.seq, served),
          progress: progressOf(place.seq, served, joinedServed),
          opensAt: place.opensAt ?? null,
          turnExpiresAt: place.turnExpiresAt ?? null,
          serverNow: place.serverNow,
        },
      };
    },
  };
};
