# Redis runtime blocker for the real queue benchmark

The CrewControl backend code is now configured to use Redis-backed BullMQ queues and the worker process is ready to run, but the local execution environment does not currently expose a runnable Redis server.

## What I verified

- The application config has been switched to use Redis with `DISABLE_REDIS=false` and `REDIS_HOST=127.0.0.1` / `REDIS_PORT=6379`.
- Docker-based startup was attempted, but the host reported that Docker Desktop is not available.
- Native Redis packages were also attempted through `winget`, but the installer flow was blocked by the host environment.
- A WSL-based install path was attempted, but the container image does not expose `apt-get` and therefore could not install Redis.

## Result

The queue and worker code are ready, but the actual BullMQ/Redis benchmark cannot be completed in this environment until a Redis server is available on `127.0.0.1:6379`.

## What remains to run once Redis is available

1. Start the API process.
2. Start the AI worker process.
3. Enqueue 50, 200, and 500 jobs.
4. Measure queue depth, completion latency, and semaphore throttling.
