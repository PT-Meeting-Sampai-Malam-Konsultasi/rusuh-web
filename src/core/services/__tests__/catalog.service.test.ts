import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogService } from '../catalog.service';

describe('CatalogService', () => {
  const coreHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const service = CatalogService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  it('gets the event list from core', async () => {
    const response = { data: { items: [], serverNow: '2026-11-03T03:00:00Z' }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.listEvents()).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledTimes(1);
    expect(coreHttp.get).toHaveBeenCalledWith('events');
  });

  it('lets the HttpError through unchanged', async () => {
    const error = { status: 0, code: 'NETWORK_ERROR', message: 'offline' };
    coreHttp.get.mockRejectedValue(error);
    await expect(service.listEvents()).rejects.toBe(error);
  });

  it('gets one event from core, with no extra headers', async () => {
    const response = { data: { eventId: 'evt_samudra' }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.getEvent('evt_samudra')).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledTimes(1);
    expect(coreHttp.get).toHaveBeenCalledWith('events/evt_samudra');
  });

  it('encodes the event id so it never changes the path shape', async () => {
    coreHttp.get.mockResolvedValue({ data: {}, status: 200 });
    await service.getEvent('a/b?c d');
    expect(coreHttp.get).toHaveBeenCalledWith('events/a%2Fb%3Fc%20d');
  });

  it('lets a NOT_FOUND from getEvent through unchanged', async () => {
    const error = { status: 404, code: 'NOT_FOUND', message: 'Not found' };
    coreHttp.get.mockRejectedValue(error);
    await expect(service.getEvent('evt_x')).rejects.toBe(error);
  });
});
