// The part of the Sentry SDK every session loads (errors, web vitals), as its own lazy chunk: named exports only, so
// the bundler leaves Session Replay out of it (see sentry-replay.ts).
export {
  addBreadcrumb,
  addIntegration,
  browserTracingIntegration,
  captureException,
  getReplay,
  init,
  setTag,
  withScope,
} from '@sentry/browser';
