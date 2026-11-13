import type { HttpHandler } from 'msw';

import { authHandlers } from './auth.handlers';
import { bookingHandlers } from './booking.handlers';
import { catalogHandlers } from './catalog.handlers';
import { queueHandlers } from './queue.handlers';
import { createMockBookingStore } from './mock-booking-store';
import { createMockQueueState } from './mock-queue-state';
import type { MockContext, MockHandlerContext } from './shared';

/** Every mocked API area. Features add their handler factory here (queue, auth, booking, payment, ticket). */
const HANDLER_FACTORIES: Array<(context: MockHandlerContext) => HttpHandler[]> = [
  catalogHandlers,
  queueHandlers,
  authHandlers,
  bookingHandlers,
];

/**
 * One mock queue state and booking store per call: `server.resetHandlers(...createHandlers(…))` in tests starts a fresh
 * queue and no bookings.
 */
export const createHandlers = (context: MockContext) => {
  const shared: MockHandlerContext = {
    ...context,
    queueState: createMockQueueState(),
    bookingStore: createMockBookingStore(),
  };
  return HANDLER_FACTORIES.flatMap((factory) => factory(shared));
};
