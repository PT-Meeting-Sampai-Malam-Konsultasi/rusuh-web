import { describe, expect, it } from 'vitest';

import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';
import type { JoinQueueResult } from '@core/use_case/queue/join-queue.use-case';

import { findHomeEvent, formatCountdown, queueStatusFor } from '../queue';

const t = ((key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params)}`) as never;

const joined = (state: 'preopen' | 'open' | 'paused' | 'closed', seq: number | null = 10): JoinQueueResult => ({
  kind: 'joined',
  resumed: false,
  place: {
    eventId: 'e',
    state,
    seq,
    served: 1,
    joinedServed: 1,
    position: 9,
    progress: 0,
    opensAt: null,
    turnExpiresAt: null,
    serverNow: '2026-11-09T03:00:00Z',
  },
});

describe('queueStatusFor', () => {
  it('maps the join answer to the view', () => {
    expect(queueStatusFor(false, undefined, false)).toBe('no-event');
    expect(queueStatusFor(true, undefined, false)).toBe('joining');
    expect(queueStatusFor(true, undefined, true)).toBe('error');
    expect(queueStatusFor(true, joined('open'), false)).toBe('waiting');
    expect(queueStatusFor(true, joined('open', null), false)).toBe('prequeue');
    expect(queueStatusFor(true, joined('preopen'), false)).toBe('prequeue');
    expect(queueStatusFor(true, joined('paused'), false)).toBe('paused');
    expect(queueStatusFor(true, joined('closed'), false)).toBe('sold-out');
    expect(queueStatusFor(true, { kind: 'elsewhere' }, false)).toBe('elsewhere');
  });

  it('keeps showing the place when a later refetch fails', () => {
    expect(queueStatusFor(true, joined('open'), true)).toBe('waiting');
  });
});

describe('findHomeEvent', () => {
  const data = { featured: { eventId: 'a' }, others: [{ eventId: 'b' }], total: 2, serverNow: '' } as HomeEvents;

  it('finds the featured event or one from the list', () => {
    expect(findHomeEvent(data, 'a')?.eventId).toBe('a');
    expect(findHomeEvent(data, 'b')?.eventId).toBe('b');
    expect(findHomeEvent(data, 'c')).toBeNull();
    expect(findHomeEvent(undefined, 'a')).toBeNull();
    expect(findHomeEvent({ ...data, featured: null }, 'b')?.eventId).toBe('b');
  });
});

describe('formatCountdown', () => {
  it('reads like a clock, and in days and hours when far away', () => {
    expect(formatCountdown(522, t)).toBe('8:42');
    expect(formatCountdown(59.9, t)).toBe('0:59');
    expect(formatCountdown(3 * 3600 + 8 * 60 + 42, t)).toBe('3:08:42');
    expect(formatCountdown(7 * 86_400 + 21 * 3600 + 30 * 60, t)).toBe('queue_countdown_days:{"days":7,"hours":21}');
    expect(formatCountdown(-5, t)).toBe('0:00');
  });
});
