// Phase 12: AI/PDF concurrency test. This is the one scenario in this
// suite that costs real money (Gemini API calls) and consumes the AI
// service's limited concurrency (2 gunicorn workers x 4 threads = 8 total
// slots, see PERFORMANCE.md) - it is NOT run as part of any combined/mixed
// scenario and must be invoked deliberately with a small, explicit
// iteration count, never an open-ended duration.
//
// ai.controller.js's extractInvoiceTables takes a `pdfPath` referencing an
// ALREADY-UPLOADED FileRecord (via POST /api/upload), not a raw multipart
// file per request - so this scenario does not re-upload a file per
// iteration (that would multiply storage writes on top of AI cost). Upload
// one real timesheet PDF once (see README.md) and reuse its pdfPath here.
//
// Run progressively: `k6 run -e VUS=5 --iterations 5 ...`, then 10, 20, 30,
// 50 - watching ai-services' own CPU/RAM/latency at each step (Railway
// metrics tab, or `docker stats`/Task Manager if run locally) rather than
// jumping straight to a high count.
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, ownerHeaders, OWNER_JWT_TOKEN, assertConfigured } from '../config.js';

const TEST_PDF_PATH = __ENV.TEST_PDF_PATH || '';

export const options = {
  vus: Number(__ENV.VUS || 5),
  iterations: Number(__ENV.ITERATIONS || __ENV.VUS || 5),
};

const extractionLatency = new Trend('ai_extraction_latency', true);
const timeouts = new Counter('ai_extraction_timeouts');
const failures = new Counter('ai_extraction_failures');

export function setup() {
  assertConfigured([
    { name: 'TEST_OWNER_JWT_TOKEN', value: OWNER_JWT_TOKEN },
    { name: 'TEST_PDF_PATH', value: TEST_PDF_PATH },
  ]);
}

export default function () {
  const res = http.post(
    `${BASE_URL}/api/ai/extract/invoice-summary`,
    JSON.stringify({ pdfPath: TEST_PDF_PATH }),
    {
      headers: ownerHeaders(),
      tags: { name: 'ai_extract_invoice_summary' },
      timeout: '180s', // matches the AI service's own 300s gunicorn timeout order-of-magnitude
    }
  );

  extractionLatency.add(res.timings.duration);
  if (res.status === 0) timeouts.add(1); // k6 status 0 = request timed out / connection error
  if (res.status >= 500 || res.status === 0) failures.add(1);

  check(res, {
    'ai extract: not a 5xx/timeout': (r) => r.status < 500 && r.status !== 0,
    'ai extract: not 429 (rate limited)': (r) => r.status !== 429,
  });
}
