import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredQueuePlace } from '@core/protocols/queue-place-store.protocol';

import { EndOrderWindowUseCase } from '../end-order-window.use-case';

const PLACE: StoredQueuePlace = { queueToken: 'queue-token', seq: 19700, joinedServed: 18452 };
const OTHER: StoredQueuePlace = { queueToken: 'queue-token-2', seq: 42, joinedServed: 10 };

describe('EndOrderWindowUseCase', () => {
  const admissions = new Map<string, string>();
  const places = new Map<string, StoredQueuePlace>();
  const admissionStore = {
    get: vi.fn((eventId: string) => admissions.get(eventId) ?? null),
    set: vi.fn((eventId: string, token: string | null) => {
      if (token === null) admissions.delete(eventId);
      else admissions.set(eventId, token);
    }),
  };
  const queuePlaceStore = {
    get: vi.fn((eventId: string) => places.get(eventId) ?? null),
    set: vi.fn((eventId: string, place: StoredQueuePlace) => void places.set(eventId, place)),
    remove: vi.fn((eventId: string) => void places.delete(eventId)),
  };
  const useCase = EndOrderWindowUseCase({ admissionStore, queuePlaceStore });

  beforeEach(() => {
    vi.clearAllMocks();
    admissions.clear();
    places.clear();
    admissions.set('evt_samudra', 'adm_1');
    places.set('evt_samudra', PLACE);
  });

  it('forgets the admission token and the queue place of the event', () => {
    expect(useCase.execute('evt_samudra')).toEqual({ kind: 'ended' });
    expect(admissionStore.set).toHaveBeenCalledTimes(1);
    expect(admissionStore.set).toHaveBeenCalledWith('evt_samudra', null);
    expect(queuePlaceStore.remove).toHaveBeenCalledTimes(1);
    expect(queuePlaceStore.remove).toHaveBeenCalledWith('evt_samudra');
    expect(admissions.has('evt_samudra')).toBe(false);
    expect(places.has('evt_samudra')).toBe(false);
  });

  it('leaves other events untouched', () => {
    admissions.set('evt_pelita', 'adm_2');
    places.set('evt_pelita', OTHER);
    useCase.execute('evt_samudra');
    expect(admissions.get('evt_pelita')).toBe('adm_2');
    expect(places.get('evt_pelita')).toEqual(OTHER);
  });

  it('answers synchronously, not with a promise', () => {
    const result = useCase.execute('evt_samudra');
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ kind: 'ended' });
  });

  it('is safe to repeat, and to call with nothing stored', () => {
    expect(useCase.execute('evt_samudra')).toEqual({ kind: 'ended' });
    expect(useCase.execute('evt_samudra')).toEqual({ kind: 'ended' });
    expect(admissions.has('evt_samudra')).toBe(false);
    expect(places.has('evt_samudra')).toBe(false);
    expect(() => useCase.execute('evt_unknown')).not.toThrow();
    expect(useCase.execute('evt_unknown')).toEqual({ kind: 'ended' });
  });

  it('never reads either store', () => {
    useCase.execute('evt_samudra');
    expect(admissionStore.get).not.toHaveBeenCalled();
    expect(queuePlaceStore.get).not.toHaveBeenCalled();
  });

  it('lets a storage failure propagate unchanged', () => {
    const error = new Error('storage');
    queuePlaceStore.remove.mockImplementationOnce(() => {
      throw error;
    });
    expect(() => useCase.execute('evt_samudra')).toThrow(error);
  });
});
