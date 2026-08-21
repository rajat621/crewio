// Per-resource cache strategy (Step 5 implementation - see
// CACHE_STRATEGY.md for the rationale behind each choice). Hooks spread
// this into their useQuery/useMutation options instead of hardcoding
// staleTime/gcTime per hook, so the policy for a resource lives in one
// place.
//
// invalidateOn event names are cross-checked against socketBridge.js's
// socketEventMap, the actual executable source of truth for socket
// events - audit found these two files had drifted: this file previously
// referenced several event names (notification:created, company:updated,
// invoice:generated, attendance:updated, chat:updated) that don't exist
// anywhere in the real backend/frontend event vocabulary (verified by
// grep, same check already applied to socketBridge.js earlier but never
// re-applied here). Corrected below to the real event names only; a
// resource with no real live-update event today lists an empty array
// rather than a fictional placeholder.
export const cacheConfig = {
  employees: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    invalidateOn: ['employee:assigned', 'employee:unassigned', 'employee:site_finished'],
  },
  attendance: {
    // Changes constantly during work hours (check-in/out events) - short
    // staleTime so a manual navigation back to the page doesn't show
    // minutes-old data, but still short-circuits truly duplicate
    // near-simultaneous requests.
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    invalidateOn: [
      'employee:checked_in', 'employee:started_work', 'employee:stopped_work',
      'employee:leave_started', 'employee:leave_ended', 'employee:site_finished',
    ],
  },
  notifications: {
    // Bell/list content isn't time-critical the way attendance is, and
    // socket events already push live updates - a longer staleTime avoids
    // redundant background refetches on every window focus. No dedicated
    // "notification created" socket event exists (verified) - dashboard
    // notifications piggyback on the same lifecycle events attendance
    // uses (see lifecycle.service.js's notifyDashboard flow, and
    // socketBridge.js's comment on the same finding).
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    invalidateOn: [
      'employee:checked_in', 'employee:started_work', 'employee:stopped_work',
      'employee:leave_started', 'employee:leave_ended',
      'employee:assigned', 'employee:unassigned', 'employee:site_finished',
    ],
  },
  companies: {
    // Company records change rarely - long staleTime, matches the
    // existing limit:500 "fetch once, treat as mostly-static" pattern
    // already used in Employees.jsx/Home.jsx/Company.jsx. No socket event
    // exists for company updates today (verified) - empty array, not a
    // placeholder event name.
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    invalidateOn: [],
  },
  invoices: {
    // Financial records - correctness matters more than avoiding a
    // refetch. Short staleTime, no aggressive caching. No socket event
    // exists for invoice generation today (verified) - empty array.
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    invalidateOn: [],
  },
  salary: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    invalidateOn: [],
  },
  dashboard: {
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    invalidateOn: [
      'employee:checked_in', 'employee:started_work', 'employee:stopped_work',
      'employee:leave_started', 'employee:leave_ended',
      'employee:assigned', 'employee:unassigned', 'employee:site_finished',
    ],
  },
  chat: {
    // Live by nature (socket-pushed) - very short staleTime, cache exists
    // mainly to dedupe concurrent mounts, not to avoid refetches.
    staleTime: 5_000,
    gcTime: 2 * 60_000,
    invalidateOn: ['chat:message', 'chat:read'],
  },
}
