import { AsyncLocalStorage } from 'async_hooks';

// Node's built-in AsyncLocalStorage (no new dependency) - lets code running
// anywhere in a request's async call chain (including deep inside Mongoose
// query execution, which has no access to `req`) read the current
// requestId/traceId without prop-drilling it through every function.
//
// This does NOT replace or duplicate req.traceContext from
// requestContext.middleware.js - it carries the exact same requestId/
// traceId values, just makes them reachable from code that isn't a request
// handler. attachRequestContext (below, via app.js) is the single place a
// store is created; nothing else creates a competing one.
export const requestStore = new AsyncLocalStorage();

// Best-effort accessor - returns null outside of a request context (e.g. a
// scheduled job or the extraction worker process), never throws.
export const getRequestContext = () => requestStore.getStore() || null;
