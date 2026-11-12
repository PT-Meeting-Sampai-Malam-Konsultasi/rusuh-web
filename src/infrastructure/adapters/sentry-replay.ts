// Session Replay (rrweb) is most of the SDK's weight: a separate lazy chunk, loaded only by the sessions drawn for a
// replay, and never on the waiting room.
export { replayIntegration } from '@sentry/browser';
