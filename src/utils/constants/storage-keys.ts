/**
 * Keys for the small values kept in localStorage. Never store access, refresh or admission tokens, NIKs or personal
 * data here. The device and queue tokens are allowed: they name an anonymous place, and ADR-0003 keeps them so a
 * refresh, a new tab or a restart keeps the same place.
 */
export const STORAGE_KEYS = {
  LANGUAGE: 'rusuh.lang',
  DEVICE_TOKEN: 'rusuh.device',
  /** Followed by the event id. */
  QUEUE_PLACE_PREFIX: 'rusuh.queue.',
} as const;
