import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Frontier } from '@core/entities/queue/queue.entity';
import type { QueueStreamHandlers } from '@core/protocols/queue-stream.protocol';

import {
  applyFrontier,
  canStream,
  FollowQueueUseCase,
  pollDelayMs,
  streamRetryDelayMs,
  type FollowQueueHandlers,
} from '../follow-queue.use-case';
import type { JoinedPlace } from '../join-queue.use-case';

const PLACE: JoinedPlace = {
  eventId: 'evt_pelita',
  state: 'open',
  seq: 19700,
  served: 18452,
  joinedServed: 18452,
  position: 1248,
  progress: 0,
  opensAt: null,
  turnExpiresAt: null,
  serverNow: '2026-11-09T03:00:00Z',
};

const frontier = (patch: Partial<Frontier> = {}): Frontier => ({
  event: 'evt_pelita',
  state: 'open',
  served: 18452,
  ts: 1794625200,
  ...patch,
});

describe('pollDelayMs', () => {
  it.each([
    [500, 2000],
    [1000, 2000],
    [1001, 5000],
    [10_000, 5000],
    [10_001, 10_000],
    [null, 10_000],
  ])('polls a device %s back every %s ms at the middle of the jitter', (position, base) => {
    expect(pollDelayMs(position, 0.5, false)).toBe(base);
  });

  it('keeps the jitter within ±20%', () => {
    expect(pollDelayMs(5000, 0, false)).toBe(4000);
    expect(pollDelayMs(5000, 1, false)).toBe(6000);
  });

  it('backs off after failures in a row, up to a minute, and keeps the jitter', () => {
    expect(pollDelayMs(5000, 0.5, false, 1)).toBe(10_000);
    expect(pollDelayMs(5000, 0.5, false, 2)).toBe(20_000);
    expect(pollDelayMs(5000, 0.5, false, 6)).toBe(60_000);
    expect(pollDelayMs(5000, 0, false, 6)).toBe(48_000);
    expect(pollDelayMs(500, 0.5, true, 1)).toBe(4000);
  });

  it('polls at most every 2 s after the stream fell back', () => {
    expect(pollDelayMs(1500, 0.5, true)).toBe(2000);
    expect(pollDelayMs(null, 1, true)).toBe(2400);
  });
});

describe('canStream', () => {
  it.each([
    [2000, 2000, true],
    [1, 2000, true],
    [2001, 2000, false],
    [500, 0, false],
    [500, undefined, false],
    [null, 2000, false],
  ])('position %s with streamFrom %s → %s', (position, streamFrom, expected) => {
    expect(canStream(position, streamFrom)).toBe(expected);
  });
});

describe('streamRetryDelayMs', () => {
  it('retries a first failed connect and a closed stream after 3 s', () => {
    expect(streamRetryDelayMs('connect_failed', 1)).toBe(3000);
    expect(streamRetryDelayMs('closed', 5)).toBe(3000);
  });

  it('polls for a minute after a second failed connect, a slow first event or silence', () => {
    expect(streamRetryDelayMs('connect_failed', 2)).toBe(60_000);
    expect(streamRetryDelayMs('slow_first_event', 0)).toBe(60_000);
    expect(streamRetryDelayMs('silent', 0)).toBe(60_000);
  });
});

describe('applyFrontier', () => {
  it('moves the position and the track with the frontier', () => {
    expect(applyFrontier(PLACE, frontier({ served: 18952 }))).toMatchObject({
      served: 18952,
      position: 748,
      progress: 40.1,
      turnReached: false,
    });
  });

  it('never moves the buyer back on an older frontier', () => {
    const moved = { ...PLACE, served: 19000 };
    expect(applyFrontier(moved, frontier({ served: 18900 })).served).toBe(19000);
  });

  it('takes the state from the frontier, but keeps a pre-queue place for the draw', () => {
    expect(applyFrontier(PLACE, frontier({ state: 'paused', reason: 'stock' })).state).toBe('paused');
    expect(applyFrontier(PLACE, frontier({ state: 'closed' })).state).toBe('closed');
    const pre = { ...PLACE, state: 'preopen' as const, seq: null, served: null, position: null };
    expect(applyFrontier(pre, frontier())).toMatchObject({ state: 'preopen', position: null, turnReached: false });
  });

  it('reaches the turn when served passes seq', () => {
    expect(applyFrontier(PLACE, frontier({ served: 19700 }))).toMatchObject({
      position: 1,
      progress: 100,
      turnReached: true,
    });
  });

  it('keeps the place as it is without a frontier', () => {
    expect(applyFrontier(PLACE, null)).toEqual({ ...PLACE, turnReached: false });
  });
});

describe('FollowQueueUseCase', () => {
  let streamHandlers: QueueStreamHandlers | undefined;
  const close = vi.fn();
  const deps = {
    queueService: {
      joinQueue: vi.fn(),
      getFrontier: vi.fn(),
      claimTurn: vi.fn(),
      getMyPlace: vi.fn(),
      leaveQueue: vi.fn(),
    },
    queueStream: {
      open: vi.fn((_id: string, _tokens: unknown, handlers: QueueStreamHandlers) => {
        streamHandlers = handlers;
        return close;
      }),
    },
    deviceTokenStore: { get: vi.fn((): string | null => 'device'), set: vi.fn(), clear: vi.fn() },
    queuePlaceStore: {
      get: vi.fn(() => ({ queueToken: 'queue', seq: 19700, joinedServed: 18452 })),
      set: vi.fn(),
      remove: vi.fn(),
    },
  };
  const useCase = FollowQueueUseCase(deps);
  const handlers = (): FollowQueueHandlers => ({
    onFrontier: vi.fn(),
    onTurn: vi.fn(),
    onFallback: vi.fn(),
    onClose: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    streamHandlers = undefined;
  });

  it('polls the frontier', async () => {
    deps.queueService.getFrontier.mockResolvedValue({ data: frontier(), status: 200 });
    await expect(useCase.poll('evt_pelita')).resolves.toEqual({ kind: 'frontier', frontier: frontier() });
    expect(deps.queueService.getFrontier).toHaveBeenCalledWith('evt_pelita');
  });

  it('answers not-found for 404 and lets other errors through', async () => {
    deps.queueService.getFrontier.mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND' });
    await expect(useCase.poll('evt_pelita')).resolves.toEqual({ kind: 'not-found' });
    const error = { status: 503, code: 'INTERNAL_ERROR' };
    deps.queueService.getFrontier.mockRejectedValueOnce(error);
    await expect(useCase.poll('evt_pelita')).rejects.toBe(error);
  });

  it('streams with the device and queue tokens, passing on valid payloads only', () => {
    const h = handlers();
    expect(useCase.stream('evt_pelita', h)).toBe(close);
    expect(deps.queueStream.open).toHaveBeenCalledWith(
      'evt_pelita',
      { deviceToken: 'device', queueToken: 'queue' },
      expect.any(Object),
    );
    streamHandlers?.onFrontier(frontier({ served: 19000 }));
    streamHandlers?.onFrontier({ event: 'evt_pelita', state: 'weird', served: 1, ts: 1 });
    streamHandlers?.onFrontier('nope');
    expect(h.onFrontier).toHaveBeenCalledExactlyOnceWith(frontier({ served: 19000 }));

    const turn = { event: 'evt_pelita', seq: 19700, served: 19700, turnExpiresAt: 'a', serverNow: 'b' };
    streamHandlers?.onTurn(turn);
    streamHandlers?.onTurn({ seq: '19700' });
    expect(h.onTurn).toHaveBeenCalledExactlyOnceWith(turn);

    streamHandlers?.onFallback('silent');
    streamHandlers?.onClose?.();
    expect(h.onFallback).toHaveBeenCalledWith('silent');
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it('does not stream without both tokens', () => {
    deps.deviceTokenStore.get.mockReturnValueOnce(null);
    expect(useCase.stream('evt_pelita', handlers())).toBeNull();
    deps.queuePlaceStore.get.mockReturnValueOnce(null as never);
    expect(useCase.stream('evt_pelita', handlers())).toBeNull();
    expect(deps.queueStream.open).not.toHaveBeenCalled();
  });
});
