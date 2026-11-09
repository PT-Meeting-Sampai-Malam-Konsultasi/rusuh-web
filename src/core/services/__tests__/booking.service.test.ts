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
});
