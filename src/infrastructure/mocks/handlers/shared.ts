import { delay, HttpResponse } from 'msw';

import type { MockScenario } from '../scenario';

export interface MockContext {
  coreApiUrl: string;
  queueApiUrl: string;
  getScenario: () => MockScenario;
  /** The mock is the server, so its clock is the server clock. */
  now: () => Date;
}

/** RFC 9457 problem, as the real API sends it. */
export const problem = (status: number, code: string, title: string) =>
  HttpResponse.json(
    { type: 'about:blank', title, status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

/** Shared failure scenarios for every handler; null means "answer normally". */
export async function failure(scenario: MockScenario) {
  if (scenario === 'offline') return HttpResponse.error();
  if (scenario === 'error') return problem(503, 'INTERNAL_ERROR', 'Layanan sedang gangguan');
  if (scenario === 'slow') await delay(3000);
  return null;
}
