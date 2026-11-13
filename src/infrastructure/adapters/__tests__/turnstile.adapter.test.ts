import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpRequestError } from '../http.adapter';
import {
  createDisabledTurnstile,
  createTurnstileAdapter,
  TURNSTILE_SCRIPT_URL,
  type TurnstileApi,
} from '../turnstile.adapter';

type Win = Window & { turnstile?: TurnstileApi };
type RenderOptions = Parameters<TurnstileApi['render']>[1];

const options = { siteKey: 'site', getLocale: () => 'id', slotId: 'turnstile-slot' };

describe('createTurnstileAdapter', () => {
  let rendered: { container: HTMLElement; options: RenderOptions }[];
  let api: TurnstileApi;

  beforeEach(() => {
    rendered = [];
    api = {
      render: vi.fn((container: HTMLElement, opts: RenderOptions) => {
        rendered.push({ container, options: opts });
        return `w${rendered.length}`;
      }),
      remove: vi.fn(),
    };
    (window as Win).turnstile = api;
  });

  afterEach(() => {
    delete (window as Win).turnstile;
    document.body.innerHTML = '';
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    vi.useRealTimers();
  });

  it('renders an interaction-only widget in the page slot and resolves its token', async () => {
    const slot = document.createElement('div');
    slot.id = 'turnstile-slot';
    document.body.appendChild(slot);
    const promise = createTurnstileAdapter(options).getToken('join');
    await vi.waitFor(() => expect(rendered).toHaveLength(1));
    const [{ container, options: opts }] = rendered;
    expect(slot.contains(container)).toBe(true);
    expect(opts).toMatchObject({ sitekey: 'site', action: 'join', appearance: 'interaction-only', language: 'id' });
    opts.callback?.('token-1');
    await expect(promise).resolves.toBe('token-1');
    expect(api.remove).toHaveBeenCalledWith('w1');
    expect(slot.childElementCount).toBe(0);
  });

  it('falls back to the body when the page has no slot', async () => {
    const promise = createTurnstileAdapter(options).getToken('register');
    await vi.waitFor(() => expect(rendered).toHaveLength(1));
    expect(rendered[0].container.parentElement).toBe(document.body);
    rendered[0].options.callback?.('t');
    await promise;
  });

  it.each(['error-callback', 'expired-callback', 'timeout-callback'] as const)(
    'rejects with VERIFICATION_UNAVAILABLE on %s',
    async (name) => {
      const promise = createTurnstileAdapter(options).getToken('join');
      await vi.waitFor(() => expect(rendered).toHaveLength(1));
      (rendered[0].options[name] as () => void)();
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpRequestError);
      expect(error).toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });
      expect(api.remove).toHaveBeenCalledWith('w1');
    },
  );

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    const promise = createTurnstileAdapter({ ...options, timeoutMs: 1000 }).getToken('join');
    const caught = promise.catch((e: unknown) => e);
    await vi.waitFor(() => expect(rendered).toHaveLength(1));
    vi.advanceTimersByTime(1000);
    await expect(caught).resolves.toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });
  });

  it('rejects when the widget cannot render', async () => {
    api.render = vi.fn(() => {
      throw new Error('bad sitekey');
    });
    await expect(createTurnstileAdapter(options).getToken('join')).rejects.toMatchObject({
      code: 'VERIFICATION_UNAVAILABLE',
    });
  });

  it('loads the Cloudflare script once, on first use', async () => {
    delete (window as Win).turnstile;
    const adapter = createTurnstileAdapter(options);
    const first = adapter.getToken('register');
    const second = adapter.getToken('join');
    const scripts = document.head.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    expect(scripts).toHaveLength(1);
    (window as Win).turnstile = api;
    (scripts[0] as HTMLScriptElement).onload?.(new Event('load'));
    await vi.waitFor(() => expect(rendered).toHaveLength(2));
    rendered[0].options.callback?.('a');
    rendered[1].options.callback?.('b');
    await expect(first).resolves.toBe('a');
    await expect(second).resolves.toBe('b');
  });

  it('reports a blocked script and tries again next time', async () => {
    delete (window as Win).turnstile;
    const adapter = createTurnstileAdapter(options);
    const first = adapter.getToken('join');
    const script = document.head.querySelector('script') as HTMLScriptElement;
    script.onerror?.(new Event('error'));
    await expect(first).rejects.toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });
    expect(document.head.querySelector('script')).toBeNull();
    void adapter.getToken('join').catch(() => undefined);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('reports a script that loads without starting Turnstile', async () => {
    delete (window as Win).turnstile;
    const promise = createTurnstileAdapter(options).getToken('join');
    (document.head.querySelector('script') as HTMLScriptElement).onload?.(new Event('load'));
    await expect(promise).rejects.toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });
  });
});

describe('createDisabledTurnstile', () => {
  it('gives an empty token without loading the script or rendering a widget', async () => {
    await expect(createDisabledTurnstile().getToken('join')).resolves.toBe('');
    expect(document.head.querySelector('script')).toBeNull();
    expect(document.body.children).toHaveLength(0);
  });
});
