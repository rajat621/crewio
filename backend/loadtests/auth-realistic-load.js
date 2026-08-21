import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const TOKEN_COUNT = Number(process.env.TOKEN_COUNT || 200);
const REQUEST_COUNT = Number(process.env.REQUEST_COUNT || 200);
const CONCURRENCY = Number(process.env.CONCURRENCY || 40);
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret';

const paths = ['/api/dashboard', '/api/employees', '/api/attendance', '/api/attendance/summary'];

function makeSignedToken(index) {
  return jwt.sign(
    {
      userId: `loadtest-user-${index}`,
      role: 'OWNER',
      ownerId: `owner-${index}`,
      companyId: `company-${index}`,
      tokenType: 'access',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function requestOnce(path, token) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, latencyMs: Date.now() - startedAt, body });
        });
      }
    );
    req.on('error', (err) => {
      resolve({ status: 0, latencyMs: Date.now() - startedAt, error: String(err) });
    });
    req.end();
  });
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function main() {
  const tokens = Array.from({ length: TOKEN_COUNT }, (_, i) => makeSignedToken(i + 1));
  const latencies = [];
  let success = 0;
  let failure = 0;

  for (let i = 0; i < REQUEST_COUNT; i += CONCURRENCY) {
    const batch = [];
    for (let j = 0; j < CONCURRENCY && i + j < REQUEST_COUNT; j += 1) {
      const token = tokens[(i + j) % tokens.length];
      const path = paths[(i + j) % paths.length];
      batch.push(requestOnce(path, token));
    }
    const results = await Promise.all(batch);
    for (const result of results) {
      latencies.push(result.latencyMs);
      if (result.status >= 200 && result.status < 500) {
        success += 1;
      } else {
        failure += 1;
      }
    }
    await delay(100);
  }

  console.log(JSON.stringify({
    tokenCount: tokens.length,
    requestCount: REQUEST_COUNT,
    concurrency: CONCURRENCY,
    success,
    failure,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: Math.max(...latencies, 0),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
