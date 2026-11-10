/** TanStack Query keys. Features add theirs here; keep one key per resource. */
export const QUERY_KEYS = {
  EVENTS: 'events',
  EVENT: 'event',
  CATEGORIES: 'categories',
  QUEUE_PLACE: 'queue-place',
  QUEUE_FRONTIER: 'queue-frontier',
  QUEUE_TURN: 'queue-turn',
  QUEUE_CLAIM: 'queue-claim',
  ME: 'me',
} as const;
