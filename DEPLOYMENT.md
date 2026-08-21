# Railway deployment topology

This backend is **three separate long-running processes**, all built from the
same `backend/` repo root, plus one already-deployed Python service. Railway
has no single manifest for "one repo, three services with different start
commands" — each must be created as its own Railway **service** pointing at
this repo, with its own **Custom Start Command** override in that service's
Settings → Deploy tab. This document is that missing manifest.

## Why this exists

`backend/package.json` has always defined `worker:invoice-approval` and
`worker:ai` scripts. Nothing in this repo ever told Railway to run them —
only the API service (`npm start`) was ever deployed. The result: the API
enqueues invoice-approval and AI-extraction jobs into Redis/BullMQ that no
process is listening for. They sit forever until a 2-minute client-side
poll times out and rolls the draft back to `ready` (invoice approval) or
the job is left `queued` forever (extraction). See the worker source files
themselves — both start with a `bootstrap()` call that only runs when that
specific file is executed as the process entrypoint, not when the API
process merely imports the module.

## Required services (all from this same repo/root: `backend/`)

| Service | Start command | Purpose | HTTP port? |
|---|---|---|---|
| `backend` (existing) | `npm start` | REST API + Socket.IO | Yes |
| `invoice-approval-worker` (**create this**) | `npm run worker:invoice-approval` | Consumes `invoice-approval-jobs` queue | No |
| `ai-extraction-worker` (**create this**) | `npm run worker:ai` | Consumes `ai-extraction-jobs` queue | No |
| `ai-services` (existing) | `gunicorn main:app --workers 2 --threads 4 --bind 0.0.0.0:$PORT --timeout 300` (from `ai-services/nixpacks.toml`) | AI/OCR extraction HTTP service | Yes |

### Creating each worker service in Railway

1. In the `appealing-dream` project, **New → GitHub Repo**, select the same
   repo as `backend`, set the **root directory to `backend/`** (same as the
   existing API service).
2. In that new service's **Settings → Deploy**, set **Custom Start Command**
   to the exact command from the table above.
3. **Settings → Networking**: do not expose a public domain — these are
   background workers, not HTTP services.
4. **Settings → Health Checks / Healthcheck**: disable the HTTP healthcheck
   (there is no port to check). Railway's default is "no healthcheck
   configured" unless one is explicitly set — verify none is set for these
   two services, since they have no `/health` endpoint. Railway still
   restarts the process on crash regardless of healthcheck configuration.
5. **Variables**: copy every environment variable the `backend` API service
   has — the workers import the exact same `config/db.js`, `config/env.js`,
   and `queue/redis.connection.js` modules, so they need the same
   `MONGODB_URI`, `REDIS_URL`, `R2_*`, `AI_SERVICE_URL`, `AI_SERVICE_SHARED_SECRET`,
   `JWT_SECRET`, etc. (Railway supports referencing/copying a shared variable
   group across services — use that rather than re-typing values, so a
   rotated secret only needs updating once.)

## Per-service startup dependency checklist

| Requires | `backend` (API) | `invoice-approval-worker` | `ai-extraction-worker` | `ai-services` |
|---|---|---|---|---|
| `MONGODB_URI` | Yes | Yes | Yes | No (stateless) |
| `REDIS_URL` | Yes (fails fast in prod if unset — see `config/env.js`) | Yes | Yes | No |
| R2 credentials | Yes | Yes | Yes | No |
| `AI_SERVICE_URL` | Yes (proxies extraction requests) | Yes (`recomputeDraft` calls it) | Yes | N/A (this *is* the AI service) |
| `AI_SERVICE_SHARED_SECRET` | Yes | Yes | Yes | Yes |
| `JWT_SECRET` | Yes | No (no HTTP surface) | No | No |
| Public HTTP port | Yes | No | No | Yes |

## Scaling / replicas

- The `backend` API service can be scaled to multiple replicas. Doing so now
  requires nothing extra — Socket.IO uses `@socket.io/redis-adapter` and
  rate limiting uses a Redis-backed store (both added in this pass), so
  realtime events and rate limits stay correct across replicas.
- Both worker services can also be scaled to multiple replicas safely: BullMQ
  workers are designed for exactly this (each replica pulls jobs from the
  same queue), and the invoice-approval worker's atomic
  `'approving' -> 'processing'` claim (see `invoiceApproval.worker.js`)
  specifically guards against two replicas double-processing the same job.
- `ai-services` scales independently of `backend` — it does its own thing
  (Gemini/OCR calls) and should be sized by AI-processing load, not API
  request volume.
- MongoDB connection pool: each process (`backend` + both workers, each
  possibly multiple replicas) opens its own pool (`maxPoolSize` env,
  default 50). Before scaling replica counts, check your Atlas tier's
  connection limit against `(backend replicas + invoice-worker replicas +
  ai-worker replicas) × maxPoolSize`, and lower `MONGO_MAX_POOL_SIZE` via
  env if needed rather than leaving every replica at the default.

## Verifying the fix after deployment

1. Both new services show `Active` in Railway with logs containing
   `worker_started` (invoice-approval-worker) — grep each service's logs for
   that exact string.
2. Run one real invoice approval end-to-end and confirm the invoice-approval
   worker's logs show `job_start` → `job_completed` for that draft, and
   `GET /health` on the API service reports `invoiceApprovalQueue.counts`
   with `active`/`completed` moving (not stuck at `waiting`).
3. Same for AI extraction: submit one extraction job, confirm the
   ai-extraction-worker's logs show it being consumed, and `GET /health`'s
   existing `queue` field reflects it.
