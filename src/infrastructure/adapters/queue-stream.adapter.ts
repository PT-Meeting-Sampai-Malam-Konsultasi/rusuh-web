import type {
  QueueStreamHandlers,
  QueueStreamProtocol,
  QueueStreamTokens,
} from '@core/protocols/queue-stream.protocol';

export interface QueueStreamOptions {
  baseUrl: string;
  /** Fall back when the first event takes longer than this (a buffering proxy). */
  firstEventTimeoutMs?: number;
  /** Fall back when nothing (event or heartbeat) arrives for this long. */
  silenceTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Parses one SSE block ("event: x\ndata: {...}") into its event name and JSON payload. */
export function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) };
  } catch {
    return null;
  }
}

/** Fetch-based SSE client (EventSource cannot send the token headers), per ADR-0015. */
export function createQueueStreamAdapter(options: QueueStreamOptions): QueueStreamProtocol {
  const firstTimeout = options.firstEventTimeoutMs ?? 5000;
  const silenceTimeout = options.silenceTimeoutMs ?? 30000;
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  return {
    open(eventId: string, tokens: QueueStreamTokens, handlers: QueueStreamHandlers) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finished = false;
      let gotEvent = false;

      const stop = () => {
        finished = true;
        if (timer) clearTimeout(timer);
        controller.abort();
      };
      const fallback = (reason: Parameters<QueueStreamHandlers['onFallback']>[0]) => {
        if (finished) return;
        stop();
        handlers.onFallback(reason);
      };
      const arm = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(
          () => fallback(gotEvent ? 'silent' : 'slow_first_event'),
          gotEvent ? silenceTimeout : firstTimeout,
        );
      };

      const run = async () => {
        arm();
        let res: Response;
        try {
          res = await doFetch(`${options.baseUrl}/queue/${encodeURIComponent(eventId)}/stream`, {
            headers: {
              Accept: 'text/event-stream',
              'X-Device-Token': tokens.deviceToken,
              'X-Queue-Token': tokens.queueToken,
            },
            signal: controller.signal,
          });
        } catch {
          return fallback('connect_failed');
        }
        if (!res.ok || !res.body) return fallback('connect_failed');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            let cut = buffer.indexOf('\n\n');
            while (cut !== -1) {
              const block = buffer.slice(0, cut);
              buffer = buffer.slice(cut + 2);
              gotEvent = true;
              arm();
              const msg = parseSseBlock(block);
              if (msg?.event === 'frontier') handlers.onFrontier(msg.data);
              else if (msg?.event === 'turn') handlers.onTurn(msg.data);
              cut = buffer.indexOf('\n\n');
            }
          }
        } catch {
          return fallback('silent');
        }
        if (!finished) {
          stop();
          handlers.onClose?.();
        }
      };

      void run();
      return stop;
    },
  };
}
