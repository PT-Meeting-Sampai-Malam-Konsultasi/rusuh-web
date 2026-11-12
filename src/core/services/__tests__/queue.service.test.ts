import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeviceService } from '../device.service';
import { QueueService } from '../queue.service';

const queueHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };

describe('DeviceService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers a web device with the Turnstile token', async () => {
    const response = { data: { deviceToken: 'd', expiresAt: '2026-12-09T03:00:00Z' }, status: 201 };
    queueHttp.post.mockResolvedValue(response);
    await expect(DeviceService({ queueHttp }).registerDevice('ts')).resolves.toBe(response);
    expect(queueHttp.post).toHaveBeenCalledWith(
      'devices',
      { platform: 'web' },
      { headers: { 'X-Turnstile-Token': 'ts' } },
    );
  });
});

describe('QueueService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('joins with the device and Turnstile tokens, encoding the event id', async () => {
    const response = { data: { eventId: 'a/b' }, status: 200 };
    queueHttp.post.mockResolvedValue(response);
    await expect(QueueService({ queueHttp }).joinQueue('a/b', 'd', 'ts')).resolves.toBe(response);
    expect(queueHttp.post).toHaveBeenCalledWith('queue/a%2Fb/join', undefined, {
      headers: { 'X-Device-Token': 'd', 'X-Turnstile-Token': 'ts' },
    });
  });

  it('lets the HttpError through unchanged', async () => {
    const error = { status: 410, code: 'QUEUE_CLOSED', message: 'closed' };
    queueHttp.post.mockRejectedValue(error);
    await expect(QueueService({ queueHttp }).joinQueue('e', 'd', 'ts')).rejects.toBe(error);
  });

  it('reads the public frontier without token headers', async () => {
    const response = { data: { event: 'a/b', state: 'open', served: 1, ts: 2 }, status: 200 };
    queueHttp.get.mockResolvedValue(response);
    await expect(QueueService({ queueHttp }).getFrontier('a/b')).resolves.toBe(response);
    expect(queueHttp.get).toHaveBeenCalledWith('queue/a%2Fb/frontier');
  });

  it('claims the turn and reads the place with the device and queue tokens', async () => {
    const admission = { data: { admissionToken: 'adm' }, status: 200 };
    queueHttp.post.mockResolvedValue(admission);
    await expect(QueueService({ queueHttp }).claimTurn('a/b', 'd', 'q')).resolves.toBe(admission);
    expect(queueHttp.post).toHaveBeenCalledWith('queue/a%2Fb/claim', undefined, {
      headers: { 'X-Device-Token': 'd', 'X-Queue-Token': 'q' },
    });
    const place = { data: { seq: 1 }, status: 200 };
    queueHttp.get.mockResolvedValue(place);
    await expect(QueueService({ queueHttp }).getMyPlace('a/b', 'd', 'q')).resolves.toBe(place);
    expect(queueHttp.get).toHaveBeenCalledWith('queue/a%2Fb/me', {
      headers: { 'X-Device-Token': 'd', 'X-Queue-Token': 'q' },
    });
  });

  it('leaves the queue with the device and queue tokens', async () => {
    const response = { data: undefined, status: 204 };
    queueHttp.delete.mockResolvedValue(response);
    await expect(QueueService({ queueHttp }).leaveQueue('evt/1', 'dev-1', 'q-1')).resolves.toBe(response);
    expect(queueHttp.delete).toHaveBeenCalledWith('queue/evt%2F1/me', {
      headers: { 'X-Device-Token': 'dev-1', 'X-Queue-Token': 'q-1' },
    });
  });
});
