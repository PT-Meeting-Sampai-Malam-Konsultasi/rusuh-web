import type { QueuePlaceStoreProtocol, StoredQueuePlace } from '@core/protocols/queue-place-store.protocol';
import type { StorageProtocol } from '@core/protocols/storage.protocol';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

const keyFor = (eventId: string) => `${STORAGE_KEYS.QUEUE_PLACE_PREFIX}${eventId}`;

const isNumberOrNull = (value: unknown) => value === null || typeof value === 'number';

function parse(raw: string | null): StoredQueuePlace | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { queueToken, seq, joinedServed } = value as Record<string, unknown>;
    if (typeof queueToken !== 'string' || !isNumberOrNull(seq) || !isNumberOrNull(joinedServed)) return null;
    return { queueToken, seq: seq as number | null, joinedServed: joinedServed as number | null };
  } catch {
    return null;
  }
}

/** One place per event in local storage, so a refresh or a new tab finds it (FR-10 builds on this). */
export function createQueuePlaceStore({ storage }: { storage: StorageProtocol }): QueuePlaceStoreProtocol {
  return {
    get: (eventId) => parse(storage.get(keyFor(eventId))),
    set: (eventId, place) => storage.set(keyFor(eventId), JSON.stringify(place)),
    remove: (eventId) => storage.remove(keyFor(eventId)),
  };
}
