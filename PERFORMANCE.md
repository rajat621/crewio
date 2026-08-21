# Performance & capacity — methodology, results, and honest gaps

## 1. Architecture (as of this pass)

Cloudflare Pages (frontend) → Railway `backend` (Express + Socket.IO) → MongoDB Atlas, Upstash Redis, Cloudflare R2. Railway `ai-services` (Flask/gunicorn) for OCR/Gemini extraction. Two BullMQ consumers (`invoice-approval-worker`, `ai-extraction-worker`) exist in code (`backend/src/workers/`) but as of this pass are **not deployed as Railway services** — see `DEPLOYMENT.md`. They were run **locally** for this testing pass, connected to the real Redis/Mongo, to make the queues functionally testable.

## 2. Tested topology (this pass)

**Not the production topology.** Everything below ran against:
- `backend` API: local Node process (`npm run dev`), same machine as the load generator (k6).
- `invoice-approval-worker` and `ai-extraction-worker`: local Node processes, same machine.
- MongoDB: real Atlas cluster (same one production uses — confirmed no separate staging DB exists).
- Redis: real Upstash instance (same as production).
- Load generator: k6, single machine, single IP, not distributed.

This setup can prove **correctness** (do the fixes work, do the queues get consumed, does the rate limiter behave) but **cannot** prove Railway's actual container capacity — a local Node process on a developer laptop has different CPU/RAM/network characteristics than a Railway container, and a single-machine k6 run cannot generate genuinely distributed 1,000-concurrent-user traffic. See §9 for what a valid capacity test requires.

## 3. Load-test suite

`load-tests/` — k6 scenarios (`smoke`, `api`, `dashboard`, `attendance`, `invoices`, `ai`, `mixed-workload`) plus one Node script (`realtime.js`, using `socket.io-client` since Socket.IO isn't raw WebSocket). All hit real endpoints through real auth middleware — no bypass. See `load-tests/README.md` for exact usage and required env vars.

## 4. What was actually run, and results

### Phase 0 — deployment verification
- Confirmed via Railway dashboard: only `backend` and `ai-services` exist as services. **Workers are still not deployed** (this was already known from the prior phase; re-confirmed here).
- Confirmed `backend`'s latest deployment (including this pass's earlier fixes, pushed by the user) is `ACTIVE`/`Online` on Railway — it booted successfully, which itself proves the new Redis fail-fast check didn't false-positive in production.
- Started both workers **locally** against the real Redis/Mongo. Both logged `worker_started` immediately (`invoice-approval-jobs`, `ai-extraction-jobs`) — first time either queue has ever had a live consumer.

### Phase 4 — smoke test (10 VUs, 2 min), BEFORE any fixes this phase
```
checks_succeeded: 6.41% (179/2790)
health: 9% success | dashboard: 0% success | employees: 9% success
```
Root cause investigation (not assumption) found **two distinct real bugs**, not one:

**Bug 1 (real, fixed): `apiLimiter` (global rate limit) was far too tight.** 300 req/15min per IP was exhausted by just 10 concurrent VUs in under a minute. This isn't a load-test artifact — it reproduces exactly what happens when multiple real users share one IP (office NAT, mobile carrier). Fixed: raised to 2000/15min, made env-configurable (`API_RATE_LIMIT_MAX`) — see `backend/src/middleware/rateLimiters.js`.

**Bug 2 (test-script bug, not a backend bug): `/api/dashboard/summary` requires `from`/`to` query params** (`dashboard.controller.js:71-73`) — the load-test script was calling it without them, producing 400s that were being masked by the concurrent 429s from Bug 1. Fixed the test scripts to send a 35-day range, matching `useDashboardData.js`'s real frontend usage.

### Smoke test AFTER both fixes (same 10 VUs, 2 min)
```
checks_succeeded: 93.77% (all 3 endpoints ~93% each)
http_req_failed: 6.23%
```
Remaining ~6% failure is the same rate-limit ceiling being approached near the end of the 2-minute run at this request rate (2133 requests against a 2000/15min budget) — a real, understood, bounded limit, not a functional defect.

### 50 VU API load test (1 min, `api.js`, mixed weighted reads across 9 endpoints)
```
http_req_failed: 0.00% (0/1377)
http_req_duration: avg 1.65s | p90 2.9s | p95 3.32s | max 5.08s
```
Zero errors, but latency is high — **this is local-machine resource contention** (single laptop running the Node API, both workers, MongoDB driver, and the k6 load generator simultaneously), not necessarily a backend inefficiency. This number must NOT be read as "the API takes 1.6s average" for production capacity purposes; it needs to be re-measured against the actual Railway container with a load generator running elsewhere.

### Worker stability
Both local workers ran for ~45 minutes total during this session with no crash, no restart, stable `worker_started` state. This is a weak, short-duration stability signal, not the 30-60 minute dedicated soak test the brief calls for.

## 5. What was NOT executed, and exactly why

| Not executed | Why | What's needed to run it |
|---|---|---|
| Progressive 100→1,000 VU ladder against Railway | Would require pointing load generator at the real Railway URL with the real worker services deployed, and ideally distributed load generation (not one laptop) to avoid the load generator itself being the bottleneck | Deploy the 2 worker services (`DEPLOYMENT.md`), then `k6 run -e BASE_URL=https://<railway-url> -e VUS=100 load-tests/scenarios/api.js`, repeating up the ladder |
| Socket.IO multi-replica adapter proof | Only one `backend` replica exists on Railway | Scale `backend` to 2 replicas on Railway, then run `load-tests/scenarios/realtime.js` against the Railway URL and confirm cross-replica event delivery |
| Distributed rate-limit proof across replicas | Same - only one replica | Same as above; hit the API from 2+ distinct source IPs while replicas=2 and confirm the shared Redis counter, not per-replica |
| Invoice concurrent-approval load test | No pre-existing `'ready'` draft was provisioned in the time available (draft creation requires a real, costed AI/Gemini call) | Create one draft via the real UI, then `k6 run -e TEST_DRAFT_ID=... --vus 20 --iterations 20 load-tests/scenarios/invoices.js` |
| AI/PDF concurrency ladder (5→50) | Same reason - needs a pre-uploaded `FileRecord`, and each run has real Gemini cost | Upload one PDF via `/api/upload`, then run `load-tests/scenarios/ai.js` progressively per `README.md` |
| Attendance duplicate-check-in spike test | No synthetic test employees (with known passwords, assigned to a company) were provisioned in the time available | Create N test employees via the app, assign them, set `TEST_EMPLOYEE_IDS`/`TEST_EMPLOYEE_PASSWORD`, run `load-tests/scenarios/attendance.js` |
| 30-60 min memory-leak soak test | Time-boxed session; only ~45 min of incidental worker uptime observed | `HOLD_DURATION_MS=3600000 node load-tests/scenarios/realtime.js` alongside a sustained `api.js` run, watching RSS over the full hour |
| MongoDB Atlas real-time metrics during load (connections, CPU, slow query log) | Didn't have the Atlas dashboard open during the local runs | Open Atlas → Metrics during any future run, cross-reference timestamps |
| `explain()` plans on the new indexes against real data volume | Time-boxed | `db.collection.find(...).explain('executionStats')` for the query shapes in the previous phase's index-additions list |

## 6. Bottlenecks found and fixed this pass

| Component | Symptom | Root cause | Evidence | Fix | Before | After |
|---|---|---|---|---|---|---|
| `apiLimiter` | 93.6% of smoke-test requests failed | 300 req/15min per-IP budget exhausted by 10 concurrent VUs (or, in reality, any shared-IP burst) | k6 run output, confirmed via direct `curl` returning the limiter's own message | Raised to 2000/15min, env-configurable | 6.41% success | 93.77% success |

No other P0/P1 bottleneck was newly discovered against the workload actually exercised (moderate concurrency, read-heavy). Higher-concurrency phases were not executed (§5), so this is not evidence that none exist at 500-1,000 concurrent users — only that none were found in what was actually run.

## 7. Recommended Railway resources

**Not re-derived from measured Railway-hosted data this pass** (only local numbers exist). Carrying forward the previous phase's directional guidance until real Railway-hosted measurements exist:
- `backend`: start with Railway's default sizing, horizontally scale replicas once Socket.IO adapter + Redis rate-limiting are confirmed working across replicas (§5).
- Workers: 1 replica each to start, `concurrency: 4` (current default) — re-tune based on real queue-depth/throughput data (`getJobCounts` now exposed at `/health`).
- MongoDB Atlas: check current tier's connection limit against `(backend replicas + worker replicas) × maxPoolSize (50 default)` before scaling replica count.

## 8. Safe capacity

**NOT DETERMINED.** No test in this pass reached a failure ceiling against the real Railway deployment - the only failure ceiling found (the rate limiter) was against a local process and has already been fixed. Do not infer a SAFE/WARNING/HARD LIMIT number from this pass; §5's remaining tests are what would produce one.

## 9. Recommended next load test

1. Deploy the 2 worker services (`DEPLOYMENT.md`) - blocks the invoice/AI portions of any further test.
2. Provision test data per §5's table (synthetic employees, one invoice draft, one uploaded PDF).
3. Run `load-tests/scenarios/api.js` against the real Railway `BASE_URL`, progressively: 10→25→50→100→250→500→750→1000, watching Railway's Metrics tab + Atlas Metrics + Upstash console at each step, stopping the ladder at the first stage showing a real error-rate or latency cliff.
4. Only then run the realtime, invoice, AI, and attendance scenarios at meaningful scale.
5. Consider a genuinely distributed load generator (k6 Cloud, or multiple machines) before trusting numbers above ~100-250 concurrent - a single machine's network stack/CPU can itself become the bottleneck at high VU counts, producing numbers that look like a server-side ceiling but aren't.
