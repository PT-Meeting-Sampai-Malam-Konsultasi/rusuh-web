import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Frontier } from '@core/entities/queue/queue.entity';

import { applyFrontier, FollowQueueUseCase, pollDelayMs } from '../follow-queue.use-case';
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
    expect(pollDelayMs(position, 0.5)).toBe(base);
  });

  it('keeps the jitter within ±20%', () => {
    expect(pollDelayMs(5000, 0)).toBe(4000);
    expect(pollDelayMs(5000, 1)).toBe(6000);
  });

  it('backs off after failures in a row, up to a minute, and keeps the jitter', () => {
    expect(pollDelayMs(5000, 0.5, 1)).toBe(10_000);
    expect(pollDelayMs(5000, 0.5, 2)).toBe(20_000);
    expect(pollDelayMs(5000, 0.5, 6)).toBe(60_000);
    expect(pollDelayMs(5000, 0, 6)).toBe(48_000);
    expect(pollDelayMs(500, 0.5, 1)).toBe(4000);
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
  const deps = {
    queueService: {
      joinQueue: vi.fn(),
      getFrontier: vi.fn(),
      claimTurn: vi.fn(),
      getMyPlace: vi.fn(),
      leaveQueue: vi.fn(),
    },
  };
  const useCase = FollowQueueUseCase(deps);
  beforeEach(() => {
    vi.clearAllMocks();
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
});
