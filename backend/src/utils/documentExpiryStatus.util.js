// Single source of truth for Passport / Emirates ID expiry status on the
// backend - mirrors crewcontrol-fron/src/utils/documentExpiryStatus.js so
// GET /api/employees/stats' KPI counts and GET /api/employees' status
// filter both agree with the Employees page's own per-row calculation,
// instead of each computing "expired"/"expiring-soon"/"valid" a different
// way (or, previously, grouping by a stored status field that was set once
// at employee creation and never recomputed as dates passed).
//
// Rules:
//   today >= expiryDate                              -> "expired"
//   today <  expiryDate <= today + 1 calendar month   -> "expiring-soon"
//   expiryDate > today + 1 calendar month             -> "valid"

export const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

// Calendar-month addition that clamps to the shorter month (e.g. 31 Jan + 1
// month = 28/29 Feb) - matches the frontend's addCalendarMonths.
export const addCalendarMonths = (date, months) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthIndex = month + months;
  const daysInTargetMonth = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonthIndex, Math.min(day, daysInTargetMonth)));
};

// Pure JS status calculation for a single document - used wherever status
// needs computing outside a Mongo aggregation pipeline.
export const getDocumentExpiryStatus = (expiryValue, referenceDate = new Date()) => {
  if (!expiryValue) return null;

  const expiry = new Date(expiryValue);
  if (Number.isNaN(expiry.getTime())) return null;

  const today = startOfUtcDay(referenceDate);
  const expiryDay = startOfUtcDay(expiry);

  if (expiryDay <= today) return 'expired';

  const oneMonthFromToday = addCalendarMonths(today, 1);
  if (expiryDay <= oneMonthFromToday) return 'expiring-soon';

  return 'valid';
};

// Mongo aggregation expression computing the same status live from an
// expiry date field (e.g. 'passportExpiry'), for use in $group/$match
// stages so KPI counts and status filters never depend on a stored status
// field that can go stale. `today`/`cutoff` are precomputed once per
// request (see callers, via startOfUtcDay/addCalendarMonths above) rather
// than recomputed per document.
export const buildDocumentStatusExpr = (expiryFieldPath, today, cutoff) => ({
  $switch: {
    branches: [
      {
        case: {
          $or: [
            { $eq: [`$${expiryFieldPath}`, null] },
            { $eq: [{ $type: `$${expiryFieldPath}` }, 'missing'] },
          ],
        },
        then: 'expired',
      },
      { case: { $lte: [`$${expiryFieldPath}`, today] }, then: 'expired' },
      { case: { $lte: [`$${expiryFieldPath}`, cutoff] }, then: 'expiring-soon' },
    ],
    default: 'valid',
  },
});
