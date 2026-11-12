import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueuePlace } from '@core/entities/queue/queue.entity';
import type { StoredQueuePlace } from '@core/protocols/queue-place-store.protocol';

import { JoinQueueUseCase } from '../join-queue.use-case';

const PLACE: QueuePlace = {
  eventId: 'evt_pelita',
  state: 'open',
  seq: 19700,
  served: 18452,
  serverNow: '2026-11-09T03:00:00Z',
  queueToken: 'queue-token',
};

const problem = (status: number, code: string) => ({ status, code, message: code });

function setup({ deviceToken = 'device-old' as string | null, stored = null as StoredQueuePlace | null } = {}) {
  let device = deviceToken;
  const places = new Map<string, StoredQueuePlace>(stored ? [['evt_pelita', stored]] : []);
  const deps = {
    deviceService: {
      registerDevice: vi.fn().mockResolvedValue({
        data: { deviceToken: 'device-new', expiresAt: '2026-12-09T03:00:00Z' },
        status: 201,
      }),
    },
    queueService: {
      joinQueue: vi.fn().mockResolvedValue({ data: PLACE, status: 200 }),
      getFrontier: vi.fn(),
      claimTurn: vi.fn(),
      // No place on the server unless a test says so: the use case joins.
      getMyPlace: vi.fn().mockRejectedValue(problem(404, 'NOT_FOUND')),
      leaveQueue: vi.fn(),
    },
    deviceTokenStore: {
      get: vi.fn(() => device),
      set: vi.fn((token: string) => {
        device = token;
      }),
      clear: vi.fn(() => {
        device = null;
      }),
    },
    queuePlaceStore: {
      get: vi.fn((id: string) => places.get(id) ?? null),
      set: vi.fn((id: string, place: StoredQueuePlace) => places.set(id, place)),
      remove: vi.fn((id: string) => places.delete(id)),
    },
    turnstile: { getToken: vi.fn((action: string) => Promise.resolve(`ts-${action}`)) },
  };
  return { deps, places, useCase: JoinQueueUseCase(deps) };
}

describe('JoinQueueUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('joins with the stored device token and a fresh Turnstile token, and keeps the place', async () => {
    const { deps, places, useCase } = setup();
    await expect(useCase.execute('evt_pelita')).resolves.toEqual({
      kind: 'joined',
      resumed: false,
      place: {
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
      },
    });
    expect(deps.deviceService.registerDevice).not.toHaveBeenCalled();
    expect(deps.queueService.joinQueue).toHaveBeenCalledWith('evt_pelita', 'device-old', 'ts-join');
    expect(places.get('evt_pelita')).toEqual({ queueToken: 'queue-token', seq: 19700, joinedServed: 18452 });
  });

  it('registers the browser first when it has no device token', async () => {
    const { deps, useCase } = setup({ deviceToken: null });
    await useCase.execute('evt_pelita');
    expect(deps.turnstile.getToken).toHaveBeenNthCalledWith(1, 'register');
    expect(deps.deviceService.registerDevice).toHaveBeenCalledWith('ts-register');
    expect(deps.deviceTokenStore.set).toHaveBeenCalledWith('device-new');
    expect(deps.queueService.joinQueue).toHaveBeenCalledWith('evt_pelita', 'device-new', 'ts-join');
  });

  it('replaces a rejected device token once', async () => {
    const { deps, useCase } = setup();
    deps.queueService.joinQueue.mockRejectedValueOnce(problem(401, 'UNAUTHORIZED'));
    await expect(useCase.execute('evt_pelita')).resolves.toMatchObject({ kind: 'joined' });
    expect(deps.deviceTokenStore.clear).toHaveBeenCalledTimes(1);
    expect(deps.deviceService.registerDevice).toHaveBeenCalledTimes(1);
    expect(deps.queueService.joinQueue).toHaveBeenLastCalledWith('evt_pelita', 'device-new', 'ts-join');
  });

  it('does not loop when a fresh device token is rejected too', async () => {
    const { deps, useCase } = setup();
    deps.queueService.joinQueue.mockRejectedValue(problem(401, 'UNAUTHORIZED'));
    await expect(useCase.execute('evt_pelita')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(deps.deviceService.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('does not re-register when the token it just registered is rejected', async () => {
    const { deps, useCase } = setup({ deviceToken: null });
    deps.queueService.joinQueue.mockRejectedValue(problem(401, 'UNAUTHORIZED'));
    await expect(useCase.execute('evt_pelita')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(deps.deviceService.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('keeps the first served number for the same place, and starts over for a new one', async () => {
    const same = setup({ stored: { queueToken: 'old', seq: 19700, joinedServed: 17400 } });
    await expect(same.useCase.execute('evt_pelita')).resolves.toMatchObject({ place: { joinedServed: 17400 } });

    const other = setup({ stored: { queueToken: 'old', seq: 500, joinedServed: 10 } });
    await expect(other.useCase.execute('evt_pelita')).resolves.toMatchObject({ place: { joinedServed: 18452 } });
  });

  it('works out the position and how far the line moved since joining', async () => {
    const { useCase } = setup({ stored: { queueToken: 'old', seq: 19700, joinedServed: 17400 } });
    await expect(useCase.execute('evt_pelita')).resolves.toMatchObject({
      place: { position: 1248, progress: 45.7 },
    });
  });

  it('never shows a position below 1 or progress outside 0–100', async () => {
    const { deps, useCase } = setup({ stored: { queueToken: 'old', seq: 19700, joinedServed: 19700 } });
    deps.queueService.joinQueue.mockResolvedValue({ data: { ...PLACE, served: 19750 }, status: 200 });
    await expect(useCase.execute('evt_pelita')).resolves.toMatchObject({ place: { position: 1, progress: 0 } });
    deps.queueService.joinQueue.mockResolvedValue({ data: { ...PLACE, served: 19750 }, status: 200 });
    const moved = setup({ stored: { queueToken: 'old', seq: 19700, joinedServed: 100 } });
    moved.deps.queueService.joinQueue.mockResolvedValue({ data: { ...PLACE, served: 19750 }, status: 200 });
    await expect(moved.useCase.execute('evt_pelita')).resolves.toMatchObject({ place: { progress: 100 } });
  });

  it('passes the pre-sale place through with no number yet', async () => {
    const { deps, places, useCase } = setup();
    deps.queueService.joinQueue.mockResolvedValue({
      data: { ...PLACE, state: 'preopen', seq: null, served: undefined, opensAt: '2026-11-09T03:30:00Z' },
      status: 200,
    });
    await expect(useCase.execute('evt_pelita')).resolves.toMatchObject({
      kind: 'joined',
      place: {
        state: 'preopen',
        seq: null,
        served: null,
        joinedServed: null,
        position: null,
        progress: 0,
        opensAt: '2026-11-09T03:30:00Z',
      },
    });
    expect(places.get('evt_pelita')).toEqual({ queueToken: 'queue-token', seq: null, joinedServed: null });
  });

  it.each([
    [410, 'QUEUE_CLOSED', 'sold-out'],
    [404, 'NOT_FOUND', 'not-found'],
    [409, 'ACCOUNT_HAS_PLACE_ELSEWHERE', 'elsewhere'],
  ])('classifies %i %s as %s', async (status, code, kind) => {
    const { deps, useCase } = setup();
    deps.queueService.joinQueue.mockRejectedValue(problem(status, code));
    await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind });
  });

  it('forgets the place when the queue is closed', async () => {
    const { deps, places, useCase } = setup({ stored: { queueToken: 'old', seq: 1, joinedServed: 0 } });
    deps.queueService.joinQueue.mockRejectedValue(problem(410, 'QUEUE_CLOSED'));
    await useCase.execute('evt_pelita');
    expect(places.has('evt_pelita')).toBe(false);
  });

  it('lets other failures through: rate limits, Turnstile, the network', async () => {
    const limited = setup();
    limited.deps.queueService.joinQueue.mockRejectedValue(problem(429, 'RATE_LIMITED'));
    await expect(limited.useCase.execute('evt_pelita')).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    const blocked = setup();
    blocked.deps.turnstile.getToken.mockRejectedValue(problem(0, 'VERIFICATION_UNAVAILABLE'));
    await expect(blocked.useCase.execute('evt_pelita')).rejects.toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });

    const weird = setup();
    weird.deps.queueService.joinQueue.mockRejectedValue('boom');
    await expect(weird.useCase.execute('evt_pelita')).rejects.toBe('boom');
  });

  describe('resume (FR-10)', () => {
    const STORED = { queueToken: 'queue-token', seq: 19700, joinedServed: 17400 };

    it('reads the stored place back on a refresh or a new tab, without Turnstile or a new join', async () => {
      const { deps, places, useCase } = setup({ stored: STORED });
      deps.queueService.getMyPlace.mockResolvedValue({ data: { ...PLACE, served: 18952 }, status: 200 });
      await expect(useCase.execute('evt_pelita')).resolves.toMatchObject({
        kind: 'joined',
        resumed: true,
        place: { seq: 19700, served: 18952, joinedServed: 17400, position: 748 },
      });
      expect(deps.queueService.getMyPlace).toHaveBeenCalledWith('evt_pelita', 'device-old', 'queue-token');
      expect(deps.queueService.joinQueue).not.toHaveBeenCalled();
      expect(deps.turnstile.getToken).not.toHaveBeenCalled();
      expect(places.get('evt_pelita')).toEqual({ queueToken: 'queue-token', seq: 19700, joinedServed: 17400 });
    });

    it.each([
      [401, 'UNAUTHORIZED'],
      [404, 'NOT_FOUND'],
    ])('joins when the place read answers %i %s', async (status, code) => {
      const { deps, useCase } = setup({ stored: STORED });
      deps.queueService.getMyPlace.mockRejectedValue(problem(status, code));
      await expect(useCase.execute('evt_pelita')).resolves.toMatchObject({ kind: 'joined', resumed: false });
      expect(deps.queueService.joinQueue).toHaveBeenCalled();
    });

    it.each([
      ['MISSED', 'missed'],
      ['EXPIRED', 'missed'],
      ['MOVED', 'elsewhere'],
      ['QUEUE_CLOSED', 'sold-out'],
    ])('says why a gone place is gone (410 %s → %s) and forgets it', async (code, kind) => {
      const { deps, places, useCase } = setup({ stored: STORED });
      deps.queueService.getMyPlace.mockRejectedValue(problem(410, code));
      await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind });
      expect(places.has('evt_pelita')).toBe(false);
      expect(deps.queueService.joinQueue).not.toHaveBeenCalled();
    });

    it('joins at the back on "Antre lagi", whatever is stored', async () => {
      const { deps, useCase } = setup({ stored: STORED });
      await expect(useCase.execute('evt_pelita', { rejoin: true })).resolves.toMatchObject({ resumed: false });
      expect(deps.queueService.getMyPlace).not.toHaveBeenCalled();
      expect(deps.queueService.joinQueue).toHaveBeenCalled();
    });

    it('does not resume without a device token, and lets other read errors through', async () => {
      const none = setup({ deviceToken: null, stored: STORED });
      await none.useCase.execute('evt_pelita');
      expect(none.deps.queueService.getMyPlace).not.toHaveBeenCalled();

      const down = setup({ stored: STORED });
      down.deps.queueService.getMyPlace.mockRejectedValue(problem(0, 'NETWORK_ERROR'));
      await expect(down.useCase.execute('evt_pelita')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });
  });
});
