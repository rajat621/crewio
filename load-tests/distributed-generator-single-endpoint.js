// Single-endpoint variant of distributed-generator.js, parameterized by
// ENDPOINT_PATH so the same script covers employees/companies-clients/
// invoices/etc. without duplicating near-identical files per endpoint.
// Same VU-loop structure/percentile math as the original and the
// companies-only variant. Read-only (GET only). Temporary - meant to run
// as a short-lived Railway service, then be deleted along with it.

const BASE_URL = process.env.BASE_URL;
const TOKEN = process.env.TEST_OWNER_JWT_TOKEN;
const VUS = Number(process.env.VUS || 100);
const DURATION_MS = Number(process.env.DURATION_MS || 20000);
const ENDPOINT_PATH = process.env.ENDPOINT_PATH;

if (!BASE_URL || !TOKEN || !ENDPOINT_PATH) {
  console.error('BASE_URL, TEST_OWNER_JWT_TOKEN, and ENDPOINT_PATH are required.');
  process.exit(1);
}

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

async function doRequest() {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINT_PATH}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    });
    // Drain the body so the connection is actually fully consumed, same as
    // a real client would - otherwise Node may not count the response as
    // fully received for timing purposes.
    await res.arrayBuffer();
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
    await doRequest();
    await sleep(200);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function main() {
  console.log(`Starting single-endpoint generator: VUS=${VUS} DURATION_MS=${DURATION_MS} BASE_URL=${BASE_URL} ENDPOINT_PATH=${ENDPOINT_PATH}`);
  const deadline = Date.now() + DURATION_MS;
  const vus = Array.from({ length: VUS }, () => vuLoop(deadline));
  await Promise.all(vus);

  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const summary = {
    endpoint: ENDPOINT_PATH,
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
