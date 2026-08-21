# Load-testing suite

Real k6 (+ one Node script for Socket.IO) scenarios against the real API,
real auth middleware, real tenant isolation. No endpoint is invented and no
authentication is bypassed - see `../PERFORMANCE.md` for the methodology
this suite implements and the results it produced.

## Setup

```bash
cd load-tests
npm install          # only needed for the Socket.IO scenario (socket.io-client)
```

Install k6 separately (not an npm package): https://k6.io/docs/get-started/installation/
On Windows: `winget install GrafanaLabs.k6`.

## Required environment variables

| Variable | Used by | How to get it |
|---|---|---|
| `BASE_URL` | everything | Your backend's URL, e.g. `https://backend-production-7fe0.up.railway.app`. Defaults to `http://localhost:5000`. |
| `TEST_OWNER_JWT_TOKEN` | `api.js`, `dashboard.js`, `mixed-workload.js`, `invoices.js` | Owner/admin login requires a live OTP, which can't be scripted safely. Log into the app once as your test owner account, open DevTools → Network, find any authenticated API call, copy the `Authorization: Bearer <token>` value. Valid for `JWT_EXPIRE` (default 7 days). |
| `TEST_EMPLOYEE_IDS` | `attendance.js`, `mixed-workload.js` | Comma-separated employee login IDs (the `employeeId`/`appUserId` field, not the Mongo `_id`) for a small pool of **synthetic test employees** you create ahead of time. They must be assigned to a company (`assignedStatus: 'on-site'`) for check-in to succeed. |
| `TEST_EMPLOYEE_PASSWORD` | same as above | The shared app password you set for those synthetic employees. |
| `TEST_DRAFT_ID` / `TEST_DRAFT_VERSION` | `invoices.js` | A real `InvoiceDraft` in `'ready'` status. Create one manually through the app once (upload a timesheet, let it extract), then read its id/`__v` via `GET /api/invoices/drafts/:id`. |
| `TEST_PDF_PATH` | `ai.js` | A `FileRecord.path` for an already-uploaded PDF (`POST /api/upload` once, use the returned path). |

Nothing in this suite has a hard-coded credential, ID, or production URL -
every one of the above is read from `__ENV`/`process.env` with only a
`localhost` fallback for `BASE_URL`.

## Running

```bash
# Always start here.
npm run loadtest:smoke

# Progressive API load (Phase 3/5) - run these in order, watching your
# infra metrics (Railway dashboard, MongoDB Atlas metrics, Upstash metrics)
# between each step. Do not jump straight to 1000.
npm run loadtest:api:10
npm run loadtest:api:25
npm run loadtest:api:50
npm run loadtest:api:100
npm run loadtest:api:250
npm run loadtest:api:500
npm run loadtest:api:750
npm run loadtest:api:1000

# Dashboard-specific stress (Phase 6)
npm run loadtest:dashboard
# or with a specific VU count:
k6 run -e VUS=250 scenarios/dashboard.js

# Attendance spike / duplicate check-in safety (Phase 7)
npm run loadtest:attendance
# or:
k6 run -e VUS=250 -e DURATION=2m scenarios/attendance.js

# Mixed realistic traffic (owner dashboard + employee mobile, concurrently)
npm run loadtest:mixed
# or:
k6 run -e OWNER_VUS=700 -e EMPLOYEE_VUS=300 -e DURATION=5m scenarios/mixed-workload.js

# Socket.IO connection test (Phase 8) - Node script, not k6, see the file's
# header comment for why.
TARGET_CONNECTIONS=250 HOLD_DURATION_MS=600000 npm run loadtest:realtime

# Invoice concurrency correctness test (Phase 10) - small, fixed VU count,
# not a throughput test. Run this LAST among invoice tests, and verify
# exactly one Invoice was created afterward (see the script's footer comment).
k6 run -e TEST_DRAFT_ID=... -e TEST_DRAFT_VERSION=0 --vus 20 --iterations 20 scenarios/invoices.js

# AI/PDF concurrency test (Phase 12) - COSTS REAL MONEY (Gemini API calls).
# Run with small, explicit, progressively increasing counts. Never as part
# of a combined/mixed run.
k6 run -e TEST_PDF_PATH=... -e VUS=5 -e ITERATIONS=5 scenarios/ai.js
k6 run -e TEST_PDF_PATH=... -e VUS=10 -e ITERATIONS=10 scenarios/ai.js
# ...continue only if the previous step's error rate and AI-service metrics look healthy.
```

## What this suite deliberately does NOT do

- **Does not bypass authentication, authorization, or tenant isolation.** Every request goes through the real JWT middleware.
- **Does not use a super-admin shortcut.** Owner-scoped tests use a real owner token; employee-scoped tests use a real employee login.
- **Does not hardcode any credential, ID, or environment URL.**
- **Does not run the AI scenario as part of any combined workload** - it has real external cost and is invoked deliberately, alone, with an explicit iteration cap.
- **Does not attempt a full draft-creation-through-approval flow per iteration** in `invoices.js` - draft creation involves a real AI extraction call; the concurrency test reuses one pre-existing draft instead, which is the actual thing under test (the approval race), not extraction throughput.

## Interpreting results

k6's own summary (printed at the end of every run) has the specific numbers
you need for the results table format used in `PERFORMANCE.md`: look for
`http_req_duration` (p50/p95/p99 are broken out automatically), `http_req_failed`
(error rate), and the custom counters each scenario defines (e.g.
`rate_limited_429`, `double_checkin_INCORRECTLY_allowed_200` - that one
should always read 0).

Cross-reference with, at minimum:
- Railway's per-service Metrics tab (CPU/RAM) for `backend` and `ai-services`, during the run.
- MongoDB Atlas's Metrics tab (connections, operations/sec, query targeting) during the run.
- Upstash's console (commands/sec, memory) during the run.

k6 alone only tells you what the CLIENT observed (latency, status codes).
The infra metrics are what tell you WHY, and are not captured by k6 itself -
this suite doesn't attempt to scrape them programmatically; take a screenshot
or note the numbers manually against the timestamp of each run.
