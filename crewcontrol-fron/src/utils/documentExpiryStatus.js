// Single source of truth for Passport / Emirates ID expiry status - used by
// the Employees page (table rows + KPI cards, see Employees.jsx) and the
// Home page's Smart Alerts (see dashboardHelpers.js). Mirrors
// backend/src/utils/documentExpiryStatus.util.js, which the KPI counts and
// KPI-click table filter are derived from server-side - both compute the
// same three rules from a plain expiry date so a document's status never
// disagrees between the table, the KPI counts, and Smart Alerts.
//
// Rules:
//   today >= expiryDate                              -> "expired"
//   today <  expiryDate <= today + 1 calendar month   -> "expiring-soon"
//   expiryDate > today + 1 calendar month             -> "valid"
//
// A missing/invalid expiry date returns null - callers decide their own
// pre-existing fallback (the Employees table treats a missing document as
// "expired", Smart Alerts simply skip it - see call sites).

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Calendar-month addition that clamps to the shorter month (e.g. 31 Jan + 1
// month = 28/29 Feb), matching how dayjs/moment's `.add(1, 'month')`
// behaves - NOT plain `Date.setMonth`, which rolls an overflow day into the
// month after (31 Jan -> 3 Mar).
export const addCalendarMonths = (date, months) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const targetMonthIndex = month + months;
  const daysInTargetMonth = new Date(year, targetMonthIndex + 1, 0).getDate();
  return new Date(
    year,
    targetMonthIndex,
    Math.min(day, daysInTargetMonth),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
};

export const getDocumentExpiryStatus = (expiryValue, referenceDate = new Date()) => {
  if (!expiryValue) return null;

  const expiry = new Date(expiryValue);
  if (Number.isNaN(expiry.getTime())) return null;

  const today = startOfDay(referenceDate);
  const expiryDay = startOfDay(expiry);

  if (expiryDay <= today) return "expired";

  const oneMonthFromToday = addCalendarMonths(today, 1);
  if (expiryDay <= oneMonthFromToday) return "expiring-soon";

  return "valid";
};
