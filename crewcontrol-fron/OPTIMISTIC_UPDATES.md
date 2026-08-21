# Optimistic Update Rules

Which mutations are safe to apply optimistically (update the UI before the
server confirms) versus which must wait for a real response. Grounded in
what each operation actually does in this codebase, not a generic list.

## Safe for optimistic updates

- **Notification read status** (`markNotificationRead`, `markAllNotificationsRead`)
  — toggling `read: true` client-side is trivially reversible and has no
  side effects if it turns out to fail; worst case a badge count is off by
  one for a moment.
- **Employee assign / unassign / reactivate** — verified against the actual
  backend controllers (`employee.controller.js`), each of these sets a
  *fixed literal* payload, not a computed one: assign always sets exactly
  `{company, lifecycleState:'ASSIGNED', assignedStatus:'on-site'}`, unassign
  always sets exactly `{company:null, lifecycleState:'WAITING_FOR_COMPANY',
  assignedStatus:'on-hold'}`, reactivate always sets exactly
  `{assignedStatus:'on-site', lifecycleState:'ASSIGNED'}`. Because the
  result is deterministic and known ahead of time (not guessed), the
  frontend can predict it exactly and roll back cleanly if the server
  rejects the request (e.g. reactivate's `assignedStatus !== 'site-over'`
  precondition). Implemented in `hooks/mutations/useEmployeeMutations.js`.
  **This supersedes this doc's earlier draft**, which flagged
  assign/unassign as unsafe based on general multi-field-consistency
  caution before the actual backend payloads had been checked — the
  caution was reasonable without verification, but wrong once verified.
  The lesson generalizes: "safe" here specifically means *deterministic and
  verified*, not just "looks like a simple status toggle."
- **Archive/soft-delete style toggles** where the underlying record isn't
  destroyed, just hidden — reversible by definition.

## Unsafe — never apply optimistically

- **Attendance check-in/check-out** — this is a real-world timestamp
  recorded server-side (`Attendance` documents, per the backend work
  earlier this engagement); showing an optimistic "checked in at 9:02"
  that doesn't match what the server actually recorded is worse than a
  brief loading state.
- **Payroll / salary processing** (`salarySlip.controller.js`) — financial
  data. Never show a number before the server has actually computed it.
- **AI extraction** (`ai.controller.js`, `invoiceDraft.controller.js`) —
  the whole point is the server needs to actually process a document;
  there's no meaningful "optimistic" version of an extraction result.
- **Invoice generation** — financial document, same reasoning as payroll.
- **Document upload** — the UI can show upload *progress* (that's real,
  not optimistic), but not a "successfully uploaded" state before the
  server confirms the file actually landed in R2 and the `FileRecord` was
  created.
- **Authentication** (login, refresh, logout) — there is no safe
  "optimistic login."

## Implementation

`useApiMutation` (`src/hooks/mutations/useApiMutation.js`) supports optimistic
updates via `optimisticUpdate`/`rollback`, but they're **opt-in per mutation**
— nothing forces every mutation through the optimistic path, and the default
(no `optimisticUpdate` provided) is a normal wait-for-response mutation. Per
Step 10's explicit instruction, this task builds the *capability*, not a
blanket policy — each future page migration decides per-mutation, checked
against the table above before enabling it.
