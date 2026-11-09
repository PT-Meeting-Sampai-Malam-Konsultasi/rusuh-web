import type { Frontier, QueueState, QueueTurn } from '@core/entities/queue/queue.entity';
import type { QueueStreamFallbackReason } from '@core/protocols/queue-stream.protocol';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

import type { JoinedPlace } from './join-queue.use-case';
import { positionOf, progressOf } from './place';

export type FrontierResult = { kind: 'frontier'; frontier: Frontier } | { kind: 'not-found' };

export interface FollowQueueHandlers {
  onFrontier(frontier: Frontier): void;
  onTurn(turn: QueueTurn): void;
  /** The stream can't be used: poll, and try again after `streamRetryDelayMs`. */
  onFallback(reason: QueueStreamFallbackReason): void;
  /** The server ended the stream (10-minute lifetime, or the queue closed). */
  onClose(): void;
}

export interface FollowQueueUseCaseInterface {
  /** One frontier read, for polling. */
  poll: (eventId: string) => Promise<FrontierResult>;
  /** Opens the stream with this device's tokens and returns its close function; null without both tokens. */
  stream: (eventId: string, handlers: FollowQueueHandlers) => (() => void) | null;
}

/** The joined place with the newest frontier applied. */
export interface LivePlace extends JoinedPlace {
  /** `seq <= served`: claim now (FR-08). */
  turnReached: boolean;
}

type Deps = Pick<AwilixRegistry, 'queueService' | 'queueStream' | 'deviceTokenStore' | 'queuePlaceStore'>;

const SECOND = 1000;
/** ADR-0003 tiers: [places back at most, poll every]. Further back than the last tier: 10 s. */
const POLL_TIERS: ReadonlyArray<readonly [number, number]> = [
  [1_000, 2 * SECOND],
  [10_000, 5 * SECOND],
];
const POLL_FAR_MS = 10 * SECOND;
const JITTER = 0.2;
/** The server's `retry: 3000`. */
const STREAM_RETRY_MS = 3 * SECOND;
/** After the stream proved unusable: poll, then try it again (ADR-0015). */
const STREAM_BACKOFF_MS = 60 * SECOND;
const QUEUE_STATES: ReadonlySet<string> = new Set<QueueState>(['preopen', 'open', 'paused', 'closed']);

/** How long until the next poll: by distance from the front, ±20% so devices don't poll in step. */
export function pollDelayMs(position: number | null, random: number, fellBack: boolean): number {
  const tier = position === null ? undefined : POLL_TIERS.find(([upTo]) => position <= upTo);
  const base = Math.min(tier?.[1] ?? POLL_FAR_MS, fellBack ? 2 * SECOND : Infinity);
  return Math.round(base * (1 - JITTER + 2 * JITTER * random));
}

/** Near enough the front to stream; `streamFrom` 0 or absent turns streaming off. */
export function canStream(position: number | null, streamFrom: number | undefined): boolean {
  return position !== null && position > 0 && !!streamFrom && position <= streamFrom;
}

/** When to try the stream again: once at once on a failed connect, otherwise after a minute of polling. */
export function streamRetryDelayMs(event: QueueStreamFallbackReason | 'closed', connectFailuresInRow: number): number {
  if (event === 'closed') return STREAM_RETRY_MS;
  if (event === 'connect_failed' && connectFailuresInRow < 2) return STREAM_RETRY_MS;
  return STREAM_BACKOFF_MS;
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

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function asFrontier(data: unknown): Frontier | null {
  if (!isObject(data)) return null;
  const { event, state, served, ts } = data;
  const valid =
    typeof event === 'string' &&
    typeof state === 'string' &&
    QUEUE_STATES.has(state) &&
    typeof served === 'number' &&
    typeof ts === 'number';
  return valid ? (data as unknown as Frontier) : null;
}

function asTurn(data: unknown): QueueTurn | null {
  if (!isObject(data)) return null;
  const { seq, served, turnExpiresAt, serverNow } = data;
  const valid =
    typeof seq === 'number' &&
    typeof served === 'number' &&
    typeof turnExpiresAt === 'string' &&
    typeof serverNow === 'string';
  return valid ? (data as unknown as QueueTurn) : null;
}

/** FR-07: follow the line after the join, by polling the frontier and, near the front, by the stream (ADR-0015). */
export const FollowQueueUseCase = ({
  queueService,
  queueStream,
  deviceTokenStore,
  queuePlaceStore,
}: Deps): FollowQueueUseCaseInterface => ({
  poll: async (eventId) => {
    try {
      const { data } = await queueService.getFrontier(eventId);
      return { kind: 'frontier', frontier: data };
    } catch (error) {
      if (errorCodeOf(error) === 'NOT_FOUND') return { kind: 'not-found' };
      throw error;
    }
  },

  stream: (eventId, handlers) => {
    const deviceToken = deviceTokenStore.get();
    const queueToken = queuePlaceStore.get(eventId)?.queueToken;
    if (!deviceToken || !queueToken) return null;
    return queueStream.open(
      eventId,
      { deviceToken, queueToken },
      {
        onFrontier: (data) => {
          const frontier = asFrontier(data);
          if (frontier) handlers.onFrontier(frontier);
        },
        onTurn: (data) => {
          const turn = asTurn(data);
          if (turn) handlers.onTurn(turn);
        },
        onFallback: (reason) => handlers.onFallback(reason),
        onClose: () => handlers.onClose(),
      },
    );
  },
});
