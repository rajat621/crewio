// Phase 8: Socket.IO connection test.
//
// NOT a k6 script. k6's WebSocket module speaks raw WebSocket, but
// Socket.IO uses its own framing/handshake protocol (Engine.IO) on top of
// WebSocket/polling - a raw-WS client can't authenticate or join rooms the
// way a real client does. socket.io-client is the only way to genuinely
// exercise auth, rooms, and the Redis adapter the way real dashboard/
// mobile clients do, so this is a plain Node script instead.
//
// Usage:
//   node load-tests/scenarios/realtime.js
//
// Env vars:
//   BASE_URL            - API origin (Socket.IO is mounted on the same HTTP server)
//   TEST_OWNER_JWT_TOKEN - a real owner JWT (or set TEST_EMPLOYEE_TOKEN for an employee identity)
//   TARGET_CONNECTIONS   - how many concurrent sockets to open (default 100)
//   HOLD_DURATION_MS     - how long to keep them open after connecting (default 60000)
import { io } from 'socket.io-client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TOKEN = process.env.TEST_OWNER_JWT_TOKEN || process.env.TEST_EMPLOYEE_TOKEN || '';
const TARGET_CONNECTIONS = Number(process.env.TARGET_CONNECTIONS || 100);
const HOLD_DURATION_MS = Number(process.env.HOLD_DURATION_MS || 60000);
const CONNECT_TIMEOUT_MS = 10000;

if (!TOKEN) {
  console.error('Set TEST_OWNER_JWT_TOKEN or TEST_EMPLOYEE_TOKEN before running this scenario. See README.md.');
  process.exit(1);
}

async function openOne(index, stats) {
  return new Promise((resolve) => {
    const connectStarted = Date.now();
    const socket = io(BASE_URL, {
      auth: { token: TOKEN },
      transports: ['websocket'],
      reconnection: true,
      timeout: CONNECT_TIMEOUT_MS,
    });

    const timer = setTimeout(() => {
      stats.connectTimeouts += 1;
      socket.close();
      resolve();
    }, CONNECT_TIMEOUT_MS);

    socket.on('connect', () => {
      clearTimeout(timer);
      stats.connected += 1;
      stats.connectLatencies.push(Date.now() - connectStarted);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      stats.connectErrors += 1;
      if (index < 3) console.error(`[socket ${index}] connect_error:`, err.message);
      resolve(null);
    });

    socket.on('disconnect', (reason) => {
      stats.disconnects += 1;
      if (index < 3) console.log(`[socket ${index}] disconnected:`, reason);
    });

    socket.on('reconnect', () => {
      stats.reconnects += 1;
    });
  });
}

async function main() {
  console.log(`Opening ${TARGET_CONNECTIONS} Socket.IO connections to ${BASE_URL} ...`);
  const stats = {
    connected: 0,
    connectErrors: 0,
    connectTimeouts: 0,
    disconnects: 0,
    reconnects: 0,
    connectLatencies: [],
  };

  const startMem = process.memoryUsage().rss;
  const sockets = [];
  // Ramp in small batches rather than all-at-once, mirroring real traffic
  // growth rather than a synchronized thundering herd.
  const BATCH_SIZE = 25;
  for (let i = 0; i < TARGET_CONNECTIONS; i += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, TARGET_CONNECTIONS - i) }, (_, j) => openOne(i + j, stats));
    const results = await Promise.all(batch);
    sockets.push(...results.filter(Boolean));
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`Connected: ${stats.connected}/${TARGET_CONNECTIONS}`);
  console.log(`Connect errors: ${stats.connectErrors}, timeouts: ${stats.connectTimeouts}`);
  if (stats.connectLatencies.length) {
    const sorted = [...stats.connectLatencies].sort((a, b) => a - b);
    console.log(`Connect latency p50=${sorted[Math.floor(sorted.length * 0.5)]}ms p95=${sorted[Math.floor(sorted.length * 0.95)]}ms`);
  }

  console.log(`Holding ${sockets.length} connections open for ${HOLD_DURATION_MS}ms ...`);
  await new Promise((r) => setTimeout(r, HOLD_DURATION_MS));

  const endMem = process.memoryUsage().rss;
  console.log(`RSS delta over hold period: ${((endMem - startMem) / 1024 / 1024).toFixed(1)}MB (this process only - not the server)`);
  console.log(`Disconnects during hold: ${stats.disconnects}, reconnects: ${stats.reconnects}`);

  sockets.forEach((s) => s?.close());
  console.log('Done. Closed all connections.');
  process.exit(0);
}

main();
