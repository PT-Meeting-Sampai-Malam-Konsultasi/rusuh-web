import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredQueuePlace } from '@core/protocols/queue-place-store.protocol';

import { LeaveQueueUseCase } from '../leave-queue.use-case';

const STORED: StoredQueuePlace = { queueToken: 'queue-token', seq: 19700, joinedServed: 18452 };
const problem = (status: number, code: string) => ({ status, code, message: code });

describe('LeaveQueueUseCase', () => {
  const queueService = { leaveQueue: vi.fn() };
  const deviceTokenStore = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
  const queuePlaceStore = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
  const useCase = LeaveQueueUseCase({ queueService, deviceTokenStore, queuePlaceStore } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    deviceTokenStore.get.mockReturnValue('device-1');
    queuePlaceStore.get.mockReturnValue(STORED);
    queueService.leaveQueue.mockResolvedValue({ data: undefined, status: 204 });
  });

  it('frees the place on the server with both tokens, then forgets it here', async () => {
    await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind: 'left' });
    expect(queueService.leaveQueue).toHaveBeenCalledWith('evt_pelita', 'device-1', 'queue-token');
    expect(queuePlaceStore.remove).toHaveBeenCalledWith('evt_pelita');
  });

  it.each(['UNAUTHORIZED', 'NOT_FOUND', 'MISSED', 'EXPIRED', 'MOVED', 'QUEUE_CLOSED'])(
    'counts %s as already gone, and forgets the place',
    async (code) => {
      queueService.leaveQueue.mockRejectedValue(problem(code === 'UNAUTHORIZED' ? 401 : 410, code));
      await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind: 'left' });
      expect(queuePlaceStore.remove).toHaveBeenCalledWith('evt_pelita');
    },
  );

  it('only forgets the place when this device has no tokens for it', async () => {
    queuePlaceStore.get.mockReturnValue(null);
    await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind: 'left' });
    deviceTokenStore.get.mockReturnValue(null);
    queuePlaceStore.get.mockReturnValue(STORED);
    await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind: 'left' });
    expect(queueService.leaveQueue).not.toHaveBeenCalled();
    expect(queuePlaceStore.remove).toHaveBeenCalledTimes(2);
  });

  it('keeps the place when the network or the server fails, so the buyer can try again', async () => {
    const error = problem(0, 'NETWORK_ERROR');
    queueService.leaveQueue.mockRejectedValue(error);
    await expect(useCase.execute('evt_pelita')).rejects.toBe(error);
    expect(queuePlaceStore.remove).not.toHaveBeenCalled();
  });
});
