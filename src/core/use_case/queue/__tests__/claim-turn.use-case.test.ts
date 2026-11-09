import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimTurnUseCase } from '../claim-turn.use-case';

const ADMISSION = {
  admissionToken: 'adm',
  slotId: 's_1',
  maxTickets: 3,
  expiresAt: '2026-11-09T03:20:00Z',
  serverNow: '2026-11-09T03:04:00Z',
};
const problem = (status: number, code: string) => ({ status, code, message: code });

function setup({ device = 'device' as string | null, queueToken = 'queue' as string | null } = {}) {
  const deps = {
    queueService: { joinQueue: vi.fn(), getFrontier: vi.fn(), claimTurn: vi.fn(), getMyPlace: vi.fn() },
    deviceTokenStore: { get: vi.fn(() => device), set: vi.fn(), clear: vi.fn() },
    queuePlaceStore: {
      get: vi.fn(() => (queueToken ? { queueToken, seq: 19700, joinedServed: 18452 } : null)),
      set: vi.fn(),
      remove: vi.fn(),
    },
    admissionStore: { get: vi.fn(), set: vi.fn() },
  };
  return { deps, useCase: ClaimTurnUseCase(deps) };
}

describe('ClaimTurnUseCase.execute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('claims with the device and queue tokens and keeps the admission for the order page', async () => {
    const { deps, useCase } = setup();
    deps.queueService.claimTurn.mockResolvedValue({ data: ADMISSION, status: 200 });
    await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind: 'admitted', admission: ADMISSION });
    expect(deps.queueService.claimTurn).toHaveBeenCalledWith('evt_pelita', 'device', 'queue');
    expect(deps.admissionStore.set).toHaveBeenCalledWith('evt_pelita', 'adm');
  });

  it.each([
    [problem(401, 'UNAUTHORIZED'), { kind: 'sign-in' }],
    [problem(409, 'NOT_YET'), { kind: 'retry', afterMs: 1000 }],
    [problem(409, 'FULL'), { kind: 'retry', afterMs: 1500 }],
    [problem(409, 'NO_STOCK'), { kind: 'paused' }],
    [problem(410, 'QUEUE_CLOSED'), { kind: 'sold-out' }],
  ])('classifies %o', async (error, expected) => {
    const { deps, useCase } = setup();
    deps.queueService.claimTurn.mockRejectedValue(error);
    await expect(useCase.execute('evt_pelita', 0.5)).resolves.toEqual(expected);
    expect(deps.admissionStore.set).not.toHaveBeenCalled();
    expect(deps.queuePlaceStore.remove).not.toHaveBeenCalled();
  });

  it.each(['MISSED', 'EXPIRED', 'MOVED'])(
    'forgets the place on %s, so the next join starts at the back',
    async (code) => {
      const { deps, useCase } = setup();
      deps.queueService.claimTurn.mockRejectedValue(problem(410, code));
      await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind: 'missed' });
      expect(deps.queuePlaceStore.remove).toHaveBeenCalledWith('evt_pelita');
    },
  );

  it('counts the place as gone without a device or queue token', async () => {
    for (const tokens of [{ device: null }, { queueToken: null }]) {
      const { deps, useCase } = setup(tokens);
      await expect(useCase.execute('evt_pelita')).resolves.toEqual({ kind: 'missed' });
      expect(deps.queueService.claimTurn).not.toHaveBeenCalled();
    }
  });

  it('lets other errors through', async () => {
    const { deps, useCase } = setup();
    const error = problem(503, 'INTERNAL_ERROR');
    deps.queueService.claimTurn.mockRejectedValue(error);
    await expect(useCase.execute('evt_pelita')).rejects.toBe(error);
  });
});

describe('ClaimTurnUseCase.turnWindow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the turn window from the place', async () => {
    const { deps, useCase } = setup();
    deps.queueService.getMyPlace.mockResolvedValue({
      data: { turnExpiresAt: '2026-11-09T03:05:00Z', serverNow: '2026-11-09T03:04:10Z' },
      status: 200,
    });
    await expect(useCase.turnWindow('evt_pelita')).resolves.toEqual({
      kind: 'window',
      turnExpiresAt: '2026-11-09T03:05:00Z',
      serverNow: '2026-11-09T03:04:10Z',
    });
    expect(deps.queueService.getMyPlace).toHaveBeenCalledWith('evt_pelita', 'device', 'queue');
  });

  it('answers waiting before the window, and missed or sold out from the 410s', async () => {
    const { deps, useCase } = setup();
    deps.queueService.getMyPlace.mockResolvedValueOnce({ data: { turnExpiresAt: null, serverNow: 'x' }, status: 200 });
    await expect(useCase.turnWindow('evt_pelita')).resolves.toEqual({ kind: 'waiting' });
    deps.queueService.getMyPlace.mockRejectedValueOnce(problem(410, 'MISSED'));
    await expect(useCase.turnWindow('evt_pelita')).resolves.toEqual({ kind: 'missed' });
    deps.queueService.getMyPlace.mockRejectedValueOnce(problem(410, 'QUEUE_CLOSED'));
    await expect(useCase.turnWindow('evt_pelita')).resolves.toEqual({ kind: 'sold-out' });
    const error = problem(0, 'NETWORK_ERROR');
    deps.queueService.getMyPlace.mockRejectedValueOnce(error);
    await expect(useCase.turnWindow('evt_pelita')).rejects.toBe(error);
  });

  it('counts the place as gone without tokens', async () => {
    const { useCase } = setup({ device: null });
    await expect(useCase.turnWindow('evt_pelita')).resolves.toEqual({ kind: 'missed' });
  });
});
