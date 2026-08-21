import { queryKeys } from '../queryKeys'

// Centralized socket -> cache mapping (Step 6). Event vocabulary below is
// the real, complete set of events the frontend actually listens for
// today (grep'd across pages/components/context, not guessed):
// employee lifecycle events (Employees.jsx, useUnreadNotifications.js,
// NotificationPopover.jsx), employee:location_update, chat:message,
// chat:read.
//
// Each entry says what to do to the cache: invalidate a key, remove a
// key, or (default) nothing. Data-driven so a page no longer decides this
// inline - it imports applySocketEvent and calls it from one socket
// listener instead of hand-writing invalidateQueries calls per event.
//
// NOT wired into any page in this task - Employees.jsx's existing
// invalidateEmployees call (from the prior batch) still works exactly as
// it does today and is intentionally left alone; adopting this bridge
// there is a trivial follow-up, not done here to stay in scope.

const ACTION = {
  INVALIDATE: 'invalidate',
  REMOVE: 'remove',
  NONE: 'none',
};

// key: socket event name
// value: { action, keys: (payload) => QueryKey[] }
const socketEventMap = {
  // Employee lifecycle - attendance-affecting. Each of these also
  // corresponds to a Notification document being created server-side
  // (see lifecycle.service.js's notifyDashboard flow) even though the
  // backend doesn't emit a separate notification-specific socket event
  // for it - confirmed by checking for one and finding none. This matches
  // what useUnreadNotifications.js already does today: it listens to
  // these same lifecycle event names to refresh the notification count,
  // not a distinct event.
  'employee:checked_in': { action: ACTION.INVALIDATE, keys: () => [queryKeys.attendance.all, queryKeys.notifications.all] },
  'employee:started_work': { action: ACTION.INVALIDATE, keys: () => [queryKeys.attendance.all, queryKeys.notifications.all] },
  'employee:stopped_work': { action: ACTION.INVALIDATE, keys: () => [queryKeys.attendance.all, queryKeys.notifications.all] },
  'employee:leave_started': { action: ACTION.INVALIDATE, keys: () => [queryKeys.attendance.all, queryKeys.notifications.all] },
  'employee:leave_ended': { action: ACTION.INVALIDATE, keys: () => [queryKeys.attendance.all, queryKeys.notifications.all] },

  // Employee lifecycle - roster-affecting (assignment/site status).
  // Payload only carries employeeId/employeeName/lifecycleState/companyId
  // (verified against backend/src/services/lifecycle.service.js) - not
  // every field the employee list/detail views read, so this invalidates
  // rather than attempting a partial setQueryData merge that could show a
  // row with some fields updated and others silently stale. Same
  // reasoning as the decision already made for Employees.jsx's own
  // handler in the prior batch.
  'employee:assigned': { action: ACTION.INVALIDATE, keys: () => [queryKeys.employees.all, queryKeys.attendance.all, queryKeys.notifications.all] },
  'employee:unassigned': { action: ACTION.INVALIDATE, keys: () => [queryKeys.employees.all, queryKeys.attendance.all, queryKeys.notifications.all] },
  'employee:site_finished': { action: ACTION.INVALIDATE, keys: () => [queryKeys.employees.all, queryKeys.attendance.all, queryKeys.notifications.all] },

  // Location - live tracking, no query cache involved (consumed directly
  // via socket payload in TrackEmployee, not through React Query) -
  // explicitly NONE rather than omitted, so the mapping is complete and
  // auditable rather than silently missing an event.
  'employee:location_update': { action: ACTION.NONE },

  // Chat - setQueryData would be the ideal (append the single new
  // message to the cached conversation) but no chat React Query hook
  // exists yet (chat isn't migrated - still context/local-state based per
  // Phase 1's audit), so there's no cache entry to update yet. Mapped to
  // NONE for now rather than invalidating a key nothing queries, which
  // would be a no-op that looks like it does something.
  'chat:message': { action: ACTION.NONE },
  'chat:read': { action: ACTION.NONE },

  // Connection lifecycle - not cache-relevant.
  connect: { action: ACTION.NONE },
  disconnect: { action: ACTION.NONE },
  connect_error: { action: ACTION.NONE },
};

// Every listed event name, for a page to register listeners against in
// one pass instead of hand-maintaining its own array (Employees.jsx and
// useUnreadNotifications.js currently each maintain their own copy of
// overlapping event lists - a future migration can replace both with
// this).
export const allMappedEvents = Object.keys(socketEventMap);

/**
 * Applies the cache effect for one socket event. Call this from a single
 * socket listener per event name; safe to call for an event not in the
 * map (falls through to NONE).
 */
export const applySocketEvent = (queryClient, eventName, payload) => {
  const entry = socketEventMap[eventName];
  if (!entry || entry.action === ACTION.NONE) return;

  const keys = entry.keys ? entry.keys(payload) : [];
  if (entry.action === ACTION.INVALIDATE) {
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  } else if (entry.action === ACTION.REMOVE) {
    keys.forEach((key) => queryClient.removeQueries({ queryKey: key }));
  }
};
