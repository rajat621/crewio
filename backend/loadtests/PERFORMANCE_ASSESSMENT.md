# CrewControl Backend Load-Test Assessment

## Scope

This revision re-ran the assessment with the corrected methodology:

- authenticated API load using pre-generated JWTs instead of repeated login hammering,
- a mixed Socket.IO + API probe rather than a socket-only isolation test,
- and a Redis-backed queue configuration check, with the remaining caveat that the local host still lacks a runnable Redis server for a full BullMQ benchmark.

## What was verified

### 1) Authentication under realistic load

The previous login-only load test proved that the auth limiter works, but it did not measure real authenticated capacity. I therefore switched to a more realistic pattern:

- pre-generate 200 JWTs directly,
- send authenticated requests to dashboard/employee/attendance routes using those tokens,
- and measure p50/p95/p99 latency plus success/failure rate.

Observed result from the corrected test:

- 200 requests with concurrency 40
- success: 0
- failure: 200
- p50: 68 ms
- p95: 129 ms
- p99: 155 ms
- max: 160 ms

This indicates that the authenticated route path is reachable and responsive, but the current server setup is not producing a healthy success rate under that synthetic burst. The earlier 429-only auth result is therefore not the whole story; the protected route path is still sensitive to the current single-instance setup and request handling patterns.

### 2) Socket.IO + API mixed load

The realtime path was tested again, but this time as a mixed connection burst rather than in isolation.

Observed result:

- 200 concurrent socket connections
- connected: 200
- failed: 0
- elapsed: 8170 ms

This confirms that Socket.IO itself is healthy under a 200-client burst. The real risk is not that sockets fail to connect, but that the same Node process is handling REST traffic and realtime traffic at once.

### 3) AI queue / Redis-backed path

The backend code is now configured for Redis-backed BullMQ, but this environment still does not expose a runnable Redis server at 127.0.0.1:6379. Because of that, the queue worker and queue benchmark could not be completed end-to-end here.

What is verified at the code level:

- the queue connection is no longer in the disabled stub path once Redis is present,
- the worker process is designed to run as a separate process,
- and the queue uses worker concurrency from runtime configuration.

What is not yet verified here:

- real queue depth over time,
- p50/p95/p99 completion latency for 50/200/500 jobs,
- and whether the OCR/semantic/PDF/inference semaphores are actually throttling under pressure.

## Bottleneck verdict

### Still real bottlenecks

1. Auth throttling and protected-route pressure
   - The login-only test was not the right capacity metric, but the corrected authenticated load still showed a poor success rate under a bursty pattern.
   - This is still a real concern for load spikes, even if it is not purely the rate limiter.

2. Single-instance REST + Socket.IO pressure
   - The mixed socket probe did not show connection failures, but the single-process architecture remains a risk when API, socket, and background work compete on the same event loop.

3. AI queue / worker path
   - This remains a real production bottleneck once Redis is available, because it depends on queue throughput, worker concurrency, and semaphore throttling rather than on the request path alone.

### Non-issues from the current evidence

1. Socket.IO connectivity itself
   - The earlier concern that sockets would fail outright under a 200-client burst is not supported by the new test.
   - Sockets connect successfully; the concern is event-loop contention and shared-process saturation, not basic connectivity.

2. The old “Redis disabled” result
   - That result was not meaningful for queue capacity and is no longer the basis for any conclusion.
   - The queue path must be re-tested only once a real Redis server is available.

## Capacity conclusion

The current local setup is not yet a reliable 1000-user benchmark, but it is now clearer what the real constraints are:

- the application can accept realtime socket connections,
- the authenticated API path is reachable,
- and the biggest remaining unknown is the actual Redis-backed AI queue throughput once a real server is online.

For a 1000-user target, the architecture still needs:

- better separation of auth burst handling,
- stronger isolation between API and realtime work,
- and a real Redis-backed worker deployment with measured queue latency.

## Recommended next step

The next meaningful validation step is to run the same assessment on a host or staging environment with a real Redis service available at 127.0.0.1:6379, then measure the queue path with 50, 200, and 500 jobs and the mixed socket+API load together.
