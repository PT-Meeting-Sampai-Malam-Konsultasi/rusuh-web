import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMISSION_TOKEN_HEADER, BookingService } from '../booking.service';

describe('BookingService', () => {
  const coreHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const service = BookingService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  it('gets the categories from core with the admission token', async () => {
    const response = { data: { eventId: 'evt_samudra', categories: [] }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.getCategories('evt_samudra', 'adm-1')).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledTimes(1);
    expect(coreHttp.get).toHaveBeenCalledWith('events/evt_samudra/categories', {
      headers: { 'X-Admission-Token': 'adm-1' },
    });
    expect(ADMISSION_TOKEN_HEADER).toBe('X-Admission-Token');
    expect(coreHttp.post).not.toHaveBeenCalled();
  });

  it('encodes the event id so it never changes the path shape', async () => {
    coreHttp.get.mockResolvedValue({ data: {}, status: 200 });
    await service.getCategories('a/b?c d', 'adm-1');
    expect(coreHttp.get).toHaveBeenCalledWith('events/a%2Fb%3Fc%20d/categories', expect.anything());
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
    expect(coreHttp.get).toHaveBeenNthCalledWith(1, 'bookings/bk_1');
    expect(coreHttp.get).toHaveBeenNthCalledWith(2, 'bookings/a%2Fb');
  });

  it('lists my tickets', async () => {
    const response = { data: { items: [] }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.listMyTickets()).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledWith('tickets');
  });

  it('downloads the tickets PDF as a blob', async () => {
    const response = { data: new Blob(['%PDF']), status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.downloadTickets('bk_1')).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledWith('bookings/bk_1/tickets.pdf', {
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
      expect(coreHttp.post).toHaveBeenCalledWith('events/evt_samudra/attendees/validate', body, {
        headers: { 'X-Admission-Token': 'adm-1' },
      });
      expect(coreHttp.post.mock.calls[0][1]).toBe(body);
      expect(coreHttp.get).not.toHaveBeenCalled();
    });

    it('encodes the event id so it never changes the path shape', async () => {
      coreHttp.post.mockResolvedValue({ data: {}, status: 200 });
      await service.validateAttendee('a/b?c d', 'adm-1', body);
      expect(coreHttp.post).toHaveBeenCalledWith(
        'events/a%2Fb%3Fc%20d/attendees/validate',
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
});
