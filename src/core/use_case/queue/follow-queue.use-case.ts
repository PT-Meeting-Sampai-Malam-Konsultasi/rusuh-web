import type { Frontier } from '@core/entities/queue/queue.entity';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

import type { JoinedPlace } from './join-queue.use-case';
import { positionOf, progressOf } from './place';

export type FrontierResult = { kind: 'frontier'; frontier: Frontier } | { kind: 'not-found' };

export interface FollowQueueUseCaseInterface {
  /** One frontier read, for polling. */
  poll: (eventId: string) => Promise<FrontierResult>;
}

/** The joined place with the newest frontier applied. */
export interface LivePlace extends JoinedPlace {
  /** `seq <= served`: claim now (FR-08). */
  turnReached: boolean;
}

type Deps = Pick<AwilixRegistry, 'queueService'>;

const SECOND = 1000;
/** ADR-0003 tiers: [places back at most, poll every]. Further back than the last tier: 10 s. */
const POLL_TIERS: ReadonlyArray<readonly [number, number]> = [
  [1_000, 2 * SECOND],
  [10_000, 5 * SECOND],
];
const POLL_FAR_MS = 10 * SECOND;
/** Failing polls back off up to this (NFR-01): a struggling server is not hit harder by every device. */
const POLL_BACKOFF_MAX_MS = 60 * SECOND;
const JITTER = 0.2;

/**
 * How long until the next poll: by distance from the front, ±20% so devices don't poll in step. After `failures` polls
 * in a row failed, the wait doubles per failure up to 60 s (NFR-01 "retry with backoff").
 */
export function pollDelayMs(position: number | null, random: number, failures = 0): number {
  const tier = position === null ? undefined : POLL_TIERS.find(([upTo]) => position <= upTo);
  const normal = tier?.[1] ?? POLL_FAR_MS;
  const base = failures > 0 ? Math.min(POLL_BACKOFF_MAX_MS, normal * 2 ** failures) : normal;
  return Math.round(base * (1 - JITTER + 2 * JITTER * random));
}

/** Moves the place with a frontier. `served` never goes back (a CDN-cached or late frontier), and the draw stays a join. */
export function applyFrontier(place: JoinedPlace, frontier: Frontier | null): LivePlace {
  const served =
    frontier && place.served !== null ? Math.max(place.served, frontier.served) : (frontier?.served ?? place.served);
  const state = frontier && place.state !== 'preopen' ? frontier.state : place.state;
  return {
    ...place,
    state,
    served,
    position: positionOf(place.seq, served),
    progress: progressOf(place.seq, served, place.joinedServed),
    turnReached: place.seq !== null && served !== null && served >= place.seq,
  };
}

/** FR-07: follow the line after the join by polling the frontier (no stream: SSE dropped on 13 Nov 2026). */
export const FollowQueueUseCase = ({ queueService }: Deps): FollowQueueUseCaseInterface => ({
  poll: async (eventId) => {
    try {
      const { data } = await queueService.getFrontier(eventId);
      return { kind: 'frontier', frontier: data };
    } catch (error) {
      if (errorCodeOf(error) === 'NOT_FOUND') return { kind: 'not-found' };
      throw error;
    }
  },
});
