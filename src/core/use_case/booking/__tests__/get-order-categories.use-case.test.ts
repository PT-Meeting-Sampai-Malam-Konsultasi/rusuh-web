import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GetCategoriesResponse } from '@core/entities/booking/booking.entity';
import type { Admission } from '@core/entities/queue/queue.entity';
import type { StoredQueuePlace } from '@core/protocols/queue-place-store.protocol';
import type { ClaimTurnResult } from '@core/use_case/queue/claim-turn.use-case';

import { GetOrderCategoriesUseCase } from '../get-order-categories.use-case';

const response = (eventId = 'evt_1'): GetCategoriesResponse => ({
  eventId,
  categories: [
    {
      categoryId: 'cat_vip',
      name: 'VIP',
      price: { amount: 2_500_000, currency: 'IDR' },
      availability: 'almost_gone',
      seating: 'seated',
    },
    {
      categoryId: 'cat_festival',
      name: 'Festival',
      price: { amount: 950_000, currency: 'IDR' },
      availability: 'available',
    },
  ],
  maxTicketsPerOrder: 4,
  reservedUnits: 2,
  adminFee: { amount: 5_000, currency: 'IDR' },
  expiresAt: '2026-11-09T03:05:00Z',
  serverNow: '2026-11-09T03:00:00Z',
});

const place: StoredQueuePlace = { queueToken: 'q_1', seq: 19700, joinedServed: 18452 };

const admission = (token = 'adm_2'): Admission => ({
  admissionToken: token,
  slotId: 's_1',
  maxTickets: 3,
  expiresAt: '2026-11-09T03:05:00Z',
  serverNow: '2026-11-09T03:00:00Z',
});

const admitted = (token = 'adm_2'): ClaimTurnResult => ({ kind: 'admitted', admission: admission(token) });

let stores: { set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[] = [];

const setup = () => {
  const bookingService = {
    getCategories: vi.fn(),
    getBooking: vi.fn(),
    listMyTickets: vi.fn(),
    downloadTickets: vi.fn(),
    validateAttendee: vi.fn(),
    createBooking: vi.fn(),
    enterPayment: vi.fn(),
    checkPaymentStatus: vi.fn(),
    getActiveBooking: vi.fn(),
  };
  const claimTurnUseCase = { execute: vi.fn(), turnWindow: vi.fn() };
  const queuePlaceStore = { get: vi.fn().mockReturnValue(place), set: vi.fn(), remove: vi.fn() };
  stores.push(queuePlaceStore);
  const useCase = GetOrderCategoriesUseCase({ bookingService, claimTurnUseCase, queuePlaceStore });
  return { bookingService, claimTurnUseCase, queuePlaceStore, useCase };
};

const unclassified = [
  { status: 403, code: 'FORBIDDEN', message: 'other 403' },
  { status: 401, code: 'UNAUTHORIZED', message: 'no session' },
  { status: 0, code: 'NETWORK_ERROR', message: 'offline' },
  { status: 0, code: 'TIMEOUT', message: 'slow' },
  { status: 500, code: 'INTERNAL_ERROR', message: 'down' },
  { status: 429, code: 'RATE_LIMITED', message: 'slow down' },
  new Error('boom'),
  null,
];

describe('GetOrderCategoriesUseCase', () => {
  afterEach(() => {
    // Read only: the use case never writes the stored place (Property 12).
    for (const store of stores) {
      expect(store.set).not.toHaveBeenCalled();
      expect(store.remove).not.toHaveBeenCalled();
    }
    stores = [];
  });

  describe('with a token', () => {
    it('passes the order data through with resumed: false, without a claim or a store read', async () => {
      const { bookingService, claimTurnUseCase, queuePlaceStore, useCase } = setup();
      const data = response();
      const snapshot = structuredClone(data);
      bookingService.getCategories.mockResolvedValue({ data, status: 200 });

      const result = await useCase.execute({ eventId: 'evt_1', admissionToken: 'adm_1' });

      expect(result).toEqual({
        kind: 'ok',
        categories: snapshot.categories,
        maxTicketsPerOrder: 4,
        reservedUnits: 2,
        adminFee: { amount: 5_000, currency: 'IDR' },
        expiresAt: '2026-11-09T03:05:00Z',
        serverNow: '2026-11-09T03:00:00Z',
        resumed: false,
      });
      expect(result).not.toHaveProperty('eventId');
      expect(result).not.toHaveProperty('maxTickets');
      expect(data).toEqual(snapshot);
      expect(bookingService.getCategories).toHaveBeenCalledTimes(1);
      expect(bookingService.getCategories).toHaveBeenCalledWith('evt_1', 'adm_1');
      expect(claimTurnUseCase.execute).not.toHaveBeenCalled();
      expect(queuePlaceStore.get).not.toHaveBeenCalled();
    });

    it('classifies ADMISSION_INVALID as admission-invalid and never claims again', async () => {
      const { bookingService, claimTurnUseCase, useCase } = setup();
      bookingService.getCategories.mockRejectedValue({ status: 403, code: 'ADMISSION_INVALID', message: 'expired' });
      await expect(useCase.execute({ eventId: 'evt_1', admissionToken: 'adm_1' })).resolves.toEqual({
        kind: 'admission-invalid',
      });
      expect(claimTurnUseCase.execute).not.toHaveBeenCalled();
    });

    it.each(unclassified)('re-throws unclassified errors unchanged (%j)', async (error) => {
      const { bookingService, claimTurnUseCase, useCase } = setup();
      bookingService.getCategories.mockRejectedValue(error);
      await expect(useCase.execute({ eventId: 'evt_1', admissionToken: 'adm_1' })).rejects.toBe(error);
      expect(claimTurnUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('without a token (a reload)', () => {
    it.each([null, ''])(
      'claims again and loads with the returned token when the token is %j',
      async (admissionToken) => {
        const { bookingService, claimTurnUseCase, queuePlaceStore, useCase } = setup();
        claimTurnUseCase.execute.mockResolvedValue(admitted('adm_2'));
        bookingService.getCategories.mockResolvedValue({
          data: { ...response(), expiresAt: '2026-11-09T03:02:12Z', serverNow: '2026-11-09T03:00:00Z' },
          status: 200,
        });

        const result = await useCase.execute({ eventId: 'evt_1', admissionToken });

        expect(result).toMatchObject({
          kind: 'ok',
          resumed: true,
          // The lease end of the same slot, untouched: 132 s left, not 300 s.
          expiresAt: '2026-11-09T03:02:12Z',
          serverNow: '2026-11-09T03:00:00Z',
          maxTicketsPerOrder: 4,
          reservedUnits: 2,
        });
        expect(queuePlaceStore.get).toHaveBeenCalledWith('evt_1');
        expect(claimTurnUseCase.execute).toHaveBeenCalledTimes(1);
        expect(claimTurnUseCase.execute).toHaveBeenCalledWith('evt_1');
        expect(bookingService.getCategories).toHaveBeenCalledTimes(1);
        expect(bookingService.getCategories).toHaveBeenCalledWith('evt_1', 'adm_2');
        expect(claimTurnUseCase.execute.mock.invocationCallOrder[0]).toBeLessThan(
          bookingService.getCategories.mock.invocationCallOrder[0],
        );
      },
    );

    it.each([null, ''])(
      'returns admission-invalid without a claim or request when no place is stored (token %j)',
      async (admissionToken) => {
        const { bookingService, claimTurnUseCase, queuePlaceStore, useCase } = setup();
        queuePlaceStore.get.mockReturnValue(null);
        await expect(useCase.execute({ eventId: 'evt_1', admissionToken })).resolves.toEqual({
          kind: 'admission-invalid',
        });
        expect(queuePlaceStore.get).toHaveBeenCalledWith('evt_1');
        expect(claimTurnUseCase.execute).not.toHaveBeenCalled();
        expect(bookingService.getCategories).not.toHaveBeenCalled();
      },
    );

    it('returns window-ended when the claim says the turn is over', async () => {
      const { bookingService, claimTurnUseCase, useCase } = setup();
      claimTurnUseCase.execute.mockResolvedValue({ kind: 'missed' });
      await expect(useCase.execute({ eventId: 'evt_1', admissionToken: null })).resolves.toEqual({
        kind: 'window-ended',
      });
      expect(bookingService.getCategories).not.toHaveBeenCalled();
    });

    it.each<ClaimTurnResult>([
      { kind: 'sign-in' },
      { kind: 'retry', afterMs: 1000 },
      { kind: 'paused' },
      { kind: 'sold-out' },
    ])('returns admission-invalid when the claim answers %j', async (claim) => {
      const { bookingService, claimTurnUseCase, useCase } = setup();
      claimTurnUseCase.execute.mockResolvedValue(claim);
      await expect(useCase.execute({ eventId: 'evt_1', admissionToken: null })).resolves.toEqual({
        kind: 'admission-invalid',
      });
      expect(bookingService.getCategories).not.toHaveBeenCalled();
    });

    it.each([
      { status: 503, code: 'ADMISSION_UNAVAILABLE', message: 'busy' },
      { status: 0, code: 'NETWORK_ERROR', message: 'offline' },
      new Error('boom'),
    ])('propagates a claim error unchanged (%j)', async (error) => {
      const { bookingService, claimTurnUseCase, useCase } = setup();
      claimTurnUseCase.execute.mockRejectedValue(error);
      await expect(useCase.execute({ eventId: 'evt_1', admissionToken: null })).rejects.toBe(error);
      expect(bookingService.getCategories).not.toHaveBeenCalled();
    });

    it('returns admission-invalid when the re-claimed token is rejected, without a second claim', async () => {
      const { bookingService, claimTurnUseCase, useCase } = setup();
      claimTurnUseCase.execute.mockResolvedValue(admitted());
      bookingService.getCategories.mockRejectedValue({ status: 403, code: 'ADMISSION_INVALID', message: 'expired' });
      await expect(useCase.execute({ eventId: 'evt_1', admissionToken: null })).resolves.toEqual({
        kind: 'admission-invalid',
      });
      expect(claimTurnUseCase.execute).toHaveBeenCalledTimes(1);
      expect(bookingService.getCategories).toHaveBeenCalledTimes(1);
    });

    it.each(unclassified)('re-throws unclassified categories errors after a re-claim (%j)', async (error) => {
      const { bookingService, claimTurnUseCase, useCase } = setup();
      claimTurnUseCase.execute.mockResolvedValue(admitted());
      bookingService.getCategories.mockRejectedValue(error);
      await expect(useCase.execute({ eventId: 'evt_1', admissionToken: null })).rejects.toBe(error);
      expect(claimTurnUseCase.execute).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps no state between calls', async () => {
    const { bookingService, claimTurnUseCase, useCase } = setup();
    claimTurnUseCase.execute.mockResolvedValue(admitted('adm_2'));
    bookingService.getCategories
      .mockResolvedValueOnce({ data: response('evt_1'), status: 200 })
      .mockResolvedValueOnce({ data: response('evt_1'), status: 200 })
      .mockRejectedValueOnce({ status: 403, code: 'ADMISSION_INVALID', message: 'expired' })
      .mockResolvedValueOnce({ data: response('evt_2'), status: 200 });

    await expect(useCase.execute({ eventId: 'evt_1', admissionToken: null })).resolves.toMatchObject({
      kind: 'ok',
      resumed: true,
    });
    await expect(useCase.execute({ eventId: 'evt_1', admissionToken: 'adm_3' })).resolves.toMatchObject({
      kind: 'ok',
      resumed: false,
    });
    expect(claimTurnUseCase.execute).toHaveBeenCalledTimes(1);
    expect(bookingService.getCategories).toHaveBeenNthCalledWith(1, 'evt_1', 'adm_2');
    expect(bookingService.getCategories).toHaveBeenNthCalledWith(2, 'evt_1', 'adm_3');

    await expect(useCase.execute({ eventId: 'evt_1', admissionToken: 'a' })).resolves.toEqual({
      kind: 'admission-invalid',
    });
    await expect(useCase.execute({ eventId: 'evt_2', admissionToken: 'b' })).resolves.toMatchObject({ kind: 'ok' });
    expect(bookingService.getCategories).toHaveBeenNthCalledWith(4, 'evt_2', 'b');
  });
});
