# React Query Cache Strategy

Backs `src/config/cacheConfig.js`. This documents *why* each resource has the
values it has — the config file is the source of truth values pull from at
runtime; this is the reasoning, kept alongside it so the two don't drift.

| Resource | staleTime | gcTime | Invalidate strategy | Optimistic? | Notes |
|---|---|---|---|---|---|
| **Employees** | 30s | 5min | `invalidateQueries` on employee lifecycle socket events | Not yet — see `OPTIMISTIC_UPDATES.md` | Matches the existing `limit:500` "load once per session" pattern already in use across `Employees.jsx`/`Home.jsx`/`Company.jsx`. |
| **Attendance** | 10s | 5min | `invalidateQueries` on every lifecycle socket event (check-in/out, leave, site-finished) | No — see unsafe list | Changes constantly during work hours; short `staleTime` so re-navigating to the page doesn't show stale minutes-old data, while still deduping truly-simultaneous requests. |
| **Notifications** | 60s | 5min | `invalidateQueries` on the employee lifecycle events (no dedicated "notification created" event exists — dashboard notifications piggyback on the same events attendance uses) | Read status only (see doc) | Socket already pushes live updates for new notifications; a long `staleTime` avoids a redundant background refetch on every window focus when nothing actually changed. |
| **Companies** | 5min | 15min | none — no socket event exists for company updates today | No | Company records change rarely — the longest `staleTime` of any resource, intentionally. |
| **Invoices** | 15s | 5min | none — no socket event exists for invoice generation today | **Never** | Financial correctness outranks avoiding a refetch. |
| **Salary** | 30s | 5min | manual invalidation on mutation (no live socket event today) | **Never** | Payroll data — same reasoning as Invoices. |
| **Dashboard** | 30s | 2min | `invalidateQueries` on the employee lifecycle events | No | Aggregate view — short `gcTime` since it's rarely worth keeping cached when the user navigates away. |
| **Chat** | 5s | 2min | `invalidateQueries`/`setQueryData` on `chat:message`/`chat:read` | No | Live by nature; cache exists mainly to dedupe concurrent mounts of the same conversation, not to reduce refetch frequency. |

## Cache key hierarchy

`[resource]` → `[resource, 'list']` → `[resource, 'list', filters]` → `[resource, 'detail', id]`

Invalidating `[resource]` (the `all` key) invalidates every list and detail
query for that resource — the broad hammer, used when a change could affect
anything (e.g. an employee reassignment touching both the list and that
employee's detail view). Invalidating `[resource, 'list']` (via `lists()`)
only affects list views, leaving cached detail queries alone — used when a
mutation only changes list-level data (e.g. a filter-affecting field).

## Retry policy

Global default (from `queryClient.js`): 2 retries with exponential backoff,
capped at 10s. **Mutations default to 0 retries** — a retried "create
employee" or "check in" could double-submit. Per-mutation opt-in only, and
only for genuinely idempotent operations (documented per-mutation, not
assumed).
