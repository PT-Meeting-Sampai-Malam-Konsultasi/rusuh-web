import { describe, expect, it, vi } from 'vitest';

import type { GetCategoriesResponse } from '@core/entities/booking/booking.entity';

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

const setup = () => {
  const bookingService = { getCategories: vi.fn() };
  const useCase = GetOrderCategoriesUseCase({ bookingService });
  return { bookingService, useCase };
};

describe('GetOrderCategoriesUseCase', () => {
  it.each([null, ''])('returns admission-invalid without a request when the token is %j', async (admissionToken) => {
    const { bookingService, useCase } = setup();
    await expect(useCase.execute({ eventId: 'evt_1', admissionToken })).resolves.toEqual({
      kind: 'admission-invalid',
    });
    expect(bookingService.getCategories).not.toHaveBeenCalled();
  });

  it('passes the order data through on success, without mutating the response', async () => {
    const { bookingService, useCase } = setup();
    const data = response();
    const snapshot = structuredClone(data);
    bookingService.getCategories.mockResolvedValue({ data, status: 200 });

    const result = await useCase.execute({ eventId: 'evt_1', admissionToken: 'adm_tok' });

    expect(result).toEqual({
      kind: 'ok',
      categories: snapshot.categories,
      maxTicketsPerOrder: 4,
      reservedUnits: 2,
      adminFee: { amount: 5_000, currency: 'IDR' },
      expiresAt: '2026-11-09T03:05:00Z',
      serverNow: '2026-11-09T03:00:00Z',
    });
    expect(result).not.toHaveProperty('eventId');
    expect(result).not.toHaveProperty('maxTickets');
    expect(data).toEqual(snapshot);
    expect(bookingService.getCategories).toHaveBeenCalledTimes(1);
    expect(bookingService.getCategories).toHaveBeenCalledWith('evt_1', 'adm_tok');
  });

  it('classifies ADMISSION_INVALID as admission-invalid', async () => {
    const { bookingService, useCase } = setup();
    bookingService.getCategories.mockRejectedValue({ status: 403, code: 'ADMISSION_INVALID', message: 'expired' });
    await expect(useCase.execute({ eventId: 'evt_1', admissionToken: 'adm_tok' })).resolves.toEqual({
      kind: 'admission-invalid',
    });
  });

  it.each([
    { status: 403, code: 'FORBIDDEN', message: 'other 403' },
    { status: 401, code: 'UNAUTHORIZED', message: 'no session' },
    { status: 0, code: 'NETWORK_ERROR', message: 'offline' },
    { status: 0, code: 'TIMEOUT', message: 'slow' },
    { status: 500, code: 'INTERNAL_ERROR', message: 'down' },
    { status: 429, code: 'RATE_LIMITED', message: 'slow down' },
    new Error('boom'),
    null,
  ])('re-throws unclassified errors unchanged (%j)', async (error) => {
    const { bookingService, useCase } = setup();
    bookingService.getCategories.mockRejectedValue(error);
    await expect(useCase.execute({ eventId: 'evt_1', admissionToken: 'adm_tok' })).rejects.toBe(error);
  });

  it('keeps no state between calls', async () => {
    const { bookingService, useCase } = setup();
    bookingService.getCategories
      .mockRejectedValueOnce({ status: 403, code: 'ADMISSION_INVALID', message: 'expired' })
      .mockResolvedValueOnce({ data: response('evt_2'), status: 200 });

    await expect(useCase.execute({ eventId: 'evt_1', admissionToken: 'a' })).resolves.toEqual({
      kind: 'admission-invalid',
    });
    await expect(useCase.execute({ eventId: 'evt_2', admissionToken: 'b' })).resolves.toMatchObject({ kind: 'ok' });
    expect(bookingService.getCategories).toHaveBeenNthCalledWith(2, 'evt_2', 'b');
  });
});
