import type { QueuePlace, QueueState } from '@core/entities/queue/queue.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

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
  | { kind: 'joined'; place: JoinedPlace }
  /** 410 QUEUE_CLOSED: sold out, nobody waits for nothing (W-7). */
  | { kind: 'sold-out' }
  | { kind: 'not-found' }
  /** 409: a signed-in account already holds a place on another device (Q-51). */
  | { kind: 'elsewhere' };

export interface JoinQueueUseCaseInterface {
  execute: (eventId: string) => Promise<JoinQueueResult>;
}

type Deps = Pick<
  AwilixRegistry,
  'deviceService' | 'queueService' | 'deviceTokenStore' | 'queuePlaceStore' | 'turnstile'
>;

const codeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null ? (error as HttpError).code : undefined;

function positionOf(seq: number | null, served: number | null): number | null {
  return seq !== null && served !== null ? Math.max(1, seq - served) : null;
}

function progressOf(seq: number | null, served: number | null, joinedServed: number | null): number {
  if (seq === null || served === null) return 0;
  const start = joinedServed ?? served;
  const span = seq - start;
  if (span <= 0) return 0;
  const percent = Math.min(100, Math.max(0, ((served - start) / span) * 100));
  return Math.round(percent * 10) / 10;
}

const OUTCOMES: Readonly<Record<string, JoinQueueResult['kind']>> = {
  QUEUE_CLOSED: 'sold-out',
  NOT_FOUND: 'not-found',
  ACCOUNT_HAS_PLACE_ELSEWHERE: 'elsewhere',
};

/**
 * FR-04: device token (Turnstile + registerDevice, once per browser), then joinQueue with a fresh Turnstile token.
 * A rejected device token (401) is replaced once. The place is kept per event for the later queue calls.
 */
export const JoinQueueUseCase = ({
  deviceService,
  queueService,
  deviceTokenStore,
  queuePlaceStore,
  turnstile,
}: Deps): JoinQueueUseCaseInterface => {
  const registerDevice = async (): Promise<string> => {
    const { data } = await deviceService.registerDevice(await turnstile.getToken('register'));
    deviceTokenStore.set(data.deviceToken);
    return data.deviceToken;
  };

  const join = async (eventId: string, deviceToken: string): Promise<QueuePlace> =>
    (await queueService.joinQueue(eventId, deviceToken, await turnstile.getToken('join'))).data;

  const joinWithDevice = async (eventId: string): Promise<QueuePlace> => {
    const stored = deviceTokenStore.get();
    const deviceToken = stored ?? (await registerDevice());
    try {
      return await join(eventId, deviceToken);
    } catch (error) {
      // A token we just registered and still rejected is not retried: that is a real failure.
      if (codeOf(error) !== 'UNAUTHORIZED' || !stored) throw error;
      deviceTokenStore.clear();
      return join(eventId, await registerDevice());
    }
  };

  return {
    execute: async (eventId) => {
      let place: QueuePlace;
      try {
        place = await joinWithDevice(eventId);
      } catch (error) {
        const kind = OUTCOMES[codeOf(error) ?? ''];
        if (!kind) throw error;
        if (kind === 'sold-out') queuePlaceStore.remove(eventId);
        return { kind } as JoinQueueResult;
      }

      const served = place.served ?? null;
      const previous = queuePlaceStore.get(eventId);
      const joinedServed =
        previous && previous.seq !== null && previous.seq === place.seq ? previous.joinedServed : served;
      queuePlaceStore.set(eventId, { queueToken: place.queueToken, seq: place.seq, joinedServed });

      return {
        kind: 'joined',
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
