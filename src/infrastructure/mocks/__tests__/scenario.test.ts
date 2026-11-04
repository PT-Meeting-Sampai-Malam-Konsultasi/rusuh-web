import { describe, expect, it } from 'vitest';

import { resolveScenario } from '../scenario';

describe('resolveScenario', () => {
  it('prefers the URL, then the saved scenario, then ok', () => {
    expect(resolveScenario('?mock=empty', 'error')).toBe('empty');
    expect(resolveScenario('', 'error')).toBe('error');
    expect(resolveScenario('?mock=ok', 'error')).toBe('ok');
    expect(resolveScenario('', null)).toBe('ok');
  });

  it('ignores unknown names', () => {
    expect(resolveScenario('?mock=chaos', 'nope')).toBe('ok');
  });
});
