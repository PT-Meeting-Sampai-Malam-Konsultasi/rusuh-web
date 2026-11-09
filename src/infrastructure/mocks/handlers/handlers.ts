import type { HttpHandler } from 'msw';

import { bookingHandlers } from './booking.handlers';
import { catalogHandlers } from './catalog.handlers';
import { queueHandlers } from './queue.handlers';
import type { MockContext } from './shared';

/** Every mocked API area. Features add their handler factory here (queue, auth, booking, payment, ticket). */
const HANDLER_FACTORIES: Array<(context: MockContext) => HttpHandler[]> = [
  catalogHandlers,
  queueHandlers,
  bookingHandlers,
];

export const createHandlers = (context: MockContext) => HANDLER_FACTORIES.flatMap((factory) => factory(context));
