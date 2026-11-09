// Pure contract for the place kept per event: the queue token for the later queue calls, and the first `served`.

export interface StoredQueuePlace {
  queueToken: string;
  seq: number | null;
  /** First `served` seen for this `seq`: the start of the progress track ("Saat Anda bergabung"). */
  joinedServed: number | null;
}

export interface QueuePlaceStoreProtocol {
  get(eventId: string): StoredQueuePlace | null;
  set(eventId: string, place: StoredQueuePlace): void;
  remove(eventId: string): void;
}
