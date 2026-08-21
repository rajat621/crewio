// Query key factories (Step 7 expansion). Every module follows the same
// shape: all -> lists() -> list(filters) -> detail(id), plus
// stats()/summary()/search() where that resource actually has such an
// endpoint. Only resources with a real, verified api/*.js module get keys
// here - no speculative scaffolding for resources (e.g. "Projects",
// "Documents") that don't exist as a concept in this frontend today.
//
// Centralized so a socket handler, a mutation's invalidation, or a future
// hook never hardcodes a key array inline - every consumer imports from
// here, so a key shape only ever needs to change in one place.
//
// Backward compatible with the original 3-resource version: `all`/`list`
// shapes are unchanged, so useEmployees.js and Employees.jsx's existing
// queryKeys.employees.all / .list({page,limit}) calls are unaffected.

const makeResourceKeys = (resource) => ({
  all: [resource],
  lists: () => [resource, 'list'],
  list: (filters = {}) => [resource, 'list', filters],
  detail: (id) => [resource, 'detail', id],
});

export const queryKeys = {
  employees: {
    ...makeResourceKeys('employees'),
  },
  attendance: {
    ...makeResourceKeys('attendance'),
    // Backend still has GET /api/attendance/summary - kept here for
    // forward use even though the frontend wrapper (attendanceApi.
    // getAttendanceSummary) was removed as dead code (zero callers).
    summary: (filters = {}) => ['attendance', 'summary', filters],
  },
  notifications: {
    ...makeResourceKeys('notifications'),
    // getUnreadCount
    unreadCount: ['notifications', 'unreadCount'],
  },
  companies: {
    ...makeResourceKeys('companies'),
  },
  invoices: {
    ...makeResourceKeys('invoices'),
    // invoiceDraft.controller.js's draft list is a distinct resource from
    // finalized invoices, not a filter on the same one.
    drafts: {
      ...makeResourceKeys('invoiceDrafts'),
    },
  },
  salary: {
    ...makeResourceKeys('salarySlips'),
  },
  dashboard: {
    // Single-resource, no list/detail split - dashboard.controller.js's
    // fate is still an open item on the backend roadmap (Phase 1's M2),
    // so this key exists for forward use but nothing wires it up yet.
    summary: (filters = {}) => ['dashboard', 'summary', filters],
    financeSummary: (period) => ['dashboard', 'financeSummary', period],
  },
  chat: {
    ...makeResourceKeys('chat'),
  },
  companyExpenses: {
    ...makeResourceKeys('companyExpenses'),
  },
  auth: {
    // Single-resource (the current session's user) - no list/detail
    // split. AuthContext.jsx also calls authApi.getMe() directly (plain
    // Context, not React Query) - not consolidated with this key, since
    // AuthContext's session-restore timing is a separate concern from a
    // page needing an explicit, deterministic fetch (see useMe.js).
    me: () => ['auth', 'me'],
  },
  subscription: {
    // Single-resource. Not yet consumed by Subscription.jsx itself
    // (still unmigrated) - using this key now on AccountSecurity.jsx's
    // billing-status fetch means the two pages will share this cache
    // automatically once Subscription.jsx is migrated to the same key.
    status: () => ['subscription', 'status'],
  },
}
