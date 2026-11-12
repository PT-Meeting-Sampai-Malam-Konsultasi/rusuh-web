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
});
