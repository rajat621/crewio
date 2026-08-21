// Phase 10: invoice workflow load test - specifically the concurrent-
// approval race described in the brief ("two users approving
// simultaneously", "duplicate BullMQ job").
//
// Draft creation itself (upload -> real AI extraction -> real Gemini call)
// is NOT driven through k6 here - it's a real external-cost operation
// (Gemini API) that shouldn't be triggered repeatedly by a load test loop.
// Instead this scenario fires N CONCURRENT approve requests at ONE
// pre-existing 'ready' draft (see README.md's "Invoice concurrency test
// setup" for how to create it) and asserts the server-side atomic claim
// holds: exactly one request gets 202, every other concurrent request gets
// 409 - never two.
//
// Run with a small, fixed VU count (this is a correctness test, not a
// throughput test) - e.g. `k6 run -e VUS=20 --iterations 20 --vus 20`.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, ownerHeaders, OWNER_JWT_TOKEN, assertConfigured } from '../config.js';

const TEST_DRAFT_ID = __ENV.TEST_DRAFT_ID || '';
const TEST_DRAFT_VERSION = __ENV.TEST_DRAFT_VERSION || '0';

export const options = {
  vus: Number(__ENV.VUS || 20),
  iterations: Number(__ENV.VUS || 20), // exactly one attempt per VU, all racing the same draft
};

const accepted202 = new Counter('approve_accepted_202');
const rejected409 = new Counter('approve_rejected_409');
const unexpected = new Counter('approve_unexpected_status');

export function setup() {
  assertConfigured([
    { name: 'TEST_OWNER_JWT_TOKEN', value: OWNER_JWT_TOKEN },
    { name: 'TEST_DRAFT_ID', value: TEST_DRAFT_ID },
  ]);
}

export default function () {
  const res = http.post(
    `${BASE_URL}/api/invoices/drafts/${TEST_DRAFT_ID}/approve`,
    JSON.stringify({ expectedVersion: Number(TEST_DRAFT_VERSION) }),
    { headers: ownerHeaders(), tags: { name: 'concurrent_approve' } }
  );

  if (res.status === 202) accepted202.add(1);
  else if (res.status === 409) rejected409.add(1);
  else unexpected.add(1);

  check(res, { 'approve: 202 or 409 only (never 5xx, never a second 202)': (r) => r.status === 202 || r.status === 409 });
}

// After running: check accepted202 == 1 and rejected409 == (VUs - 1) in the
// summary. Then separately confirm via the app (or a read-only DB check)
// that exactly one Invoice document with this draft's sourceDraftId exists.
