/**
 * Boundary-case regression test for the Passport/Emirates ID expiry status
 * calculation (documentExpiryStatus.util.js) - the single source of truth
 * shared by getEmployeeStats' KPI aggregation and getEmployees' KPI-click
 * status filter. Run directly with `node src/tests/documentExpiryStatus.test.js`
 * (this project has no test runner wired up - see invoiceRenderer.test.js
 * for the same plain-assertion convention).
 */
import assert from 'assert';
import { getDocumentExpiryStatus, addCalendarMonths } from '../utils/documentExpiryStatus.util.js';

let passed = 0;
const check = (label, actual, expected) => {
  assert.strictEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed += 1;
  console.log(`PASS: ${label}`);
};

// Case: more than a month away -> valid
check('Case 6 - 22 Aug vs 23 Oct', getDocumentExpiryStatus('2026-10-23', new Date('2026-08-22')), 'valid');

// Case 1: one day beyond the exact one-month cutoff (22 Aug + 1 month = 22
// Sep; expiry is 23 Sep) -> valid per the formal rule in section 2
// (expiryDate <= today + 1 calendar month). Section 26's Case 1 label text
// says "Expiring Soon" but that contradicts both the formal rule and its
// own Case 6 example (22 Aug / 23 Oct = Valid) - trusting the formal rule.
check('Case 1 - 22 Aug vs 23 Sep (one day past the month cutoff)', getDocumentExpiryStatus('2026-09-23', new Date('2026-08-22')), 'valid');

// Case 2: exactly one calendar month away -> expiring-soon
check('Case 2 - 22 Aug vs 22 Sep (exactly one month)', getDocumentExpiryStatus('2026-09-22', new Date('2026-08-22')), 'expiring-soon');

// Case 3: one day before expiry -> expiring-soon
check('Case 3 - 21 Sep vs 22 Sep', getDocumentExpiryStatus('2026-09-22', new Date('2026-09-21')), 'expiring-soon');

// Case 4: expiry date itself -> expired
check('Case 4 - 22 Sep vs 22 Sep (expiry day itself)', getDocumentExpiryStatus('2026-09-22', new Date('2026-09-22')), 'expired');

// Case 5: one day after expiry -> expired
check('Case 5 - 23 Sep vs 22 Sep', getDocumentExpiryStatus('2026-09-22', new Date('2026-09-23')), 'expired');

// Spec example: 13 Dec 2026 expiry
check('13 Nov -> Expiring Soon (one month window opens)', getDocumentExpiryStatus('2026-12-13', new Date('2026-11-13')), 'expiring-soon');
check('12 Dec -> Expiring Soon (day before expiry)', getDocumentExpiryStatus('2026-12-13', new Date('2026-12-12')), 'expiring-soon');
check('13 Dec -> Expired (expiry day itself)', getDocumentExpiryStatus('2026-12-13', new Date('2026-12-13')), 'expired');
check('14 Dec -> Expired (day after)', getDocumentExpiryStatus('2026-12-13', new Date('2026-12-14')), 'expired');
check('12 Nov -> Valid (more than a month away)', getDocumentExpiryStatus('2026-12-13', new Date('2026-11-12')), 'valid');

// Month-end clamping: 31 Jan + 1 month should land on 28 Feb (2027 is not a leap year)
check('31 Jan + 1 month clamps to 28 Feb (non-leap)', addCalendarMonths(new Date(Date.UTC(2027, 0, 31)), 1).toISOString().slice(0, 10), '2027-02-28');
// 31 Dec 2026 + 1 month clamps to 31 Jan 2027 (Jan has 31 days, no
// clamping needed) - expiry exactly on that cutoff is still expiring-soon.
check('Expiry 31 Jan 2027, today 31 Dec 2026 (exact clamped cutoff) -> expiring-soon', getDocumentExpiryStatus('2027-01-31', new Date('2026-12-31')), 'expiring-soon');

// Missing / invalid expiry dates - the shared function returns null; each
// caller (table vs Smart Alerts) applies its own pre-existing fallback.
check('Missing expiry -> null', getDocumentExpiryStatus(null, new Date('2026-08-22')), null);
check('Empty string expiry -> null', getDocumentExpiryStatus('', new Date('2026-08-22')), null);
check('Invalid date string -> null', getDocumentExpiryStatus('not-a-date', new Date('2026-08-22')), null);

// KPI example from the spec: employees expiring 20 Aug 2027 / 10 Sep 2026 / 01 Aug 2026, today 22 Aug 2026
const today = new Date('2026-08-22');
check('Employee 1 (20 Aug 2027) -> Valid', getDocumentExpiryStatus('2027-08-20', today), 'valid');
check('Employee 2 (10 Sep 2026) -> Expiring Soon', getDocumentExpiryStatus('2026-09-10', today), 'expiring-soon');
check('Employee 3 (01 Aug 2026) -> Expired', getDocumentExpiryStatus('2026-08-01', today), 'expired');

console.log(`\n${passed} assertions passed.`);
