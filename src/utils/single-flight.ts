/** Wraps an async task so calls made while it runs share the same promise (e.g. several 401s, one refresh). */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => {
    running ??= task().finally(() => {
      running = null;
    });
    return running;
  };
}
