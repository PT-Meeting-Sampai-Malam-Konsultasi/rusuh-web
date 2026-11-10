/**
 * Mock scenarios, picked with `?mock=<name>` on any page (kept for the tab in sessionStorage, `?mock=ok` resets).
 * Lets QA see every state without a backend.
 */
export const MOCK_SCENARIOS = [
  'ok',
  'empty',
  'sold_out',
  'slow',
  'error',
  'offline',
  'admission_invalid',
  'stream_off',
  /** FR-08: a new number joins 20 places back, so the turn comes in seconds. */
  'near_front',
  /** FR-07/09: a new number joins 12.000 places back: a long wait estimate, slow polling, no stream. */
  'far_back',
  /** FR-05: nobody ahead, so the buyer goes straight to the order page. */
  'no_queue',
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const MOCK_SCENARIO_KEY = 'rusuh.mock';

const isScenario = (value: string | null): value is MockScenario =>
  value !== null && (MOCK_SCENARIOS as readonly string[]).includes(value);

/** The scenario from the URL wins, then the saved one, then `ok`. */
export function resolveScenario(search: string, saved: string | null): MockScenario {
  const fromUrl = new URLSearchParams(search).get('mock');
  if (isScenario(fromUrl)) return fromUrl;
  return isScenario(saved) ? saved : 'ok';
}
