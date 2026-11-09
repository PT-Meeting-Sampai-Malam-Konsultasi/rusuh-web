import { ROUTES } from '@utils/constants/routes';

/** Where sign-in returns to: a same-site path from `?next=`, otherwise Home (never `//host` or `/\host`). */
export function safeNextPath(raw: string | null | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return ROUTES.HOME;
  return value;
}

/** The event the buyer returns to (`/queue?event=…`, `/order?event=…`), or null. */
export function eventIdFromPath(path: string): string | null {
  const query = path.indexOf('?');
  if (query === -1) return null;
  const id = new URLSearchParams(path.slice(query + 1)).get('event')?.trim();
  return id ? id : null;
}

export type LoginReturn = 'queue' | 'order' | 'other';

/** Which screen sign-in returns to, for the submit label ("Lanjut ke antrian"). */
export function loginReturnOf(path: string): LoginReturn {
  const route = path.split(/[?#]/)[0];
  if (route === ROUTES.QUEUE) return 'queue';
  if (route === ROUTES.ORDER) return 'order';
  return 'other';
}

/** Seconds left of a server-given duration, counted from when the answer arrived. Never below 0. */
export function secondsLeft(durationSeconds: number, receivedAtMs: number, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - receivedAtMs) / 1000;
  return Math.max(0, Math.ceil(durationSeconds - elapsed));
}
