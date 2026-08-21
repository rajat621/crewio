// Lightweight, dependency-free distributed load generator - meant to run
// as its own short-lived Railway service (a different region/egress IP
// than the backend under test), NOT on the same machine as the other
// load-generator instances, so the app's real per-IP rate limiter sees
// genuinely different source IPs, matching how 250-1000 real distinct
// users actually arrive in production.
//
// Mirrors scenarios/api.js's exact weighted-read behavior (same endpoints,
// same pagination, same think-time) using only Node's built-in fetch - no
// k6 binary to install in a throwaway container, no new dependency.
//
// Env vars: BASE_URL, TEST_OWNER_JWT_TOKEN, VUS, DURATION_MS
// (DURATION_MS default 60000). Prints a final JSON summary line prefixed
// with "RESULT:" so it can be grepped straight out of Railway logs.

const BASE_URL = process.env.BASE_URL;
const TOKEN = process.env.TEST_OWNER_JWT_TOKEN;
const VUS = Number(process.env.VUS || 25);
const DURATION_MS = Number(process.env.DURATION_MS || 60000);

if (!BASE_URL || !TOKEN) {
  console.error('BASE_URL and TEST_OWNER_JWT_TOKEN are required.');
  process.exit(1);
}

const to = new Date();
const from = new Date(to.getTime() - 35 * 24 * 60 * 60 * 1000);
const dashboardRange = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;

// Same 12 endpoints, same pagination, same weighting as scenarios/api.js -
// deliberately kept in sync so single-IP and multi-IP runs are comparable.
const WEIGHTED_READS = [
  `/api/dashboard/summary?${dashboardRange}`,
  '/api/dashboard/finance-summary',
  '/api/employees?page=1&limit=50',
  '/api/employees/stats',
  '/api/companies?page=1&limit=100',
  '/api/companies/clients?page=1&limit=100',
  '/api/attendance/summary',
  '/api/invoices?page=1&limit=50',
  '/api/salary-slips?page=1&limit=20',
  '/api/notifications/owner?page=1&limit=20',
  '/api/expenses?page=1&limit=20',
  '/api/company-expenses',
];

const stats = {
  total: 0,
  success: 0,
  status4xx: 0,
  status5xx: 0,
  status429: 0,
  networkErrors: 0,
  latencies: [],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function doRequest(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    });
    const dur = Date.now() - started;
    stats.total += 1;
    stats.latencies.push(dur);
    if (res.status === 429) stats.status429 += 1;
    else if (res.status >= 500) stats.status5xx += 1;
    else if (res.status >= 400) stats.status4xx += 1;
    else stats.success += 1;
  } catch (err) {
    stats.total += 1;
    stats.networkErrors += 1;
  }
}

async function vuLoop(deadline) {
  while (Date.now() < deadline) {
    for (let i = 0; i < 3; i++) {
      const path = WEIGHTED_READS[Math.floor(Math.random() * WEIGHTED_READS.length)];
      await doRequest(path);
    }
    await sleep(1000 + Math.random() * 2000);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function main() {
  console.log(`Starting distributed-generator: VUS=${VUS} DURATION_MS=${DURATION_MS} BASE_URL=${BASE_URL}`);
  const deadline = Date.now() + DURATION_MS;
  const vus = Array.from({ length: VUS }, () => vuLoop(deadline));
  await Promise.all(vus);

  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const summary = {
    vus: VUS,
    durationMs: DURATION_MS,
    totalRequests: stats.total,
    success: stats.success,
    status4xx: stats.status4xx,
    status5xx: stats.status5xx,
    status429: stats.status429,
    networkErrors: stats.networkErrors,
    rps: Number((stats.total / (DURATION_MS / 1000)).toFixed(2)),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
  console.log('RESULT:' + JSON.stringify(summary));
}

main();
