// backend/src/utils/vatDeadline.util.js
//
// VAT filing deadline schedule: every 4 months from registration, on the
// 28th, starting 3 months after the registration month (so a January
// registration files first on April 28, then August 28, December 28,
// April 28 the following year, and so on - see the worked examples this
// was built from).
//
// Each period covers the months between the previous deadline (or the
// registration month itself, for the very first period) and the month
// right before the current deadline:
//   registered January  -> deadline April  covers Jan, Feb, Mar
//                        -> deadline August covers Apr, May, Jun, Jul
//                        -> deadline December covers Aug, Sep, Oct, Nov
//                        -> deadline April (next year) covers Dec, Jan, Feb, Mar

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const formatPeriod = (year, monthIndex0) => `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;

const parseRegistrationMonth = (registrationMonth) => {
  const match = String(registrationMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const [, yearStr, monthStr] = match;
  const monthIndex0 = Number(monthStr) - 1;
  if (monthIndex0 < 0 || monthIndex0 > 11) return null;
  return { year: Number(yearStr), monthIndex0 };
};

/**
 * Walks the deadline schedule forward from registration until it finds the
 * period whose deadline month is the current one (referenceDate's month),
 * or returns null if today isn't a deadline month at all. Also walks
 * forward past any period already marked paid (vatLastPaidPeriod), so a
 * paid period never re-shows until the NEXT deadline actually arrives.
 */
export const getActiveVatPeriod = (registrationMonth, referenceDate = new Date(), vatLastPaidPeriod = null) => {
  const registration = parseRegistrationMonth(registrationMonth);
  if (!registration) return null;

  const refYear = referenceDate.getFullYear();
  const refMonthIndex0 = referenceDate.getMonth();

  // First deadline is registration month + 3; every one after that is +4.
  // Walk forward (bounded - this schedule repeats every 4 months, so a few
  // years of iterations is more than enough to reach "today" from any
  // registration date) until the deadline month/year matches today.
  let deadlineYear = registration.year;
  let deadlineMonthIndex0 = registration.monthIndex0 + 3;
  let periodStartYear = registration.year;
  let periodStartMonthIndex0 = registration.monthIndex0;

  for (let i = 0; i < 60; i += 1) {
    // Normalize deadlineMonthIndex0 into 0-11, carrying the year forward.
    while (deadlineMonthIndex0 > 11) {
      deadlineMonthIndex0 -= 12;
      deadlineYear += 1;
    }

    const deadlinePeriod = formatPeriod(deadlineYear, deadlineMonthIndex0);
    const isCurrentDeadlineMonth = deadlineYear === refYear && deadlineMonthIndex0 === refMonthIndex0;
    const alreadyPaid = vatLastPaidPeriod && vatLastPaidPeriod === deadlinePeriod;

    if (isCurrentDeadlineMonth && !alreadyPaid) {
      // Covered period: periodStart..deadline-1 (inclusive), which can
      // span a year boundary (e.g. Dec-Mar).
      const months = [];
      let y = periodStartYear;
      let m = periodStartMonthIndex0;
      const endMonthIndex0Total = deadlineYear * 12 + deadlineMonthIndex0 - 1;
      while (y * 12 + m <= endMonthIndex0Total) {
        months.push({ year: y, monthIndex0: m, monthName: MONTH_NAMES[m] });
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
      }

      const periodStart = new Date(periodStartYear, periodStartMonthIndex0, 1, 0, 0, 0, 0);
      const periodEnd = new Date(deadlineYear, deadlineMonthIndex0, 0, 23, 59, 59, 999); // last day of the month before the deadline
      const deadlineDate = new Date(deadlineYear, deadlineMonthIndex0, 28, 23, 59, 59, 999);

      return {
        deadlinePeriod,
        deadlineMonthName: MONTH_NAMES[deadlineMonthIndex0],
        deadlineYear,
        deadlineDate,
        periodStart,
        periodEnd,
        months,
      };
    }

    if (isCurrentDeadlineMonth && alreadyPaid) {
      // This period was marked paid - the alert stays hidden until the
      // NEXT deadline (handled by continuing the loop below), not shown
      // again for the rest of this same month.
      return null;
    }

    // Advance to the next period: this deadline becomes the next period's
    // start, and the next deadline is 4 months later.
    periodStartYear = deadlineYear;
    periodStartMonthIndex0 = deadlineMonthIndex0;
    deadlineMonthIndex0 += 4;
  }

  return null;
};

export default { getActiveVatPeriod };
