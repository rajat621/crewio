// Shared, environment-driven configuration for every scenario in this
// suite. Nothing here is hard-coded to a specific environment or account -
// every value comes from an env var with a safe local default, per the
// "no hard-coded production credentials" requirement.
//
// Required for any scenario that hits authenticated endpoints:
//   BASE_URL              - API origin, e.g. https://backend-production-7fe0.up.railway.app
//   TEST_OWNER_JWT_TOKEN   - a real, already-issued owner/admin JWT (owner login
//                            requires OTP, which cannot be scripted here - obtain
//                            one manually by logging into the app once and
//                            copying the token, see README.md)
//   TEST_EMPLOYEE_IDS      - comma-separated employeeId values (mobile login IDs)
//   TEST_EMPLOYEE_PASSWORD - the shared app password for those synthetic test employees
//
// Optional:
//   VUS, DURATION, RAMP_* - overridden per-scenario via k6 options, these are
//                            just fallback defaults for ad-hoc runs.

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const OWNER_JWT_TOKEN = __ENV.TEST_OWNER_JWT_TOKEN || '';

export const EMPLOYEE_IDS = (__ENV.TEST_EMPLOYEE_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const EMPLOYEE_PASSWORD = __ENV.TEST_EMPLOYEE_PASSWORD || '';

// LOAD_TEST_CLIENT_IP: only meaningful when the server's LOAD_TEST_ALLOWED_IPS
// exemption (rateLimiters.js) is active for controlled testing - sent as
// X-Forwarded-For so apiLimiter's skip() sees the expected, pre-authorized
// IP. Discovered during testing: Railway's proxy chain is deeper than the
// app's `trust proxy: 1` setting accounts for, so req.ip does NOT resolve to
// the real client IP without this - a real finding, not just a test
// workaround (see PERFORMANCE.md). Omitted entirely (empty header, ignored)
// when unset, so this has zero effect outside an explicitly authorized test run.
const LOAD_TEST_CLIENT_IP = __ENV.LOAD_TEST_CLIENT_IP || '';

// A single shared owner-scoped header set - used by every scenario that
// reads owner/dashboard-side data. Real JWT, real middleware, no auth bypass.
export const ownerHeaders = () => ({
  Authorization: `Bearer ${OWNER_JWT_TOKEN}`,
  'Content-Type': 'application/json',
  ...(LOAD_TEST_CLIENT_IP ? { 'X-Forwarded-For': LOAD_TEST_CLIENT_IP } : {}),
});

// Picks one employee id deterministically per VU/iteration so concurrent
// VUs spread across the whole synthetic pool instead of all hammering the
// same identity (which would also trip per-identity behavior differently
// from a real fleet of devices).
export const pickEmployeeId = (vuId) => {
  if (EMPLOYEE_IDS.length === 0) return null;
  return EMPLOYEE_IDS[vuId % EMPLOYEE_IDS.length];
};

// Matches useDashboardData.js's getRollingDayRange(35) - getDashboardSummary
// 400s without both from/to (real backend contract, found by running this
// suite: the endpoint requires a date range, not an optional filter).
export const dashboardRangeQuery = () => {
  const to = new Date();
  const from = new Date(to.getTime() - 35 * 24 * 60 * 60 * 1000);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
};

export function assertConfigured(fields) {
  const missing = fields.filter((f) => !f.value);
  if (missing.length) {
    throw new Error(
      `Missing required env config for this scenario: ${missing.map((f) => f.name).join(', ')}. See load-tests/README.md.`
    );
  }
}
