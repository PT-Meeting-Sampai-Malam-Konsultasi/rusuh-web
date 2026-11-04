import type { HttpHandler } from 'msw';

import type { MockContext } from './shared';

/** Every mocked API area. Features add their handler factory here (catalog, queue, auth, booking, payment, ticket). */
const HANDLER_FACTORIES: Array<(context: MockContext) => HttpHandler[]> = [];

export const createHandlers = (context: MockContext) => HANDLER_FACTORIES.flatMap((factory) => factory(context));
