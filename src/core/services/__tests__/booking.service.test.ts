import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMISSION_TOKEN_HEADER, BookingService, IDEMPOTENCY_KEY_HEADER } from '../booking.service';

describe('BookingService', () => {
  const coreHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const service = BookingService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  it('gets the categories from core with the admission token', async () => {
    const response = { data: { eventId: 'evt_samudra', categories: [] }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.getCategories('evt_samudra', 'adm-1')).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledTimes(1);
    expect(coreHttp.get).toHaveBeenCalledWith('core/events/evt_samudra/categories', {
      headers: { 'X-Admission-Token': 'adm-1' },
    });
    expect(ADMISSION_TOKEN_HEADER).toBe('X-Admission-Token');
    expect(coreHttp.post).not.toHaveBeenCalled();
  });

  it('encodes the event id so it never changes the path shape', async () => {
    coreHttp.get.mockResolvedValue({ data: {}, status: 200 });
    await service.getCategories('a/b?c d', 'adm-1');
    expect(coreHttp.get).toHaveBeenCalledWith('core/events/a%2Fb%3Fc%20d/categories', expect.anything());
  });

  it('lets the HttpError through unchanged', async () => {
    const error = { status: 403, code: 'ADMISSION_INVALID', message: 'Admission invalid' };
    coreHttp.get.mockRejectedValue(error);
    await expect(service.getCategories('evt_samudra', 'adm-1')).rejects.toBe(error);
  });

  it('gets one booking, encoding its id', async () => {
    const response = { data: { bookingId: 'bk_1', status: 'PAID' }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.getBooking('bk_1')).resolves.toBe(response);
    await service.getBooking('a/b');
    expect(coreHttp.get).toHaveBeenNthCalledWith(1, 'core/bookings/bk_1');
    expect(coreHttp.get).toHaveBeenNthCalledWith(2, 'core/bookings/a%2Fb');
  });

  it('lists my tickets', async () => {
    const response = { data: { items: [] }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.listMyTickets()).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledWith('core/tickets');
  });

  it('downloads the tickets PDF as a blob', async () => {
    const response = { data: new Blob(['%PDF']), status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.downloadTickets('bk_1')).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledWith('core/bookings/bk_1/tickets.pdf', {
      headers: { Accept: 'application/pdf' },
      responseType: 'blob',
    });
  });

  describe('validateAttendee', () => {
    const body = { fieldIndex: 1, fullName: ' Nadia Saputri ', nik: '3174055203960004' };

    it('posts the attendee to core with the admission token, body unchanged', async () => {
      const response = {
        data: { validationToken: 'vt-1', nikMasked: '************0004', expiresAt: '2026-11-03T03:05:00Z' },
        status: 200,
      };
      coreHttp.post.mockResolvedValue(response);
      await expect(service.validateAttendee('evt_samudra', 'adm-1', body)).resolves.toBe(response);
      expect(coreHttp.post).toHaveBeenCalledTimes(1);
      expect(coreHttp.post).toHaveBeenCalledWith('core/events/evt_samudra/attendees/validate', body, {
        headers: { 'X-Admission-Token': 'adm-1' },
      });
      expect(coreHttp.post.mock.calls[0][1]).toBe(body);
      expect(coreHttp.get).not.toHaveBeenCalled();
    });

    it('encodes the event id so it never changes the path shape', async () => {
      coreHttp.post.mockResolvedValue({ data: {}, status: 200 });
      await service.validateAttendee('a/b?c d', 'adm-1', body);
      expect(coreHttp.post).toHaveBeenCalledWith(
        'core/events/a%2Fb%3Fc%20d/attendees/validate',
        expect.anything(),
        expect.anything(),
      );
    });

    it.each([
      { status: 403, code: 'ADMISSION_INVALID' },
      { status: 409, code: 'NIK_SEAT_TAKEN' },
      { status: 422, code: 'NIK_INVALID' },
      { status: 429, code: 'RATE_LIMITED', data: { retryAfter: 60 } },
      { status: 503, code: 'DUKCAPIL_UNAVAILABLE' },
      { status: 0, code: 'NETWORK_ERROR' },
    ])('lets $code through unchanged', async (error) => {
      coreHttp.post.mockRejectedValue(error);
      await expect(service.validateAttendee('evt_samudra', 'adm-1', body)).rejects.toBe(error);
    });
  });

  describe('createBooking', () => {
    const body = {
      eventId: 'evt_samudra',
      tickets: [
        { categoryId: 'cat_festival_b', validationToken: 'vt-2' },
        { categoryId: 'cat_vip', validationToken: 'vt-1' },
      ],
    };

    it('posts the body unchanged with the admission token and the idempotency key', async () => {
      const response = { data: { bookingId: 'bk_1', status: 'SELECTION' }, status: 201 };
      coreHttp.post.mockResolvedValue(response);
      await expect(service.createBooking('adm-1', 'key-1', body)).resolves.toBe(response);
      expect(coreHttp.post).toHaveBeenCalledTimes(1);
      expect(coreHttp.post).toHaveBeenCalledWith('core/bookings', body, {
        headers: { 'X-Admission-Token': 'adm-1', 'Idempotency-Key': 'key-1' },
      });
      expect(coreHttp.post.mock.calls[0][1]).toBe(body);
      expect(coreHttp.post.mock.calls[0][1].tickets.map((t: { validationToken: string }) => t.validationToken)).toEqual(
        ['vt-2', 'vt-1'],
      );
      expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
      expect(coreHttp.get).not.toHaveBeenCalled();
    });

    it.each([
      { status: 403, code: 'ADMISSION_INVALID' },
      { status: 409, code: 'CATEGORY_SOLD_OUT', data: { categoryId: 'cat_vip' } },
      { status: 409, code: 'ACCOUNT_HAS_ACTIVE_BOOKING' },
      { status: 422, code: 'VALIDATION_FAILED' },
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 0, code: 'NETWORK_ERROR' },
    ])('lets $code through unchanged', async (error) => {
      coreHttp.post.mockRejectedValue(error);
      await expect(service.createBooking('adm-1', 'key-1', body)).rejects.toBe(error);
    });
  });

  describe('checkPaymentStatus', () => {
    it('posts no body to check-status with the admission token, the id encoded', async () => {
      const response = { data: { bookingId: 'bk 1', status: 'PAID' }, status: 200 };
      coreHttp.post.mockResolvedValue(response);
      await expect(service.checkPaymentStatus('bk 1', 'adm-1')).resolves.toBe(response);
      expect(coreHttp.post).toHaveBeenCalledWith('core/bookings/bk%201/check-status', undefined, {
        headers: { 'X-Admission-Token': 'adm-1' },
      });
    });
  });

  describe('enterPayment', () => {
    it('posts no body to the payment path with only the admission token', async () => {
      const response = {
        data: {
          bookingId: 'bk_1',
          snapToken: 'snap-1',
          paymentExpiresAt: '2026-11-14T10:50:00Z',
          redirectUrl: null,
          serverNow: '2026-11-14T10:40:00Z',
        },
        status: 200,
      };
      coreHttp.post.mockResolvedValue(response);
      await expect(service.enterPayment('bk_1', 'adm-1')).resolves.toBe(response);
      expect(coreHttp.post).toHaveBeenCalledTimes(1);
      expect(coreHttp.post).toHaveBeenCalledWith('core/bookings/bk_1/payment', undefined, {
        headers: { 'X-Admission-Token': 'adm-1' },
      });
      expect(coreHttp.get).not.toHaveBeenCalled();
    });

    it('encodes the booking id so it never changes the path shape', async () => {
      coreHttp.post.mockResolvedValue({ data: {}, status: 200 });
      await service.enterPayment('a/b?c d', 'adm-1');
      expect(coreHttp.post).toHaveBeenCalledWith('core/bookings/a%2Fb%3Fc%20d/payment', undefined, expect.anything());
    });

    it.each([
      { status: 403, code: 'ADMISSION_INVALID' },
      { status: 404, code: 'NOT_FOUND' },
      { status: 409, code: 'BOOKING_NOT_HELD' },
      { status: 409, code: 'NIK_SEAT_TAKEN', data: { nikMasked: '3174 •••• •••• 0004' } },
      { status: 503, code: 'INTERNAL_ERROR' },
    ])('lets $code through unchanged', async (error) => {
      coreHttp.post.mockRejectedValue(error);
      await expect(service.enterPayment('bk_1', 'adm-1')).rejects.toBe(error);
    });
  });

  describe('getActiveBooking', () => {
    it('gets the active bookings with no config', async () => {
      const response = { data: { items: [] }, status: 200 };
      coreHttp.get.mockResolvedValue(response);
      await expect(service.getActiveBooking()).resolves.toBe(response);
      expect(coreHttp.get).toHaveBeenCalledTimes(1);
      expect(coreHttp.get.mock.calls[0]).toEqual(['core/bookings/active']);
      expect(coreHttp.post).not.toHaveBeenCalled();
    });

    it('lets the HttpError through unchanged', async () => {
      const error = { status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
      coreHttp.get.mockRejectedValue(error);
      await expect(service.getActiveBooking()).rejects.toBe(error);
    });
  });
});
