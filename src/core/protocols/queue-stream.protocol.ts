// Pure contract for the Server-Sent Events stream near the front of the queue (ADR-0015).

export type QueueStreamFallbackReason = 'connect_failed' | 'slow_first_event' | 'silent';

export interface QueueStreamHandlers {
  onFrontier(data: unknown): void;
  onTurn(data: unknown): void;
  /** The stream cannot be used: go back to polling and try again later. */
  onFallback(reason: QueueStreamFallbackReason): void;
  /** The server ended the stream (e.g. the queue closed). */
  onClose?(): void;
}

export interface QueueStreamTokens {
  deviceToken: string;
  queueToken: string;
}

export interface QueueStreamProtocol {
  /** Opens the stream; returns a function that closes it. */
  open(eventId: string, tokens: QueueStreamTokens, handlers: QueueStreamHandlers): () => void;
}
